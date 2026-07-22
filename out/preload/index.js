"use strict";
const node_crypto = require("node:crypto");
const electron = require("electron");
const kilnApi = {
  system: {
    stats: () => electron.ipcRenderer.invoke("system:stats")
  },
  fs: {
    readDir: (dirPath) => electron.ipcRenderer.invoke("fs:readDir", dirPath),
    readFile: (filePath) => electron.ipcRenderer.invoke("fs:readFile", filePath),
    writeFile: (filePath, content) => electron.ipcRenderer.invoke("fs:writeFile", filePath, content),
    openFolderDialog: () => electron.ipcRenderer.invoke("fs:openFolderDialog"),
    watch: (dirPath, cb) => {
      const watchId = node_crypto.randomUUID();
      const channel = `fs:watchEvent:${watchId}`;
      const listener = (_e, changedPath) => cb(changedPath);
      electron.ipcRenderer.on(channel, listener);
      electron.ipcRenderer.send(
        "fs:watchStart",
        dirPath,
        watchId
      );
      return () => {
        electron.ipcRenderer.removeListener(
          channel,
          listener
        );
        electron.ipcRenderer.send(
          "fs:watchStop"
        );
      };
    }
  },
  git: {
    status: (root) => electron.ipcRenderer.invoke(
      "git:status",
      root
    ),
    stage: (root, filePath) => electron.ipcRenderer.invoke(
      "git:stage",
      root,
      filePath
    ),
    unstage: (root, filePath) => electron.ipcRenderer.invoke(
      "git:unstage",
      root,
      filePath
    ),
    commit: (root, message) => electron.ipcRenderer.invoke(
      "git:commit",
      root,
      message
    ),
    diff: (root, filePath) => electron.ipcRenderer.invoke(
      "git:diff",
      root,
      filePath
    )
  },
  ollama: {
    health: () => electron.ipcRenderer.invoke(
      "ollama:health"
    ),
    listModels: () => electron.ipcRenderer.invoke(
      "ollama:listModels"
    )
  },
  terminal: {
    create: (cwd) => electron.ipcRenderer.invoke(
      "terminal:create",
      cwd
    ),
    write: (id, data) => electron.ipcRenderer.send(
      "terminal:write",
      id,
      data
    ),
    resize: (id, cols, rows) => electron.ipcRenderer.send(
      "terminal:resize",
      id,
      cols,
      rows
    ),
    onData: (id, cb) => {
      const channel = `terminal:data:${id}`;
      const listener = (_e, data) => cb(data);
      electron.ipcRenderer.on(
        channel,
        listener
      );
      return () => electron.ipcRenderer.removeListener(
        channel,
        listener
      );
    },
    dispose: (id) => electron.ipcRenderer.send(
      "terminal:dispose",
      id
    )
  },
  agent: {
    run: (req) => electron.ipcRenderer.invoke(
      "agent:run",
      req
    ),
    respondApproval: (callId, approved) => electron.ipcRenderer.invoke(
      "agent:respondApproval",
      callId,
      approved
    ),
    onEvent: (cb) => {
      const listener = (_e, event) => cb(event);
      electron.ipcRenderer.on(
        "agent:event",
        listener
      );
      return () => electron.ipcRenderer.removeListener(
        "agent:event",
        listener
      );
    }
  }
};
electron.contextBridge.exposeInMainWorld(
  "kiln",
  kilnApi
);
