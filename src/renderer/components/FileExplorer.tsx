import { useEffect, useState, useCallback } from 'react'
import type { FsEntry } from '../../shared/types'
import { fileNameForPath } from '../lib/language'

interface Props {
  workspaceRoot: string
  activePath: string | null
  onOpenFile: (path: string) => void
  refreshToken: number
}

interface TreeNodeState {
  expanded: boolean
  children: FsEntry[] | null
}

export default function FileExplorer({
  workspaceRoot,
  activePath,
  onOpenFile,
  refreshToken
}: Props): React.JSX.Element {
  const [rootEntries, setRootEntries] = useState<FsEntry[]>([])
  const [nodeState, setNodeState] = useState<Record<string, TreeNodeState>>({})

  const loadDir = useCallback(async (dirPath: string): Promise<FsEntry[]> => {
    return window.kiln.fs.readDir(dirPath)
  }, [])

  useEffect(() => {
    loadDir(workspaceRoot).then(setRootEntries)
    setNodeState({})
  }, [workspaceRoot, refreshToken, loadDir])

  async function toggleDir(entry: FsEntry): Promise<void> {
    const current = nodeState[entry.path]
    if (current?.expanded) {
      setNodeState((s) => ({ ...s, [entry.path]: { ...current, expanded: false } }))
      return
    }
    const children = current?.children ?? (await loadDir(entry.path))
    setNodeState((s) => ({
      ...s,
      [entry.path]: { expanded: true, children }
    }))
  }

  function renderEntry(entry: FsEntry, depth: number): React.JSX.Element {
    const state = nodeState[entry.path]
    const isActive = entry.path === activePath

    return (
      <div key={entry.path}>
        <div
          onClick={() => (entry.isDirectory ? toggleDir(entry) : onOpenFile(entry.path))}
          style={{
            paddingLeft: 10 + depth * 14,
            paddingTop: 3,
            paddingBottom: 3,
            fontSize: 12.5,
            cursor: 'pointer',
            background: isActive ? 'var(--bg-elevated)' : 'transparent',
            color: isActive ? 'var(--text)' : 'var(--text-dim)',
            whiteSpace: 'nowrap',
            userSelect: 'none'
          }}
        >
          {entry.isDirectory ? (state?.expanded ? '▾ 📂 ' : '▸ 📁 ') : '　📄 '}
          {fileNameForPath(entry.path)}
        </div>
        {entry.isDirectory &&
          state?.expanded &&
          state.children?.map((child) => renderEntry(child, depth + 1))}
      </div>
    )
  }

  return (
    <div>
      <div className="panel-title">Explorer</div>
      <div>{rootEntries.map((entry) => renderEntry(entry, 0))}</div>
    </div>
  )
}
