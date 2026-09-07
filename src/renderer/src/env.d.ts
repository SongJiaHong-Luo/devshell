/// <reference types="vite/client" />

import type { IpcApi } from '@shared/types/ipc'

declare global {
  interface Window {
    api: IpcApi
  }
}

export {}
