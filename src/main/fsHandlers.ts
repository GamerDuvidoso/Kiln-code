import { ipcMain, dialog } from 'electron'
import { promises as fs, watch as fsWatch } from 'node:fs'
import path from 'node:path'
import type { FsEntry } from '../shared/types'
import { getMainWindow } from './windowRef'

export function registerFsHandlers(): void {
  ipcMain.handle('fs:readDir', async (_e, dirPath: string): Promise<FsEntry[]> => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter((e) => e.name !== 'node_modules' && e.name !== '.git')
      .map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory()
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  })

  ipcMain.handle('fs:readFile', async (_e, filePath: string): Promise<string> => {
    return fs.readFile(filePath, 'utf-8')
  })

  ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string): Promise<void> => {
    await fs.writeFile(filePath, content, 'utf-8')
  })

  ipcMain.handle('fs:openFolderDialog', async (): Promise<string | null> => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.on('fs:watchStart', (event, dirPath: string, watchId: string) => {
    const watcher = fsWatch(dirPath, { recursive: true }, (_evt, filename) => {
      if (!filename) return
      event.sender.send(`fs:watchEvent:${watchId}`, path.join(dirPath, filename.toString()))
    })
    ipcMain.once(`fs:watchStop:${watchId}`, () => watcher.close())
  })
}
