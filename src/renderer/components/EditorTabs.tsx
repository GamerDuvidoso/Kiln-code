import { fileNameForPath } from '../lib/language'

export interface OpenFile {
  path: string
  dirty: boolean
}

interface Props {
  openFiles: OpenFile[]
  activePath: string | null
  onSelect: (path: string) => void
  onClose: (path: string) => void
}

export default function EditorTabs({
  openFiles,
  activePath,
  onSelect,
  onClose
}: Props): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
        flexShrink: 0
      }}
    >
      {openFiles.map((file) => {
        const isActive = file.path === activePath
        return (
          <div
            key={file.path}
            onClick={() => onSelect(file.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
              background: isActive ? 'var(--bg)' : 'transparent',
              borderRight: '1px solid var(--border)',
              borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              color: isActive ? 'var(--text)' : 'var(--text-dim)',
              whiteSpace: 'nowrap'
            }}
          >
            <span>{fileNameForPath(file.path)}</span>
            {file.dirty && <span style={{ color: 'var(--accent)' }}>●</span>}
            <span
              onClick={(e) => {
                e.stopPropagation()
                onClose(file.path)
              }}
              style={{ opacity: 0.6, marginLeft: 2 }}
            >
              ×
            </span>
          </div>
        )
      })}
    </div>
  )
}
