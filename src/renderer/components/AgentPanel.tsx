import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentEvent,
  AgentRunRequest,
  OllamaModel
} from '../../shared/types'

interface Props {
  workspaceRoot: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function AgentPanel({
  workspaceRoot
}: Props): React.JSX.Element {

  const [models, setModels] = useState<OllamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [prompt, setPrompt] = useState('')

  const [running, setRunning] = useState(false)
  const [systemStats, setSystemStats] = useState<any>(null)

  const [mode, setMode] =
    useState<
      "ask" |
      "code" |
      "plan" |
      "plan+code"
    >("code")


  const [currentThinking, setCurrentThinking] = useState('')
  const [thinkingExpanded, setThinkingExpanded] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)


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
    void refreshModels()
  }, [])

useEffect(() => {

  const timer = setInterval(async () => {

    const stats = await window.kiln.system.stats()

    setSystemStats(stats)

  }, 2000)


  return () => clearInterval(timer)

}, [])


  useEffect(() => {

    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    })

  }, [messages, currentThinking])


  const history = useMemo(
    () =>
      messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
    [messages]
  )

  async function runAgent(): Promise<void> {

    if (!prompt.trim()) return
    if (!selectedModel) return


    const text = prompt.trim()

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text
    }


    const nextHistory = [
      ...history,
      {
        role: 'user' as const,
        content: text
      }
    ]


    setMessages((m) => [
      ...m,
      userMessage
    ])

    setPrompt('')
    setRunning(true)
    setCurrentThinking('')


    const req: AgentRunRequest = {
      runId: crypto.randomUUID(),
      workspaceRoot,
      model: selectedModel,
      history: nextHistory,
      mode
    }


    await window.kiln.agent.run(req)
  }



  useEffect(() => {

    const off = window.kiln.agent.onEvent(
      (event: AgentEvent) => {

        switch (event.type) {


          case 'agent_thinking':

            setCurrentThinking(
              (prev) => prev + event.text
            )

            break



          case 'assistant_text':

            setMessages((old) => [
              ...old,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: event.text
              }
            ])

            break



          case 'run_complete':

            setRunning(false)

            break



          case 'run_error':

            setRunning(false)

            setMessages((old) => [
              ...old,
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `❌ ${event.message}`
              }
            ])

            break

        }

      }
    )


    return off

  }, [])



  function onPromptKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ): void {

    if (
      e.key === 'Enter' &&
      !e.shiftKey
    ) {

      e.preventDefault()

      if (!running) {
        void runAgent()
      }

    }

  }



  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0
      }}
    >

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
          title={
            ollamaOnline
              ? 'Ollama online'
              : 'Ollama offline'
          }
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background:
              ollamaOnline
                ? 'var(--success)'
                : 'var(--danger)'
          }}
        />


        <select
          value={selectedModel}
          onChange={(e) =>
            setSelectedModel(e.target.value)
          }
          style={{
            flex: 1
          }}
        >

          {
            models.length === 0 &&
            <option value="">
              Nenhum modelo
            </option>
          }


          {
            models.map((m) =>
              <option
                key={m.name}
                value={m.name}
              >
                {m.name}
              </option>
            )
          }

        </select>



        <select
          value={mode}
          onChange={(e) =>
            setMode(
              e.target.value as
              | "ask"
              | "code"
              | "plan"
              | "plan+code"
            )
          }
        >

          <option value="ask">
            Ask
          </option>

          <option value="code">
            Code
          </option>

          <option value="plan">
            Plan
          </option>

          <option value="plan+code">
            Plan + Code
          </option>

        </select>

{
  systemStats && (
    <div
      style={{
        fontSize: 11,
        color: 'var(--text-dim)'
      }}
    >
      RAM: {systemStats.ram.percent.toFixed(1)}%
    </div>
  )
}

        <button
          onClick={refreshModels}
          title="Atualizar modelos"
        >
          ↻
        </button>

      </div>
            {/* Histórico */}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
          minHeight: 0
        }}
      >


        {
          (currentThinking || running) &&
          (
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
                onClick={() =>
                  setThinkingExpanded((v) => !v)
                }
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >

                <span>
                  🧠 Raciocínio
                  {
                    running && !currentThinking
                      ? '...'
                      : ''
                  }
                </span>


                <span>
                  {
                    thinkingExpanded
                      ? '▲'
                      : '▼'
                  }
                </span>

              </button>


              {
                thinkingExpanded &&
                (
                  <div
                    style={{
                      padding: '8px 10px',
                      fontSize: 12,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text-dim)',
                      borderTop:
                        '1px solid var(--border)',
                      maxHeight: 260,
                      overflowY: 'auto'
                    }}
                  >

                    {
                      currentThinking ||
                      'Aguardando o modelo começar...'
                    }

                  </div>
                )
              }

            </div>
          )
        }



        {
          messages.map((m) =>
            (
              <div
                key={m.id}
                style={{
                  marginBottom: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',

                  background:
                    m.role === 'user'
                      ? 'var(--accent)'
                      : 'var(--bg-elevated)',

                  color:
                    m.role === 'user'
                      ? '#fff'
                      : 'var(--text)',

                  marginLeft:
                    m.role === 'user'
                      ? 24
                      : 0,

                  marginRight:
                    m.role === 'user'
                      ? 0
                      : 24
                }}
              >

                {m.content}

              </div>
            )
          )
        }



        {
          running &&
          (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-dim)',
                padding: '4px 10px'
              }}
            >

              ⏳ Agente trabalhando...

            </div>
          )
        }


      </div>



      {/* Input */}

      <div
        style={{
          borderTop:
            '1px solid var(--border)',
          padding: 8,
          flexShrink: 0
        }}
      >

        <textarea
          value={prompt}
          onChange={(e) =>
            setPrompt(e.target.value)
          }
          onKeyDown={onPromptKeyDown}
          placeholder="Peça algo ao agente... (Enter envia, Shift+Enter quebra linha)"
          rows={3}
          style={{
            width: '100%',
            resize: 'none',
            marginBottom: 6
          }}
        />


        <button
          className="primary"
          onClick={() =>
            void runAgent()
          }
          disabled={
            running ||
            !prompt.trim() ||
            !selectedModel
          }
          style={{
            width: '100%'
          }}
        >

          {
            running
              ? 'Executando...'
              : 'Enviar'
          }

        </button>

      </div>


    </div>
  )
}