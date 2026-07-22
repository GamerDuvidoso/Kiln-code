import { ipcMain } from 'electron'
import os from 'node:os'

export function registerSystemHandlers(): void {

  ipcMain.handle('system:stats', async () => {

    const cpus = os.cpus()

    const totalMem = os.totalmem()
    const freeMem = os.freemem()

    return {
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model ?? 'unknown',
        usage: 0 // depois colocamos cálculo real
      },

      gpu: {
        vramUsed: 0,
        vramTotal: 0
      },

      ram: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        percent:
          ((totalMem - freeMem) / totalMem) * 100
      }
    }

  })

}