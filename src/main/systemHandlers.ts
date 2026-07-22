import { ipcMain } from 'electron'
import os from 'node:os'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)


function getCpuUsage(): number {
  const cpus = os.cpus()

  let idle = 0
  let total = 0

  for (const cpu of cpus) {

    idle += cpu.times.idle

    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.irq +
      cpu.times.idle
  }

  return Math.round(
    100 - (idle / total) * 100
  )
}


export function registerSystemHandlers(): void {

  ipcMain.handle(
    'system:stats',
    async () => {

      const totalRam = os.totalmem()
      const freeRam = os.freemem()


      const ramUsed = totalRam - freeRam

      // collect GPU info (Windows WMIC). Ensure variables are declared and typed.
      let gpu: Array<{
        name: string
        vram?: number
        memoryUsed?: number
        usage?: number
      }> = []

      try {
        const { stdout } = await execAsync(
          'wmic path Win32_VideoController get Name,AdapterRAM'
        )

        const lines = stdout
          .split('\n')
          .map(v => v.trim())
          .filter(Boolean)

        gpu = lines
          .slice(1)
          .map((line: string) => {
            const match = line.match(/(.+?)\s+(\d+)$/)

            if (!match) {
              return { name: line }
            }

            return {
              name: match[1].trim(),
              vram: Number(match[2]) / 1024 / 1024
            }
          })

      } catch {
        gpu = []
      }

      return {

        cpu: {
          usage: getCpuUsage()
        },


        ram: {

          used: ramUsed,

          total: totalRam,

          percent:
            Math.round(
              (ramUsed / totalRam) * 100
            )

        },


        gpu

      }

    }
  )

}