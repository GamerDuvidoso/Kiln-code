import { useCallback, useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import ActivityBar, { type ActivityView } from './components/ActivityBar'
import FileExplorer from './components/FileExplorer'
import SourceControlPanel from './components/SourceControlPanel'
import TerminalPanel from './components/TerminalPanel'
import EditorTabs, { type OpenFile } from './components/EditorTabs'
import StatusBar from './components/StatusBar'
import AgentPanel from './components/AgentPanel'
// AgentPanel's props type may not include onExternalFileChange in some builds;
// cast to any when rendering so we can pass the callback without changing
// the component file.
const AgentPanelAny = AgentPanel as unknown as (props: any) => React.JSX.Element
import { languageForPath } from './lib/language'
import type { SystemStats } from '../shared/types'

export default function App(): React.JSX.Element {
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  const [activityView, setActivityView] = useState<ActivityView>('explorer')

  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [fileContents, setFileContents] = useState<Record<string, string>>({})

  const [explorerRefreshToken, setExplorerRefreshToken] = useState(0)
  const [gitRefreshToken, setGitRefreshToken] = useState(0)

  const [status, setStatus] = useState<SystemStats | null>(null)
const [ollamaOnline] = useState<boolean | null>(null)
const [currentModel] = useState('')

useEffect(() => {
  const timer = setInterval(async () => {
    try {
      const data = await window.kiln.system.stats()
      setStatus(data)
    } catch (err) {
      console.error('Erro ao pegar stats:', err)
    }
  }, 2000)

  return () => clearInterval(timer)
}, [])

  async function openFolder(): Promise<void> {
    const dir = await window.kiln.fs.openFolderDialog()
    if (dir) setWorkspaceRoot(dir)
  }

  async function openFile(path: string): Promise<void> {
    if (!fileContents[path]) {
      const content = await window.kiln.fs.readFile(path)
      setFileContents((c) => ({ ...c, [path]: content }))
    }
    setOpenFiles((files) =>
      files.some((f) => f.path === path) ? files : [...files, { path, dirty: false }]
    )
    setActivePath(path)
  }

  function closeFile(path: string): void {
    setOpenFiles((files) => files.filter((f) => f.path !== path))
    if (activePath === path) {
      setOpenFiles((files) => {
        const remaining = files.filter((f) => f.path !== path)
        setActivePath(remaining.length > 0 ? remaining[remaining.length - 1].path : null)
        return remaining
      })
    }
  }

  async function saveActiveFile(): Promise<void> {
    if (!activePath) return
    const content = fileContents[activePath] ?? ''
    await window.kiln.fs.writeFile(activePath, content)
    setOpenFiles((files) =>
      files.map((f) => (f.path === activePath ? { ...f, dirty: false } : f))
    )
    setGitRefreshToken((t) => t + 1)
  }

  // Called by AgentPanel when a file it wrote is currently open, so the
  // editor and explorer/git panels reflect the agent's changes.
  const onExternalFileChange = useCallback(
    async (path: string) => {
      if (!workspaceRoot) return
      const absolute = path.startsWith(workspaceRoot) ? path : `${workspaceRoot}/${path}`
      try {
        const content = await window.kiln.fs.readFile(absolute)
        setFileContents((c) => ({ ...c, [absolute]: content }))
      } catch {
        // file may have been deleted
      }
      setExplorerRefreshToken((t) => t + 1)
      setGitRefreshToken((t) => t + 1)
    },
    [workspaceRoot]
  )

  if (!workspaceRoot) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12
        }}
      >
        <h1 style={{ fontWeight: 500 }}>Kiln</h1>
        <button className="primary" onClick={openFolder}>
          Abrir pasta
        </button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="app-body">
        <ActivityBar active={activityView} onChange={setActivityView} />

        <div className="sidebar">
          {activityView === 'explorer' && (
            <FileExplorer
              workspaceRoot={workspaceRoot}
              activePath={activePath}
              onOpenFile={openFile}
              refreshToken={explorerRefreshToken}
            />
          )}
          {activityView === 'source-control' && (
            <SourceControlPanel workspaceRoot={workspaceRoot} refreshToken={gitRefreshToken} />
          )}
          {activityView === 'terminal' && <div className="panel-title">Use o painel inferior</div>}
        </div>

        <div className="main-column">
          <EditorTabs
            openFiles={openFiles}
            activePath={activePath}
            onSelect={setActivePath}
            onClose={closeFile}
          />

          <div style={{ flex: 1, minHeight: 0 }}>
            {activePath ? (
              <Editor
                height="100%"
                theme="vs-dark"
                path={activePath}
                language={languageForPath(activePath)}
                value={fileContents[activePath] ?? ''}
                onChange={(value) => {
                  setFileContents((c) => ({ ...c, [activePath]: value ?? '' }))
                  setOpenFiles((files) =>
                    files.map((f) => (f.path === activePath ? { ...f, dirty: true } : f))
                  )
                }}
                onMount={(editor) => {
                  editor.addCommand(
                    // Ctrl/Cmd+S
                    (window as any).monaco?.KeyMod.CtrlCmd | (window as any).monaco?.KeyCode.KeyS,
                    () => void saveActiveFile()
                  )
                }}
                options={{ fontSize: 13, minimap: { enabled: true } }}
              />
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-dim)'
                }}
              >
                Nenhum arquivo aberto
              </div>
            )}
          </div>

          {activityView === 'terminal' && <TerminalPanel workspaceRoot={workspaceRoot} />}
        </div>

        <div className="agent-column">
          <AgentPanelAny workspaceRoot={workspaceRoot} onExternalFileChange={onExternalFileChange} />
        </div>
      </div>

      <StatusBar 
      workspaceRoot={workspaceRoot} 
      model={currentModel} 
      ollamaOnline={ollamaOnline} 
      stats={status} />
    </div>
  )
}
