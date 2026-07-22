import type { KilnApi } from '../shared/types'

declare global {
  interface Window {
    kiln: KilnApi
  }
}

export {}
