import { useEffect, useMemo, useRef, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import type {
  AgentEvent,
  AgentRunRequest,
  OllamaModel,
  AgentToolName
} from '../../shared/types'
import { languageForPath } from '../lib/language'

interface Props {
  workspaceRoot: string
  onExternalFileChange: (path: string) => Promise<void>
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface PendingApproval {
  callId: string
  tool: AgentToolName
  args: unknown
  preview?: {
    path: string
    before: string
    after: string
  }
}

export default function AgentPanel({
  workspaceRoot,
  onExternalFileChange
}: Props): React.JSX.Element {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [prompt, setPrompt] = useState('')

  const [running, setRunning] = useState(false)
  const [autoApprove, setAutoApprove] = useState(false)

  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null)

  // ---- Raciocínio (thinking) do turno atual ----
  const [currentThinking, setCurrentThinking] = useState('')
  const [thinkingExpanded, setThinkingExpanded] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  // ---- Carregar modelos automaticamente ----
  async function refreshModels(): Promise<void> {
    try {
      const online = await window.kiln.ollama.health()
      setOllamaOnline(online)

      if (!online) {
        setModels([])
        return
      }

      const list = await window.kiln.ollama.listModels()
      setModels(list)

      if (!selectedModel && list.length > 0) {
        setSelectedModel(list[0].name)
      }
    } catch {
      setOllamaOnline(false)
    }
  }

  useEffect(() => {
    refreshModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Scroll automático ----
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    })
  }, [messages, pendingApproval, currentThinking])

  // ---- Histórico para enviar ao modelo ----
  const history = useMemo(
    () =>
      messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
    [messages]
  )

  // ---- Executar agente ----
  async function runAgent(): Promise<void> {
    if (!prompt.trim()) return
    if (!selectedModel) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt.trim()
    }

    const nextHistory = [
      ...history,
      {
        role: 'user' as const,
        content: prompt.trim()
      }
    ]

    setMessages((m) => [...m, userMessage])
    setPrompt('')
    setRunning(true)
    // Limpa o raciocínio do turno anterior — senão ele fica colado no
    // próximo turno, misturando duas respostas diferentes no mesmo bloco.
    setCurrentThinking('')

    const req: AgentRunRequest = {
      runId: crypto.randomUUID(),
      workspaceRoot,
      model: selectedModel,
      history: nextHistory,
      autoApprove
    }

    await window.kiln.agent.run(req)
  }

  // ---- Listener dos eventos do agente ----
  useEffect(() => {
    const off = window.kiln.agent.onEvent(async (event: AgentEvent) => {
      switch (event.type) {
        case 'agent_thinking':
          setCurrentThinking((prev) => prev + event.text)
          break

        case 'assistant_text':
          setMessages((old) => [
            ...old,
            { id: crypto.randomUUID(), role: 'assistant', content: event.text }
          ])
          break

        case 'approval_requested':
          setPendingApproval({
            callId: event.callId,
            tool: event.tool,
            args: event.args,
            preview: event.preview
          })
          break

        case 'tool_call_start':
          setMessages((old) => [
            ...old,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `🔧 Executando ferramenta: ${event.tool}`
            }
          ])
          break

        case 'tool_call_result':
          setMessages((old) => [
            ...old,
            { id: crypto.randomUUID(), role: 'assistant', content: '✅ Ferramenta executada.' }
          ])
          break

        case 'run_complete':
          setRunning(false)
          break

        case 'run_error':
          setRunning(false)
          setMessages((old) => [
            ...old,
            { id: crypto.randomUUID(), role: 'assistant', content: `❌ ${event.message}` }
          ])
          break
      }
    })

    return off
  }, [])

  // ---- Aprovar alteração ----
  async function approve(): Promise<void> {
    if (!pendingApproval) return

    await window.kiln.agent.respondApproval(pendingApproval.callId, true)

    if (pendingApproval.preview) {
      await onExternalFileChange(pendingApproval.preview.path)
    }

    setPendingApproval(null)
  }

  // ---- Rejeitar ----
  async function reject(): Promise<void> {
    if (!pendingApproval) return
    await window.kiln.agent.respondApproval(pendingApproval.callId, false)
    setPendingApproval(null)
  }

  // ---- Enter envia mensagem ----
  function onPromptKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!running) void runAgent()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}
      >
        <span
          title={ollamaOnline ? 'Ollama online' : 'Ollama offline'}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: ollamaOnline ? 'var(--success)' : 'var(--danger)',
            flexShrink: 0
          }}
        />
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          style={{ flex: 1 }}
        >
          {models.length === 0 && <option value="">Nenhum modelo</option>}
          {models.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
        <button onClick={refreshModels} title="Atualizar modelos">
          ↻
        </button>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          fontSize: 12,
          color: 'var(--text-dim)',
          flexShrink: 0
        }}
      >
        <input
          type="checkbox"
          checked={autoApprove}
          onChange={(e) => setAutoApprove(e.target.checked)}
          style={{ width: 'auto' }}
        />
        Auto Approve
      </label>

      {/* Histórico de chat */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', minHeight: 0 }}>
        {/* Bloco de raciocínio — colapsável, some quando vazio */}
        {(currentThinking || running) && (
          <div
            style={{
              marginBottom: 10,
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              overflow: 'hidden'
            }}
          >
            <button
              onClick={() => setThinkingExpanded((v) => !v)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                fontSize: 12,
                color: 'var(--text-dim)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <span>🧠 Raciocínio{running && !currentThinking ? '...' : ''}</span>
              <span>{thinkingExpanded ? '▲' : '▼'}</span>
            </button>
            {thinkingExpanded && (
              <div
                style={{
                  padding: '8px 10px',
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-dim)',
                  borderTop: '1px solid var(--border)',
                  maxHeight: 260,
                  overflowY: 'auto'
                }}
              >
                {currentThinking || 'Aguardando o modelo começar a pensar...'}
              </div>
            )}
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              marginBottom: 10,
              padding: '8px 10px',
              borderRadius: 6,
              fontSize: 12.5,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
              marginLeft: m.role === 'user' ? 24 : 0,
              marginRight: m.role === 'user' ? 0 : 24
            }}
          >
            {m.content}
          </div>
        ))}

        {running && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '4px 10px' }}>
            ⏳ Agente trabalhando...
          </div>
        )}

        {/* Tela de aprovação com diff */}
        {pendingApproval && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 6,
              overflow: 'hidden',
              marginTop: 8
            }}
          >
            <div style={{ padding: '6px 10px', fontSize: 12, background: 'var(--bg-elevated)' }}>
              Aprovar alteração em <strong>{pendingApproval.preview?.path ?? '—'}</strong>?
            </div>
            {pendingApproval.preview && (
              <DiffEditor
                height="220px"
                theme="vs-dark"
                original={pendingApproval.preview.before}
                modified={pendingApproval.preview.after}
                language={languageForPath(pendingApproval.preview.path)}
                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, padding: 8, justifyContent: 'flex-end' }}>
              <button onClick={reject}>Rejeitar</button>
              <button className="primary" onClick={approve}>
                Aprovar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Input do prompt */}
      <div style={{ borderTop: '1px solid var(--border)', padding: 8, flexShrink: 0 }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onPromptKeyDown}
          placeholder="Peça algo ao agente... (Enter envia, Shift+Enter quebra linha)"
          rows={3}
          style={{ width: '100%', resize: 'none', marginBottom: 6 }}
        />
        <button
          className="primary"
          onClick={() => void runAgent()}
          disabled={running || !prompt.trim() || !selectedModel}
          style={{ width: '100%' }}
        >
          {running ? 'Executando...' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}