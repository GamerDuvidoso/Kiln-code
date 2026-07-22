import { ipcMain } from 'electron'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { getMainWindow } from './windowRef'

// Lazy load node-pty só se conseguir
let pty: any = null
try {
  pty = require('node-pty')
} catch {
  console.warn('node-pty não disponível, terminal desabilitado')
}

type PtyProcess = {
  onData: (cb: (data: string) => void) => void
  onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
}

function spawnPty(cwd: string): PtyProcess | null {
  if (!pty) return null
  const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'
  return pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd,
    env: process.env as Record<string, string>
  })
}

const sessions = new Map<string, PtyProcess>()

/**
 * Encerra todas as sessões de terminal ativas.
 * Deve ser chamado em app.on('before-quit') para não deixar
 * processos de shell órfãos rodando em background.
 */
export function killAllTerminals(): void {
  for (const proc of sessions.values()) {
    try {
      proc.kill()
    } catch {
      // processo já pode ter morrido; ignora
    }
  }
  sessions.clear()
}

export function registerTerminalHandlers(): void {
  ipcMain.handle('terminal:create', (_e, cwd: string): string => {
    const id = randomUUID()
    const proc = spawnPty(cwd)

    if (!proc) {
      throw new Error('Terminal não disponível (node-pty não carregou)')
    }

    sessions.set(id, proc)

    proc.onData((data: string) => {
      getMainWindow()?.webContents.send(`terminal:data:${id}`, data)
    })

    proc.onExit(({ exitCode }) => {
      getMainWindow()?.webContents.send(`terminal:exit:${id}`, exitCode)
      sessions.delete(id)
    })

    return id
  })

  ipcMain.on('terminal:write', (_e, id: string, data: string) => {
    sessions.get(id)?.write(data)
  })

  ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) => {
    sessions.get(id)?.resize(cols, rows)
  })

  ipcMain.on('terminal:dispose', (_e, id: string) => {
    const proc = sessions.get(id)
    if (proc) {
      proc.kill()
      sessions.delete(id)
    }
  })
}
