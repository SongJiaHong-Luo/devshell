import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { app, BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('update:checking')
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    sendToRenderer('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
    })
  })

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update:not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', () => {
    sendToRenderer('update:downloaded')
  })

  autoUpdater.on('error', (err) => {
    sendToRenderer('update:error', err.message)
  })
}

export function checkForUpdates(): void {
  if (!app.isPackaged) {
    sendToRenderer('update:error', '开发模式不检查更新，请使用安装版。')
    return
  }
  autoUpdater.checkForUpdates().catch(() => {
    // Silently handle check errors (e.g., no network)
  })
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch(() => {
    // Silently handle download errors
  })
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}
