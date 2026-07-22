import { useEffect, useState, useCallback } from 'react'
import type { GitStatus } from '../../shared/types'

interface Props {
  workspaceRoot: string
  refreshToken: number
}

export default function SourceControlPanel({ workspaceRoot, refreshToken }: Props): React.JSX.Element {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const s = await window.kiln.git.status(workspaceRoot)
      setStatus(s)
    } catch {
      setStatus(null)
    }
  }, [workspaceRoot])

  useEffect(() => {
    refresh()
  }, [refresh, refreshToken])

  async function stage(path: string): Promise<void> {
    await window.kiln.git.stage(workspaceRoot, path)
    refresh()
  }

  async function commit(): Promise<void> {
    if (!message.trim()) return
    setBusy(true)
    try {
      await window.kiln.git.commit(workspaceRoot, message.trim())
      setMessage('')
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="panel-title">Source Control</div>
      <div style={{ padding: '0 10px 10px' }}>
        <textarea
          placeholder="Mensagem do commit"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          style={{ width: '100%', resize: 'vertical', marginBottom: 6 }}
        />
        <button className="primary" onClick={commit} disabled={busy || !message.trim()}>
          Commit
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: '0 10px 4px' }}>
        {status ? `Branch: ${status.branch}` : 'Não é um repositório git'}
      </div>
      {status?.files.map((f) => (
        <div
          key={f.path}
          onClick={() => stage(f.path)}
          title="Clique para stage"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '3px 10px',
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          <span>{f.path}</span>
          <span style={{ color: 'var(--text-dim)' }}>{f.status[0].toUpperCase()}</span>
        </div>
      ))}
    </div>
  )
}
