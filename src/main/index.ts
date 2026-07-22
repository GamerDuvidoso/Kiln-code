import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { setMainWindow } from './windowRef'
import { registerFsHandlers } from './fsHandlers'
import { registerGitHandlers } from './gitHandlers'
import { registerOllamaHandlers } from './ollamaHandlers'
import { registerTerminalHandlers } from './terminalHandlers'
import { registerAgentHandlers } from './agentHandlers'
import { registerSystemHandlers } from './systemHandlers'

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  setMainWindow(win)

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerFsHandlers()
  registerGitHandlers()
  registerOllamaHandlers()
  registerTerminalHandlers()
  registerAgentHandlers()
  registerSystemHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
