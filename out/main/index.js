"use strict";
const electron = require("electron");
const path = require("node:path");
const node_fs = require("node:fs");
const simpleGit = require("simple-git");
const os = require("node:os");
const node_crypto = require("node:crypto");
let mainWindow = null;
function setMainWindow(win) {
  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });
}
function getMainWindow() {
  return mainWindow;
}
function registerFsHandlers() {
  electron.ipcMain.handle("fs:readDir", async (_e, dirPath) => {
    const entries = await node_fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.name !== "node_modules" && e.name !== ".git").map((e) => ({
      name: e.name,
      path: path.join(dirPath, e.name),
      isDirectory: e.isDirectory()
    })).sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  });
  electron.ipcMain.handle("fs:readFile", async (_e, filePath) => {
    return node_fs.promises.readFile(filePath, "utf-8");
  });
  electron.ipcMain.handle("fs:writeFile", async (_e, filePath, content) => {
    await node_fs.promises.writeFile(filePath, content, "utf-8");
  });
  electron.ipcMain.handle("fs:openFolderDialog", async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await electron.dialog.showOpenDialog(win, {
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  electron.ipcMain.on("fs:watchStart", (event, dirPath, watchId) => {
    const watcher = node_fs.watch(dirPath, { recursive: true }, (_evt, filename) => {
      if (!filename) return;
      event.sender.send(`fs:watchEvent:${watchId}`, path.join(dirPath, filename.toString()));
    });
    electron.ipcMain.once(`fs:watchStop:${watchId}`, () => watcher.close());
  });
}
function mapStatus(code) {
  if (code.includes("A")) return "added";
  if (code.includes("D")) return "deleted";
  if (code.includes("R")) return "renamed";
  if (code === "??") return "untracked";
  return "modified";
}
function registerGitHandlers() {
  electron.ipcMain.handle("git:status", async (_e, root) => {
    const git = simpleGit(root);
    const status = await git.status();
    const files = status.files.map((f) => ({
      path: f.path,
      status: mapStatus(f.working_dir + f.index)
    }));
    return { branch: status.current ?? "", files };
  });
  electron.ipcMain.handle("git:stage", async (_e, root, filePath) => {
    await simpleGit(root).add(filePath);
  });
  electron.ipcMain.handle("git:unstage", async (_e, root, filePath) => {
    await simpleGit(root).reset(["--", filePath]);
  });
  electron.ipcMain.handle("git:commit", async (_e, root, message) => {
    await simpleGit(root).commit(message);
  });
  electron.ipcMain.handle("git:diff", async (_e, root, filePath) => {
    return simpleGit(root).diff(["--", filePath]);
  });
}
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/api";
function registerOllamaHandlers() {
  electron.ipcMain.handle("ollama:health", async () => {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/tags`);
      return res.ok;
    } catch {
      return false;
    }
  });
  electron.ipcMain.handle("ollama:listModels", async () => {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/tags`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.models.map((m) => ({
        name: m.name,
        size: m.size,
        modifiedAt: m.modified_at
      }));
    } catch {
      return [];
    }
  });
}
let pty = null;
try {
  pty = require("node-pty");
} catch {
  console.warn("node-pty não disponível, terminal desabilitado");
}
function spawnPty(cwd) {
  if (!pty) return null;
  const shell = os.platform() === "win32" ? "powershell.exe" : process.env.SHELL || "/bin/bash";
  return pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd,
    env: process.env
  });
}
const sessions = /* @__PURE__ */ new Map();
function registerTerminalHandlers() {
  electron.ipcMain.handle("terminal:create", (_e, cwd) => {
    const id = node_crypto.randomUUID();
    const proc = spawnPty(cwd);
    if (!proc) {
      throw new Error("Terminal não disponível (node-pty não carregou)");
    }
    sessions.set(id, proc);
    proc.onData((data) => {
      getMainWindow()?.webContents.send(`terminal:data:${id}`, data);
    });
    proc.onExit(({ exitCode }) => {
      getMainWindow()?.webContents.send(`terminal:exit:${id}`, exitCode);
      sessions.delete(id);
    });
    return id;
  });
  electron.ipcMain.on("terminal:write", (_e, id, data) => {
    sessions.get(id)?.write(data);
  });
  electron.ipcMain.on("terminal:resize", (_e, id, cols, rows) => {
    sessions.get(id)?.resize(cols, rows);
  });
  electron.ipcMain.on("terminal:dispose", (_e, id) => {
    const proc = sessions.get(id);
    if (proc) {
      proc.kill();
      sessions.delete(id);
    }
  });
}
const ASK_PROMPT = `
You are Kiln.

Answer questions about the codebase.

Do not use tools.
Do not modify files.
`;
const CODE_PROMPT = `
You are Kiln.

Help the user write code and explain implementation changes.

Provide code when necessary.

Do not use tools.
Do not modify files directly.
`;
const PLAN_PROMPT = `
You are Kiln.

Analyze the project and produce ONLY a structured implementation plan.

Each item should contain:

1. File
2. Change
3. Reason

Do not generate code.

Do not modify files.
Do not use tools.
`;
const PLAN_CODE_PROMPT = `
You are Kiln.

First create a structured implementation plan.

Then provide the code needed to implement that plan.

Do not modify files directly.
Do not use tools.
`;
const AGENT_MODES = {
  ask: {
    prompt: ASK_PROMPT,
    allowWrite: false
  },
  code: {
    prompt: CODE_PROMPT,
    allowWrite: false
  },
  plan: {
    prompt: PLAN_PROMPT,
    allowWrite: false
  },
  "plan+code": {
    prompt: PLAN_CODE_PROMPT,
    allowWrite: false
  }
};
function send(event) {
  getMainWindow()?.webContents.send("agent:event", event);
}
function registerAgentHandlers() {
  electron.ipcMain.handle(
    "agent:run",
    async (_e, req) => {
      const {
        runId,
        model,
        mode
      } = req;
      console.log("========== AGENT ==========");
      console.log("req =", req);
      console.log("mode =", mode);
      const config = AGENT_MODES[mode];
      console.log("config =", config);
      if (!config) {
        throw new Error(`Modo inválido: ${String(mode)}`);
      }
      const messages = [
        {
          role: "system",
          content: config.prompt
        },
        ...req.history
      ];
      async function chatWithOllama(requestBody) {
        console.log("ANTES DO FETCH");
        const fetchFn = globalThis.fetch;
        if (typeof fetchFn !== "function") {
          throw new Error("fetch não disponível");
        }
        const res = await fetchFn(`${OLLAMA_BASE_URL}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody)
        });
        if (!res.ok) {
          const error = await res.text();
          throw new Error(
            `Ollama error ${res.status}: ${error}`
          );
        }
        console.log("FETCH TERMINOU");
        console.log("STATUS:", res.status);
        const json = await res.json();
        console.log("JSON:", json);
        return json;
      }
      try {
        const data = await chatWithOllama({
          model: model ?? "qwen3:4b",
          messages,
          stream: false
        });
        const message = data.message;
        console.log("MESSAGE:", message);
        if (!message) {
          throw new Error(
            "Resposta inválida do Ollama"
          );
        }
        if (message.thinking) {
          send({
            type: "agent_thinking",
            runId,
            text: message.thinking
          });
        }
        if (message.content) {
          send({
            type: "assistant_text",
            runId,
            text: message.content
          });
        }
        send({
          type: "run_complete",
          runId
        });
      } catch (err) {
        send({
          type: "run_error",
          runId,
          message: err instanceof Error ? err.message : String(err)
        });
      }
    }
  );
}
function registerSystemHandlers() {
  electron.ipcMain.handle("system:stats", async () => {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return {
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model ?? "unknown",
        usage: 0
        // depois colocamos cálculo real
      },
      gpu: {
        vramUsed: 0,
        vramTotal: 0
      },
      ram: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        percent: (totalMem - freeMem) / totalMem * 100
      }
    };
  });
}
const isDev = !electron.app.isPackaged;
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  setMainWindow(win);
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  registerFsHandlers();
  registerGitHandlers();
  registerOllamaHandlers();
  registerTerminalHandlers();
  registerAgentHandlers();
  registerSystemHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
