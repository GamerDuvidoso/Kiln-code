import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

interface Props {
  workspaceRoot: string
}

export default function TerminalPanel({ workspaceRoot }: Props): React.JSX.Element {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!terminalRef.current) return

    // Criar terminal xterm
    const term = new Terminal({
      cols: 80,
      rows: 24,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4'
      }
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    termRef.current = term

    // Conectar ao WebSocket server
    const ws = new WebSocket('ws://127.0.0.1:9001')

    ws.onopen = () => {
      setConnected(true)
      term.write('Conectado ao terminal...\r\n')
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'data') {
          term.write(msg.payload)
        } else if (msg.type === 'error') {
          term.write(`\r\n❌ ${msg.message}\r\n`)
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e)
      }
    }

    ws.onerror = () => {
      setConnected(false)
      term.write('\r\n❌ Desconectado do servidor\r\n')
    }

    ws.onclose = () => {
      setConnected(false)
    }

    wsRef.current = ws

    // Input do terminal
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    // Resize
    const handleResize = () => {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows
        }))
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
      ws.close()
    }
  }, [workspaceRoot])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 220,
        borderTop: '1px solid var(--border)',
        background: '#0c0c0c',
        position: 'relative'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: 8,
          fontSize: 11,
          color: connected ? '#4caf50' : '#f14c4c',
          zIndex: 10
        }}
      >
        {connected ? '● Conectado' : '● Desconectado'}
      </div>
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          fontFamily: 'var(--font-mono)',
          fontSize: 12
        }}
      />
    </div>
  )
}
