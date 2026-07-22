import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  AgentEvent,
  AgentRunRequest,
  AgentToolName
} from '../shared/types'
import { getMainWindow } from './windowRef'
import { OLLAMA_BASE_URL } from './ollamaHandlers'

interface PendingApprovalEntry {
  resolve: (approved: boolean) => void
}

const pendingApprovals = new Map<string, PendingApprovalEntry>()

function send(event: AgentEvent): void {
  getMainWindow()?.webContents.send('agent:event', event)
}

const SYSTEM_PROMPT = `You are Kiln, a local coding agent running inside a desktop code editor.
You can read and write files in the user's workspace and run shell commands when asked.
Always explain briefly what you are about to do before doing it.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file relative to the workspace root',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write (create or overwrite) a file relative to the workspace root',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and folders in a directory relative to the workspace root',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      }
    }
  }
]

async function runTool(
  workspaceRoot: string,
  tool: AgentToolName,
  args: any
): Promise<{ result: unknown; preview?: { path: string; before: string; after: string } }> {
  const resolved = path.join(workspaceRoot, args.path ?? '.')

  if (tool === 'read_file') {
    const content = await fs.readFile(resolved, 'utf-8')
    return { result: content }
  }

  if (tool === 'list_dir') {
    const entries = await fs.readdir(resolved, { withFileTypes: true })
    return { result: entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() })) }
  }

  if (tool === 'write_file') {
    let before = ''
    try {
      before = await fs.readFile(resolved, 'utf-8')
    } catch {
      before = ''
    }
    await fs.mkdir(path.dirname(resolved), { recursive: true })
    await fs.writeFile(resolved, args.content, 'utf-8')
    return {
      result: 'ok',
      preview: { path: args.path, before, after: args.content }
    }
  }

  throw new Error(`Unknown tool: ${tool}`)
}

async function requestApproval(
  runId: string,
  callId: string,
  tool: AgentToolName,
  args: unknown,
  preview?: { path: string; before: string; after: string }
): Promise<boolean> {
  return new Promise((resolve) => {
    pendingApprovals.set(callId, { resolve })
    send({ type: 'approval_requested', runId, callId, tool, args, preview })
  })
}

export function registerAgentHandlers(): void {
  ipcMain.handle('agent:run', async (_e, req: AgentRunRequest): Promise<void> => {
    const { runId, workspaceRoot, model, autoApprove } = req
    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...req.history
    ]

    try {
      // Loop to allow multiple rounds of tool calls
      for (let round = 0; round < 8; round++) {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            tools: TOOLS,
            stream: false,
            // Ativa o raciocínio nos modelos que suportam (deepseek-r1,
            // qwen3, gpt-oss, etc). Modelos sem suporte simplesmente
            // ignoram este campo e não retornam `message.thinking`.
            think: true
          })
        })

        if (!res.ok) {
          throw new Error(`Ollama respondeu com status ${res.status}`)
        }

        const data = await res.json()
        const message = data.message

        // O raciocínio vem separado do conteúdo final pelo próprio Ollama.
        // Emitimos como um evento à parte — é só apresentação, não entra
        // no histórico enviado de volta ao modelo (ver `messages.push` logo
        // abaixo, que usa `message` original sem alteração nenhuma).
        if (message?.thinking) {
          send({ type: 'agent_thinking', runId, text: message.thinking })
        }

        if (message?.content) {
          send({ type: 'assistant_text', runId, text: message.content })
        }
        messages.push(message)

        const toolCalls = message?.tool_calls as
          | { function: { name: AgentToolName; arguments: any } }[]
          | undefined

        if (!toolCalls || toolCalls.length === 0) {
          break
        }

        for (const call of toolCalls) {
          const callId = randomUUID()
          const toolName = call.function.name
          const args = call.function.arguments

          send({ type: 'tool_call_start', runId, callId, tool: toolName })

          if (toolName === 'write_file' && !autoApprove) {
            let before = ''
            try {
              before = await fs.readFile(path.join(workspaceRoot, args.path), 'utf-8')
            } catch {
              before = ''
            }
            const approved = await requestApproval(runId, callId, toolName, args, {
              path: args.path,
              before,
              after: args.content
            })
            if (!approved) {
              messages.push({
                role: 'tool',
                content: 'O usuário rejeitou esta alteração.'
              })
              continue
            }
          }

          const { result, preview } = await runTool(workspaceRoot, toolName, args)
          send({ type: 'tool_call_result', runId, callId, result })
          if (preview) {
            // no-op: preview already sent for approval path; kept for auto-approve UI hints
          }
          messages.push({
            role: 'tool',
            content: typeof result === 'string' ? result : JSON.stringify(result)
          })
        }
      }

      send({ type: 'run_complete', runId })
    } catch (err) {
      send({
        type: 'run_error',
        runId,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  })

  ipcMain.handle(
    'agent:respondApproval',
    async (_e, callId: string, approved: boolean): Promise<void> => {
      const entry = pendingApprovals.get(callId)
      if (entry) {
        entry.resolve(approved)
        pendingApprovals.delete(callId)
      }
    }
  )
}