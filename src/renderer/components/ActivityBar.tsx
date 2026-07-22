export type ActivityView = 'explorer' | 'source-control' | 'terminal'

interface Props {
  active: ActivityView
  onChange: (view: ActivityView) => void
}

const ITEMS: { id: ActivityView; icon: string; label: string }[] = [
  { id: 'explorer', icon: '📁', label: 'Explorer' },
  { id: 'source-control', icon: '⎇', label: 'Source Control' },
  { id: 'terminal', icon: '>_', label: 'Terminal' }
]

export default function ActivityBar({ active, onChange }: Props): React.JSX.Element {
  return (
    <div
      style={{
        width: 48,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        gap: 4
      }}
    >
      {ITEMS.map((item) => (
        <button
          key={item.id}
          title={item.label}
          onClick={() => onChange(item.id)}
          style={{
            width: 36,
            height: 36,
            fontSize: 16,
            background: active === item.id ? 'var(--bg-elevated)' : 'transparent',
            borderLeft: active === item.id ? '2px solid var(--accent)' : '2px solid transparent',
            borderRadius: 0
          }}
        >
          {item.icon}
        </button>
      ))}
    </div>
  )
}
