interface Props {
  workspaceRoot: string | null
  model: string
  ollamaOnline: boolean | null
}

export default function StatusBar({ workspaceRoot, model, ollamaOnline }: Props): React.JSX.Element {
  return (
    <div
      style={{
        height: 24,
        background: 'var(--accent)',
        color: 'var(--accent-text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        fontSize: 11.5,
        fontWeight: 600
      }}
    >
      <span>{workspaceRoot ?? 'Nenhuma pasta aberta'}</span>
      <span>{ollamaOnline === false ? 'Ollama offline' : `Modelo: ${model || '—'}`}</span>
    </div>
  )
}
