"use strict";
const electron = require("electron");
const path = require("node:path");
const node_fs = require("node:fs");
const simpleGit = require("simple-git");
const ws = require("ws");
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
    event.sender.once("fs:watchStop", () => watcher.close());
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
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
function registerOllamaHandlers() {
  electron.ipcMain.handle("ollama:health", async () => {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  });
  electron.ipcMain.handle("ollama:listModels", async () => {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
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
let wss = null;
function registerTerminalHandlers() {
  if (!wss) {
    wss = new ws.Server({ port: 9001 });
    console.log("WebSocket server rodando na porta 9001");
    wss.on("connection", (ws2) => {
      const termId = node_crypto.randomUUID();
      const proc = spawnPty(electron.app.getPath("home"));
      if (!proc) {
        ws2.send(JSON.stringify({ type: "error", message: "Terminal não disponível" }));
        ws2.close();
        return;
      }
      sessions.set(termId, proc);
      ws2.send(JSON.stringify({ type: "ready", id: termId }));
      proc.onData((data) => {
        if (ws2.readyState === 1) {
          ws2.send(JSON.stringify({ type: "data", id: termId, payload: data }));
        }
      });
      ws2.on("message", (msg) => {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.type === "input") {
            proc.write(parsed.data);
          } else if (parsed.type === "resize") {
            proc.resize(parsed.cols, parsed.rows);
          }
        } catch (e) {
          console.error("Error parsing terminal message:", e);
        }
      });
      ws2.on("close", () => {
        proc.kill();
        sessions.delete(termId);
      });
    });
  }
  electron.ipcMain.handle("terminal:create", () => {
    return node_crypto.randomUUID();
  });
  electron.ipcMain.on("terminal:write", () => {
  });
  electron.ipcMain.on("terminal:resize", () => {
  });
  electron.ipcMain.on("terminal:dispose", () => {
  });
}
const pendingApprovals = /* @__PURE__ */ new Map();
function send(event) {
  getMainWindow()?.webContents.send("agent:event", event);
}
const SYSTEM_PROMPT = `You are Kiln, a local coding agent running inside a desktop code editor.
You can read and write files in the user's workspace and run shell commands when asked.
Always explain briefly what you are about to do before doing it.`;
const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file relative to the workspace root",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write (create or overwrite) a file relative to the workspace root",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and folders in a directory relative to the workspace root",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"]
      }
    }
  }
];
async function runTool(workspaceRoot, tool, args) {
  const resolved = path.join(workspaceRoot, args.path ?? ".");
  if (tool === "read_file") {
    const content = await node_fs.promises.readFile(resolved, "utf-8");
    return { result: content };
  }
  if (tool === "list_dir") {
    const entries = await node_fs.promises.readdir(resolved, { withFileTypes: true });
    return { result: entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() })) };
  }
  if (tool === "write_file") {
    let before = "";
    try {
      before = await node_fs.promises.readFile(resolved, "utf-8");
    } catch {
      before = "";
    }
    await node_fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    await node_fs.promises.writeFile(resolved, args.content, "utf-8");
    return {
      result: "ok",
      preview: { path: args.path, before, after: args.content }
    };
  }
  throw new Error(`Unknown tool: ${tool}`);
}
async function requestApproval(runId, callId, tool, args, preview) {
  return new Promise((resolve) => {
    pendingApprovals.set(callId, { resolve });
    send({ type: "approval_requested", runId, callId, tool, args, preview });
  });
}
function registerAgentHandlers() {
  electron.ipcMain.handle("agent:run", async (_e, req) => {
    const { runId, workspaceRoot, model, autoApprove } = req;
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...req.history
    ];
    try {
      for (let round = 0; round < 8; round++) {
        const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            tools: TOOLS,
            stream: false
          })
        });
        if (!res.ok) {
          throw new Error(`Ollama respondeu com status ${res.status}`);
        }
        const data = await res.json();
        const message = data.message;
        if (message?.content) {
          send({ type: "assistant_text", runId, text: message.content });
        }
        messages.push(message);
        const toolCalls = message?.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
          break;
        }
        for (const call of toolCalls) {
          const callId = node_crypto.randomUUID();
          const toolName = call.function.name;
          const args = call.function.arguments;
          send({ type: "tool_call_start", runId, callId, tool: toolName });
          if (toolName === "write_file" && !autoApprove) {
            let before = "";
            try {
              before = await node_fs.promises.readFile(path.join(workspaceRoot, args.path), "utf-8");
            } catch {
              before = "";
            }
            const approved = await requestApproval(runId, callId, toolName, args, {
              path: args.path,
              before,
              after: args.content
            });
            if (!approved) {
              messages.push({
                role: "tool",
                content: "O usuário rejeitou esta alteração."
              });
              continue;
            }
          }
          const { result, preview } = await runTool(workspaceRoot, toolName, args);
          send({ type: "tool_call_result", runId, callId, result });
          if (preview) {
          }
          messages.push({
            role: "tool",
            content: typeof result === "string" ? result : JSON.stringify(result)
          });
        }
      }
      send({ type: "run_complete", runId });
    } catch (err) {
      send({
        type: "run_error",
        runId,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  });
  electron.ipcMain.handle(
    "agent:respondApproval",
    async (_e, callId, approved) => {
      const entry = pendingApprovals.get(callId);
      if (entry) {
        entry.resolve(approved);
        pendingApprovals.delete(callId);
      }
    }
  );
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
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
