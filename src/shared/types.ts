// Shared types between main, preload and renderer processes

export interface FsEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface OllamaModel {
  name: string
  size?: number
  modifiedAt?: string
}

export type AgentMode =
  | "ask"
  | "code"
  | "plan"
  | "plan+code"

export interface AgentHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentRunRequest {
  runId: string
  workspaceRoot: string
  model: string
  history: AgentHistoryMessage[]
  mode: AgentMode
}

export type AgentEvent =
  | {
      type: 'agent_thinking'
      runId: string
      text: string
    }
  | {
      type: 'assistant_text'
      runId: string
      text: string
    }
  | {
      type: 'run_complete'
      runId: string
    }
  | {
      type: 'run_error'
      runId: string
      message: string
    }

export interface GitStatusFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
}

export interface GitStatus {
  branch: string
  files: GitStatusFile[]
}

export interface KilnApi {
    system: {
  stats: () => Promise<{
    cpu: {
      usage: number
    }

    ram: {
      used: number
      total: number
      percent: number
    }

    gpu: {
      name: string
      vram?: number
      memoryUsed?: number
    }[]
  }>
}
  fs: {
    readDir: (dirPath: string) => Promise<FsEntry[]>
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<void>
    openFolderDialog: () => Promise<string | null>
    watch: (dirPath: string, cb: (changedPath: string) => void) => () => void
  }

  git: {
    status: (root: string) => Promise<GitStatus>
    stage: (root: string, filePath: string) => Promise<void>
    unstage: (root: string, filePath: string) => Promise<void>
    commit: (root: string, message: string) => Promise<void>
    diff: (root: string, filePath: string) => Promise<string>
  }

  ollama: {
    health: () => Promise<boolean>
    listModels: () => Promise<OllamaModel[]>
  }

  terminal: {
    create: (cwd: string) => Promise<string>
    write: (id: string, data: string) => void
    resize: (id: string, cols: number, rows: number) => void
    onData: (id: string, cb: (data: string) => void) => () => void
    dispose: (id: string) => void
  }

  agent: {
    run: (req: AgentRunRequest) => Promise<void>
    onEvent: (cb: (event: AgentEvent) => void) => () => void
  }
}

declare global {
  interface Window {
    kiln: KilnApi
  }
}