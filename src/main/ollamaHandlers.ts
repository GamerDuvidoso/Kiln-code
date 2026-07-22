import { ipcMain } from 'electron'
import type { OllamaModel } from '../shared/types'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'

export function registerOllamaHandlers(): void {
  ipcMain.handle('ollama:health', async (): Promise<boolean> => {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
      return res.ok
    } catch {
      return false
    }
  })

  ipcMain.handle('ollama:listModels', async (): Promise<OllamaModel[]> => {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`)
      if (!res.ok) return []
      const data = (await res.json()) as {
        models: { name: string; size?: number; modified_at?: string }[]
      }
      return data.models.map((m) => ({
        name: m.name,
        size: m.size,
        modifiedAt: m.modified_at
      }))
    } catch {
      return []
    }
  })
}

export { OLLAMA_BASE_URL }
