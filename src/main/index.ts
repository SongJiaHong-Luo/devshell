import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc'
import { disconnectAll } from './ssh/session-manager'
import { checkForUpdates, initAutoUpdater } from './updater'
import { createMainWindow } from './window'

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.devshell.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()

  const mainWindow = createMainWindow()
  initAutoUpdater(mainWindow)

  // Check for updates 3 seconds after startup (production only)
  if (!is.dev) {
    setTimeout(() => checkForUpdates(), 3000)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  disconnectAll()
})
