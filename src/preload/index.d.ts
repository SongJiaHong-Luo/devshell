import type { IpcApi } from '@shared/types/ipc'

declare global {
  interface Window {
    api: IpcApi
  }
}
