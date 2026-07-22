import type { SystemStats } from '../../shared/types'

interface Props {
  workspaceRoot: string | null
  model: string
  ollamaOnline: boolean | null
  stats: SystemStats | null
}

export default function StatusBar({
  workspaceRoot,
  model,
  ollamaOnline,
  stats
}: Props): React.JSX.Element {

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

      <span>
        {workspaceRoot ?? 'Nenhuma pasta aberta'}
      </span>


      <span>

        {
          stats && (
            <>
              CPU: {stats.cpu}% |{' '}

              RAM: {
                Math.round(
                  (stats.ram.used / stats.ram.total) * 100
                )
              }% |{' '}

              GPU: {
                stats.gpu?.name ?? 'N/A'
              }

              {' | '}
            </>
          )
        }


        {
          ollamaOnline === false
            ? 'Ollama offline'
            : `Modelo: ${model || '—'}`
        }

      </span>

    </div>
  )
}