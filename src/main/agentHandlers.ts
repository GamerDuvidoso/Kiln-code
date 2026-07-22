import { ipcMain } from 'electron'
import { AGENT_MODES } from "../shared/agentModes"
import type {
  AgentEvent,
  AgentRunRequest
} from '../shared/types'
import { getMainWindow } from './windowRef'
import { OLLAMA_BASE_URL } from './ollamaHandlers'


function send(event: AgentEvent): void {
  getMainWindow()?.webContents.send('agent:event', event)
}


export function registerAgentHandlers(): void {

  ipcMain.handle(
    'agent:run',
    async (_e, req: AgentRunRequest): Promise<void> => {

      const {
        runId,
        model,
        mode
      } = req


      console.log("========== AGENT ==========")
      console.log("req =", req)
      console.log("mode =", mode)


      const config =
        AGENT_MODES[mode as keyof typeof AGENT_MODES]


      console.log("config =", config)


      if (!config) {
        throw new Error(`Modo inválido: ${String(mode)}`)
      }


      const messages = [
        {
          role: 'system',
          content: config.prompt
        },
        ...req.history
      ]


      async function chatWithOllama(requestBody: unknown): Promise<any> {

    console.log("ANTES DO FETCH")

    const fetchFn = (globalThis as any).fetch

    if (typeof fetchFn !== 'function') {
      throw new Error('fetch não disponível')
    }

  const res = await fetchFn(`${OLLAMA_BASE_URL}/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(requestBody)
})


if (!res.ok) {
  const error = await res.text()

  throw new Error(
    `Ollama error ${res.status}: ${error}`
  )
}


console.log("FETCH TERMINOU")
console.log("STATUS:", res.status)


  const json = await res.json()


  console.log("JSON:", json)


  return json
}


      try {

        const data = await chatWithOllama({
          model: model ?? "qwen3:4b",
          messages,
          stream: false
        })


        const message = data.message

    console.log("MESSAGE:", message)

        if (!message) {
          throw new Error(
            'Resposta inválida do Ollama'
          )
        }


        if (message.thinking) {

          send({
            type: 'agent_thinking',
            runId,
            text: message.thinking
          })

        }


        if (message.content) {

          send({
            type: 'assistant_text',
            runId,
            text: message.content
          })

        }


        send({
          type: 'run_complete',
          runId
        })


      } catch (err) {

        send({
          type: 'run_error',
          runId,
          message:
            err instanceof Error
              ? err.message
              : String(err)
        })

      }

    }
  )

}