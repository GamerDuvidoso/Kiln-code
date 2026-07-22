import { ipcMain, app } from 'electron'
import { Server as WebSocketServer } from 'ws'
import os from 'node:os'
import { randomUUID } from 'node:crypto'

// Lazy load node-pty só se conseguir
let pty: any = null
try {
  pty = require('node-pty')
} catch {
  console.warn('node-pty não disponível, terminal desabilitado')
}

type PtyProcess = {
  onData: (cb: (data: string) => void) => void
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
let wss: WebSocketServer | null = null

export function registerTerminalHandlers(): void {
  // Criar WebSocket server na porta 9001
  if (!wss) {
    wss = new WebSocketServer({ port: 9001 })
    console.log('WebSocket server rodando na porta 9001')

    wss.on('connection', (ws) => {
      const termId = randomUUID()
      const proc = spawnPty(app.getPath('home'))

      if (!proc) {
        ws.send(JSON.stringify({ type: 'error', message: 'Terminal não disponível' }))
        ws.close()
        return
      }

      sessions.set(termId, proc)

      ws.send(JSON.stringify({ type: 'ready', id: termId }))

      proc.onData((data: string) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'data', id: termId, payload: data }))
        }
      })

      ws.on('message', (msg: string) => {
        try {
          const parsed = JSON.parse(msg)
          if (parsed.type === 'input') {
            proc.write(parsed.data)
          } else if (parsed.type === 'resize') {
            proc.resize(parsed.cols, parsed.rows)
          }
        } catch (e) {
          console.error('Error parsing terminal message:', e)
        }
      })

      ws.on('close', () => {
        proc.kill()
        sessions.delete(termId)
      })
    })
  }

  // Manter compatibility com código antigo (não vai usar)
  ipcMain.handle('terminal:create', (): string => {
    return randomUUID()
  })

  ipcMain.on('terminal:write', () => {
    // No-op com WebSocket
  })

  ipcMain.on('terminal:resize', () => {
    // No-op com WebSocket
  })

  ipcMain.on('terminal:dispose', () => {
    // No-op com WebSocket
  })
}
