import { ipcMain } from 'electron'
import simpleGit from 'simple-git'
import type { GitStatus, GitStatusFile } from '../shared/types'

function mapStatus(code: string): GitStatusFile['status'] {
  if (code.includes('A')) return 'added'
  if (code.includes('D')) return 'deleted'
  if (code.includes('R')) return 'renamed'
  if (code === '??') return 'untracked'
  return 'modified'
}

export function registerGitHandlers(): void {
  ipcMain.handle('git:status', async (_e, root: string): Promise<GitStatus> => {
    const git = simpleGit(root)
    const status = await git.status()
    const files: GitStatusFile[] = status.files.map((f) => ({
      path: f.path,
      status: mapStatus(f.working_dir + f.index)
    }))
    return { branch: status.current ?? '', files }
  })

  ipcMain.handle('git:stage', async (_e, root: string, filePath: string): Promise<void> => {
    await simpleGit(root).add(filePath)
  })

  ipcMain.handle('git:unstage', async (_e, root: string, filePath: string): Promise<void> => {
    await simpleGit(root).reset(['--', filePath])
  })

  ipcMain.handle('git:commit', async (_e, root: string, message: string): Promise<void> => {
    await simpleGit(root).commit(message)
  })

  ipcMain.handle('git:diff', async (_e, root: string, filePath: string): Promise<string> => {
    return simpleGit(root).diff(['--', filePath])
  })
}
