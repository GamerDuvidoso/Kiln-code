import { randomUUID } from 'node:crypto'
import type { AgentEvent, AgentRunRequest, KilnApi } from '../shared/types'

import { contextBridge, ipcRenderer } from 'electron'


const kilnApi = {

  system: {
    stats: () =>
      ipcRenderer.invoke('system:stats')
  },


  fs: {
    readDir: (dirPath) =>
      ipcRenderer.invoke('fs:readDir', dirPath),

    readFile: (filePath) =>
      ipcRenderer.invoke('fs:readFile', filePath),

    writeFile: (filePath, content) =>
      ipcRenderer.invoke('fs:writeFile', filePath, content),

    openFolderDialog: () =>
      ipcRenderer.invoke('fs:openFolderDialog'),

    watch: (dirPath, cb) => {

      const watchId = randomUUID()

      const channel = `fs:watchEvent:${watchId}`

      const listener = (
        _e: unknown,
        changedPath: string
      ) => cb(changedPath)


      ipcRenderer.on(channel, listener)

      ipcRenderer.send(
        'fs:watchStart',
        dirPath,
        watchId
      )


      return () => {

        ipcRenderer.removeListener(
          channel,
          listener
        )

        ipcRenderer.send(
          'fs:watchStop'
        )

      }
    }
  },


  git: {

    status: (root) =>
      ipcRenderer.invoke(
        'git:status',
        root
      ),

    stage: (root, filePath) =>
      ipcRenderer.invoke(
        'git:stage',
        root,
        filePath
      ),

    unstage: (root, filePath) =>
      ipcRenderer.invoke(
        'git:unstage',
        root,
        filePath
      ),

    commit: (root, message) =>
      ipcRenderer.invoke(
        'git:commit',
        root,
        message
      ),

    diff: (root, filePath) =>
      ipcRenderer.invoke(
        'git:diff',
        root,
        filePath
      )

  },


  ollama: {

    health: () =>
      ipcRenderer.invoke(
        'ollama:health'
      ),

    listModels: () =>
      ipcRenderer.invoke(
        'ollama:listModels'
      )

  },


  terminal: {

    create: (cwd) =>
      ipcRenderer.invoke(
        'terminal:create',
        cwd
      ),


    write: (id, data) =>
      ipcRenderer.send(
        'terminal:write',
        id,
        data
      ),


    resize: (id, cols, rows) =>
      ipcRenderer.send(
        'terminal:resize',
        id,
        cols,
        rows
      ),


    onData: (id, cb) => {

      const channel = `terminal:data:${id}`


      const listener = (
        _e: unknown,
        data: string
      ) => cb(data)


      ipcRenderer.on(
        channel,
        listener
      )


      return () =>
        ipcRenderer.removeListener(
          channel,
          listener
        )

    },


    dispose: (id) =>
      ipcRenderer.send(
        'terminal:dispose',
        id
      )

  },


  agent: {

    run: (req: AgentRunRequest) =>
      ipcRenderer.invoke(
        'agent:run',
        req
      ),


    respondApproval: (
      callId: string,
      approved: boolean
    ) =>
      ipcRenderer.invoke(
        'agent:respondApproval',
        callId,
        approved
      ),


    onEvent: (
      cb: (event: AgentEvent) => void
    ) => {

      const listener = (
        _e: unknown,
        event: AgentEvent
      ) => cb(event)


      ipcRenderer.on(
        'agent:event',
        listener
      )


      return () =>
        ipcRenderer.removeListener(
          'agent:event',
          listener
        )

    }

  } as any

}


contextBridge.exposeInMainWorld(
  'kiln',
  kilnApi
)