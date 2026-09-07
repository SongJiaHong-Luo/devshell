import type { AppSettings, FileDialogOptions } from '@shared/types/ipc'
import type { SshConnectOptions } from '@shared/types/ssh'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile, copyFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { basename, join } from 'path'
import * as ssh from '../ssh/session-manager'
import { acknowledgeOutput } from '../ssh/output-flow'
import * as sftp from '../ssh/sftp-manager'
import * as commands from '../store/commands-store'
import * as store from '../store/server-store'
import * as settings from '../store/settings-store'
import * as placeholderHistory from '../store/placeholder-history-store'
import * as updater from '../updater'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isShortText(value: unknown, maxLength = 256): value is string {
  return typeof value === 'string' && value.length <= maxLength && !/[\u0000-\u001f]/.test(value)
}

function isImportedServer(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isShortText(value.id) && isShortText(value.name) && isShortText(value.host) &&
    isShortText(value.username) && Number.isInteger(value.port) &&
    (value.authType === 'password' || value.authType === 'key') &&
    Array.isArray(value.containers) && value.containers.length <= 200
}

function isImportedGroup(value: unknown, depth = 0): boolean {
  if (!isRecord(value) || depth > 10) return false
  return isShortText(value.id) && isShortText(value.name) &&
    Array.isArray(value.servers) && value.servers.length <= 500 && value.servers.every(isImportedServer) &&
    Array.isArray(value.groups) && value.groups.length <= 100 && value.groups.every((group) => isImportedGroup(group, depth + 1))
}

function isImportedConfig(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.projects) || value.projects.length > 100) return false
  return value.projects.every((project) => isRecord(project) && isShortText(project.id) && isShortText(project.name) &&
    Array.isArray(project.servers) && project.servers.length <= 500 && project.servers.every(isImportedServer) &&
    Array.isArray(project.groups) && project.groups.length <= 100 && project.groups.every((group) => isImportedGroup(group)))
}

function requireId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 160 || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
}

function requireRemotePath(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
}

function validateSshOptions(options: unknown): asserts options is SshConnectOptions {
  if (!options || typeof options !== 'object') throw new Error('Invalid SSH options')
  const value = options as Partial<SshConnectOptions>
  requireId(value.host, 'SSH host')
  requireId(value.username, 'SSH username')
  if (!Number.isInteger(value.port) || value.port! < 1 || value.port! > 65535) throw new Error('Invalid SSH port')
  if (value.authType !== 'password' && value.authType !== 'key') throw new Error('Invalid SSH authentication type')
  if (value.authType === 'password' && typeof value.password !== 'string') throw new Error('Password is required')
  if (value.authType === 'key' && (!value.privateKeyPath || value.privateKeyPath.length > 4096)) throw new Error('A private key path is required')
}

export function registerIpcHandlers(): void {
  ipcMain.on('ssh:output-ack', (event, token: string, length: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) acknowledgeOutput(token, length, win.id)
  })
  const stagedFiles = new Map<string, string>()
  const stagedList = () => [...stagedFiles].map(([id, path]) => ({ id, name: basename(path) }))
  ipcMain.handle('sftp:resolvePath', (_event, sessionId: string, path: string) => {
    requireId(sessionId, 'session ID')
    if (!isShortText(path, 4096)) throw new Error('Invalid remote path')
    return sftp.resolvePath(sessionId, path)
  })
  ipcMain.handle('sftp:stagedList', stagedList)
  ipcMain.handle('sftp:stage', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return stagedList()
    const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
    if (!result.canceled) for (const path of result.filePaths) {
      if (![...stagedFiles.values()].includes(path)) stagedFiles.set(randomUUID(), path)
    }
    return stagedList()
  })
  ipcMain.handle('sftp:unstage', (_event, id: string) => { stagedFiles.delete(id); return stagedList() })
  ipcMain.handle('sftp:stagedSave', async (event, id: string) => {
    const path = stagedFiles.get(id)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!path || !win) throw new Error('File not found')
    const result = await dialog.showSaveDialog(win, { defaultPath: basename(path) })
    if (!result.canceled && result.filePath && result.filePath !== path) await copyFile(path, result.filePath)
  })
  ipcMain.handle('sftp:stagedUpload', async (event, id: string, sessionId: string, remoteDir: string) => {
    const localPath = stagedFiles.get(id)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!localPath || !win) throw new Error('File not found')
    requireId(sessionId, 'session ID')
    if (!isShortText(remoteDir, 4096) || !remoteDir.trim()) throw new Error('请输入上传目标目录')
    remoteDir = await sftp.resolvePath(sessionId, remoteDir)
    const remotePath = join(remoteDir, basename(localPath)).replace(/\\/g, '/')
    if (await sftp.pathExists(sessionId, remotePath)) {
      const result = await dialog.showMessageBox(win, { type: 'warning', message: `覆盖 ${remotePath}？`, buttons: ['取消', '覆盖'], defaultId: 0, cancelId: 0 })
      if (result.response !== 1) return false
    }
    await sftp.uploadFile(sessionId, localPath, remotePath)
    return true
  })
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:ping', (_event, message: string) => {
    return `pong: ${message}`
  })

  ipcMain.handle('system:selectFile', async (_event, options: FileDialogOptions) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: options.title,
      filters: options.filters,
      properties: ['openFile']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  // Store handlers
  ipcMain.handle('store:getProjects', () => {
    return store.getProjects()
  })

  ipcMain.handle('store:createProject', (_event, data) => {
    return store.createProject(data)
  })

  ipcMain.handle('store:updateProject', (_event, id, data) => {
    return store.updateProject(id, data) ?? null
  })

  ipcMain.handle('store:deleteProject', (_event, id) => {
    return store.deleteProject(id)
  })

  ipcMain.handle('store:createServer', (_event, projectId, data, groupId) => {
    return store.createServer(projectId, data, groupId) ?? null
  })

  ipcMain.handle('store:moveServer', (_event, projectId, serverId, fromGroupId, toGroupId) => {
    return store.moveServer(projectId, serverId, fromGroupId, toGroupId)
  })

  ipcMain.handle('store:updateServer', (_event, projectId, serverId, data) => {
    return store.updateServer(projectId, serverId, data) ?? null
  })

  ipcMain.handle('store:deleteServer', (_event, projectId, serverId) => {
    return store.deleteServer(projectId, serverId)
  })

  // Group management handlers
  ipcMain.handle('server:addGroup', (_event, projectId: string, parentGroupId: string | null, group: Parameters<typeof store.addGroup>[2]) => {
    return store.addGroup(projectId, parentGroupId, group) ?? null
  })

  ipcMain.handle('server:updateGroup', (_event, projectId: string, groupId: string, updates: Parameters<typeof store.updateGroup>[2]) => {
    return store.updateGroup(projectId, groupId, updates) ?? null
  })

  ipcMain.handle('server:deleteGroup', (_event, projectId: string, groupId: string, cascade: boolean) => {
    return store.deleteGroup(projectId, groupId, cascade)
  })

  ipcMain.handle('server:moveServer', (_event, projectId: string, serverId: string, fromGroupId: string | null, toGroupId: string | null) => {
    return store.moveServer(projectId, serverId, fromGroupId, toGroupId)
  })

  ipcMain.handle('server:validateGroupName', (_event, projectId: string, parentGroupId: string | null, name: string, excludeId?: string) => {
    return store.validateGroupName(projectId, parentGroupId, name, excludeId)
  })

  ipcMain.handle('server:findServerPath', (_event, projectId: string, serverId: string) => {
    return store.findServerPath(projectId, serverId)
  })

  ipcMain.handle('store:createContainer', (_event, projectId, serverId, data) => {
    return store.createContainer(projectId, serverId, data) ?? null
  })

  ipcMain.handle('store:updateContainer', (_event, projectId, serverId, containerId, data) => {
    return store.updateContainer(projectId, serverId, containerId, data) ?? null
  })

  ipcMain.handle('store:deleteContainer', (_event, projectId, serverId, containerId) => {
    return store.deleteContainer(projectId, serverId, containerId)
  })

  ipcMain.handle('store:exportConfig', () => {
    return store.exportConfig()
  })

  ipcMain.handle('store:importConfig', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Configuration',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return false
    try {
      const content = await readFile(result.filePaths[0], 'utf-8')
      if (Buffer.byteLength(content, 'utf-8') > 5 * 1024 * 1024) return false
      const config = JSON.parse(content)
      if (isImportedConfig(config)) {
        store.importConfig(config)
        return true
      }
      return false
    } catch {
      return false
    }
  })

  ipcMain.handle('store:exportConfigToFile', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    const config = store.exportConfig()
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Configuration',
      defaultPath: 'devshell-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    try {
      await writeFile(result.filePath, JSON.stringify(config, null, 2), 'utf-8')
      return true
    } catch {
      return false
    }
  })

  // SSH handlers
  ipcMain.handle('ssh:connect', (event, options: SshConnectOptions) => {
    validateSshOptions(options)
    const windowId = event.sender.id
    const win = BrowserWindow.fromId(windowId)
    if (!win) return
    // We need the BrowserWindow id, not webContents id
    const bwId = BrowserWindow.getAllWindows().find((w) => w.webContents.id === windowId)?.id
    if (bwId) {
      ssh.connectSession(options, bwId)
    }
    return
  })

  ipcMain.handle('ssh:testConnection', (event, options) => {
    validateSshOptions(options)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('Window is not available')
    return ssh.testConnection(options, window.id)
  })

  ipcMain.handle('ssh:send', (_event, sessionId: string, data: string) => {
    requireId(sessionId, 'session ID')
    if (typeof data !== 'string' || data.length > 64 * 1024) throw new Error('Terminal input is too large')
    ssh.sendData(sessionId, data)
  })

  ipcMain.handle('ssh:resize', (_event, sessionId: string, cols: number, rows: number) => {
    requireId(sessionId, 'session ID')
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols > 500 || rows > 500) {
      throw new Error('Invalid terminal dimensions')
    }
    ssh.resizeSession(sessionId, cols, rows)
  })

  ipcMain.handle('ssh:disconnect', (_event, sessionId: string) => {
    ssh.disconnectSession(sessionId)
  })

  ipcMain.handle('ssh:exec', (_event, sessionId: string, command: string) => {
    requireId(sessionId, 'session ID')
    if (typeof command !== 'string' || command.length === 0 || command.length > 10_000) throw new Error('Invalid command')
    return ssh.execCommand(sessionId, command)
  })

  ipcMain.handle('ssh:exec-stream-start', (_event, sessionId: string, streamId: string, command: string) => {
    requireId(sessionId, 'session ID')
    requireId(streamId, 'stream ID')
    if (typeof command !== 'string' || command.length === 0 || command.length > 10_000) throw new Error('Invalid command')
    ssh.execStreamStart(sessionId, streamId, command)
  })

  ipcMain.handle('ssh:exec-stream-stop', (_event, streamId: string) => {
    ssh.execStreamStop(streamId)
  })

  // Settings handlers
  ipcMain.handle('settings:get', () => {
    return settings.getSettings()
  })

  ipcMain.handle('settings:update', (_event, data: Partial<AppSettings>) => {
    settings.updateSettings(data)
  })

  // Commands handlers
  ipcMain.handle('commands:getAll', () => {
    return commands.getCommands()
  })

  ipcMain.handle('commands:create', (_event, data) => {
    return commands.createCommand(data)
  })

  ipcMain.handle('commands:update', (_event, id, data) => {
    return commands.updateCommand(id, data) ?? null
  })

  ipcMain.handle('commands:delete', (_event, id) => {
    return commands.deleteCommand(id)
  })

  ipcMain.handle('commands:toggleFavorite', (_event, id: string) => {
    requireId(id, 'command ID')
    return commands.toggleFavorite(id)
  })

  // SFTP handlers
  ipcMain.handle('sftp:transfers', (_event, sessionId: string) => {
    requireId(sessionId, 'session ID')
    return sftp.getTransfers(sessionId)
  })
  ipcMain.handle('sftp:list', (_event, sessionId: string, remotePath: string) => {
    requireId(sessionId, 'session ID')
    requireRemotePath(remotePath, 'remote path')
    return sftp.listFiles(sessionId, remotePath)
  })

  ipcMain.handle('sftp:mkdir', (_event, sessionId: string, remotePath: string) => {
    requireId(sessionId, 'session ID')
    requireRemotePath(remotePath, 'remote path')
    return sftp.createDir(sessionId, remotePath)
  })

  ipcMain.handle('sftp:rename', (_event, sessionId: string, oldPath: string, newPath: string) => {
    requireId(sessionId, 'session ID')
    requireRemotePath(oldPath, 'remote path')
    requireRemotePath(newPath, 'remote path')
    return sftp.renamePath(sessionId, oldPath, newPath)
  })

  ipcMain.handle('sftp:deleteFile', (_event, sessionId: string, remotePath: string) => {
    requireId(sessionId, 'session ID')
    requireRemotePath(remotePath, 'remote path')
    return sftp.removeFile(sessionId, remotePath)
  })

  ipcMain.handle('sftp:deleteDir', (_event, sessionId: string, remotePath: string) => {
    requireId(sessionId, 'session ID')
    requireRemotePath(remotePath, 'remote path')
    return sftp.removeDir(sessionId, remotePath)
  })

  ipcMain.handle('sftp:upload', (_event, sessionId: string, localPath: string, remotePath: string) => {
    return sftp.uploadFile(sessionId, localPath, remotePath)
  })

  ipcMain.handle('sftp:download', (_event, sessionId: string, remotePath: string, localPath: string) => {
    return sftp.downloadFile(sessionId, remotePath, localPath)
  })

  ipcMain.handle('sftp:cancel', (_event, transferId: string) => {
    return sftp.cancelTransfer(transferId)
  })

  ipcMain.handle('sftp:uploadDialog', async (_event, sessionId: string, remoteDir: string) => {
    remoteDir = await sftp.resolvePath(sessionId, remoteDir)
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    const result = await dialog.showOpenDialog(win, {
      title: 'Select file to upload',
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return false
    const localPath = result.filePaths[0]
    const remotePath = join(remoteDir, basename(localPath)).replace(/\\/g, '/')
    if (await sftp.pathExists(sessionId, remotePath)) {
      const confirmation = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Replace remote file?',
        message: `${basename(localPath)} already exists in the destination folder.`,
        buttons: ['Cancel', 'Replace'],
        defaultId: 0,
        cancelId: 0
      })
      if (confirmation.response !== 1) return false
    }
    await sftp.uploadFile(sessionId, localPath, remotePath)
    return true
  })

  ipcMain.handle('sftp:downloadDialog', async (_event, sessionId: string, remotePath: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    const fileName = basename(remotePath)
    const result = await dialog.showSaveDialog(win, {
      title: 'Save file as',
      defaultPath: fileName
    })
    if (result.canceled || !result.filePath) return false
    await sftp.downloadFile(sessionId, remotePath, result.filePath)
    return true
  })

  // Update handlers
  ipcMain.handle('update:check', () => {
    updater.checkForUpdates()
  })

  ipcMain.handle('update:download', () => {
    updater.downloadUpdate()
  })

  ipcMain.handle('update:install', () => {
    updater.installUpdate()
  })

  // Placeholder history handlers
  ipcMain.handle('placeholder-history:get', (_event, serverId: string, placeholderName: string) => {
    return placeholderHistory.getHistory(serverId, placeholderName)
  })

  ipcMain.handle('placeholder-history:add', (_event, serverId: string, placeholderName: string, value: string) => {
    placeholderHistory.addHistory(serverId, placeholderName, value)
  })
}
