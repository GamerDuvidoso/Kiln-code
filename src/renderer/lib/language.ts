// Maps file extensions to Monaco editor language ids and to display file names.

const EXTENSION_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  sh: 'shell',
  bash: 'shell',
  sql: 'sql',
  xml: 'xml',
  toml: 'ini',
  ini: 'ini',
  txt: 'plaintext'
}

export function languageForPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MAP[ext] ?? 'plaintext'
}

export function fileNameForPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || filePath
}
