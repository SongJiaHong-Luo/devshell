import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi } from '@shared/types/ipc'
import type { SftpTransferProgress } from '@shared/types/sftp'

const api: IpcApi = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    ping: (message) => ipcRenderer.invoke('app:ping', message)
  },
  system: {
    selectFile: (options) => ipcRenderer.invoke('system:selectFile', options)
  },
  store: {
    getProjects: () => ipcRenderer.invoke('store:getProjects'),
    createProject: (data) => ipcRenderer.invoke('store:createProject', data),
    updateProject: (id, data) => ipcRenderer.invoke('store:updateProject', id, data),
    deleteProject: (id) => ipcRenderer.invoke('store:deleteProject', id),
    createServer: (projectId, data, groupId) => ipcRenderer.invoke('store:createServer', projectId, data, groupId),
    moveServer: (projectId, serverId, fromGroupId, toGroupId) =>
      ipcRenderer.invoke('store:moveServer', projectId, serverId, fromGroupId, toGroupId),
    updateServer: (projectId, serverId, data) =>
      ipcRenderer.invoke('store:updateServer', projectId, serverId, data),
    deleteServer: (projectId, serverId) =>
      ipcRenderer.invoke('store:deleteServer', projectId, serverId),
    createContainer: (projectId, serverId, data) =>
      ipcRenderer.invoke('store:createContainer', projectId, serverId, data),
    updateContainer: (projectId, serverId, containerId, data) =>
      ipcRenderer.invoke('store:updateContainer', projectId, serverId, containerId, data),
    deleteContainer: (projectId, serverId, containerId) =>
      ipcRenderer.invoke('store:deleteContainer', projectId, serverId, containerId),
    exportConfig: () => ipcRenderer.invoke('store:exportConfig'),
    importConfig: () => ipcRenderer.invoke('store:importConfig'),
    exportConfigToFile: () => ipcRenderer.invoke('store:exportConfigToFile')
  },
  ssh: {
    connect: (options) => ipcRenderer.invoke('ssh:connect', options),
    testConnection: (options) => ipcRenderer.invoke('ssh:testConnection', options),
    send: (sessionId, data) => ipcRenderer.invoke('ssh:send', sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.invoke('ssh:resize', sessionId, cols, rows),
    disconnect: (sessionId) => ipcRenderer.invoke('ssh:disconnect', sessionId),
    exec: (sessionId, command) => ipcRenderer.invoke('ssh:exec', sessionId, command),
    execStreamStart: (sessionId, streamId, command) =>
      ipcRenderer.invoke('ssh:exec-stream-start', sessionId, streamId, command),
    execStreamStop: (streamId) => ipcRenderer.invoke('ssh:exec-stream-stop', streamId),
    onExecStreamData: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, streamId: string, data: string, token: string): void => {
        let done = false
        callback(streamId, data, () => {
          if (!done) ipcRenderer.send('ssh:output-ack', token, data.length)
          done = true
        })
      }
      ipcRenderer.on('ssh:exec-stream-data', handler)
      return () => ipcRenderer.removeListener('ssh:exec-stream-data', handler)
    },
    onExecStreamEnd: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, streamId: string): void =>
        callback(streamId)
      ipcRenderer.on('ssh:exec-stream-end', handler)
      return () => ipcRenderer.removeListener('ssh:exec-stream-end', handler)
    },
    onExecStreamError: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, streamId: string, message: string): void =>
        callback(streamId, message)
      ipcRenderer.on('ssh:exec-stream-error', handler)
      return () => ipcRenderer.removeListener('ssh:exec-stream-error', handler)
    },
    onData: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string, data: string, token: string): void => {
        let done = false
        callback(sessionId, data, () => {
          if (!done) ipcRenderer.send('ssh:output-ack', token, data.length)
          done = true
        })
      }
      ipcRenderer.on('ssh:data', handler)
      return () => ipcRenderer.removeListener('ssh:data', handler)
    },
    onConnected: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string): void =>
        callback(sessionId)
      ipcRenderer.on('ssh:connected', handler)
      return () => ipcRenderer.removeListener('ssh:connected', handler)
    },
    onClosed: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string): void =>
        callback(sessionId)
      ipcRenderer.on('ssh:closed', handler)
      return () => ipcRenderer.removeListener('ssh:closed', handler)
    },
    onError: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string, message: string): void =>
        callback(sessionId, message)
      ipcRenderer.on('ssh:error', handler)
      return () => ipcRenderer.removeListener('ssh:error', handler)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings) => ipcRenderer.invoke('settings:update', settings)
  },
  commands: {
    getAll: () => ipcRenderer.invoke('commands:getAll'),
    create: (data) => ipcRenderer.invoke('commands:create', data),
    update: (id, data) => ipcRenderer.invoke('commands:update', id, data),
    delete: (id) => ipcRenderer.invoke('commands:delete', id),
    toggleFavorite: (id) => ipcRenderer.invoke('commands:toggleFavorite', id)
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onChecking: (callback) => {
      const handler = (): void => callback()
      ipcRenderer.on('update:checking', handler)
      return () => ipcRenderer.removeListener('update:checking', handler)
    },
    onAvailable: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { version: string; releaseDate: string; releaseNotes: string }): void =>
        callback(info)
      ipcRenderer.on('update:available', handler)
      return () => ipcRenderer.removeListener('update:available', handler)
    },
    onNotAvailable: (callback) => {
      const handler = (): void => callback()
      ipcRenderer.on('update:not-available', handler)
      return () => ipcRenderer.removeListener('update:not-available', handler)
    },
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: { percent: number; transferred: number; total: number }): void =>
        callback(progress)
      ipcRenderer.on('update:progress', handler)
      return () => ipcRenderer.removeListener('update:progress', handler)
    },
    onDownloaded: (callback) => {
      const handler = (): void => callback()
      ipcRenderer.on('update:downloaded', handler)
      return () => ipcRenderer.removeListener('update:downloaded', handler)
    },
    onError: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string): void =>
        callback(message)
      ipcRenderer.on('update:error', handler)
      return () => ipcRenderer.removeListener('update:error', handler)
    }
  },
  sftp: {
    getTransfers: (sessionId) => ipcRenderer.invoke('sftp:transfers', sessionId),
    resolvePath: (sessionId, path) => ipcRenderer.invoke('sftp:resolvePath', sessionId, path),
    stagedList: () => ipcRenderer.invoke('sftp:stagedList'),
    stage: () => ipcRenderer.invoke('sftp:stage'),
    unstage: (id) => ipcRenderer.invoke('sftp:unstage', id),
    stagedSave: (id) => ipcRenderer.invoke('sftp:stagedSave', id),
    stagedUpload: (id, sessionId, remoteDir) => ipcRenderer.invoke('sftp:stagedUpload', id, sessionId, remoteDir),
    list: (sessionId, remotePath) => ipcRenderer.invoke('sftp:list', sessionId, remotePath),
    mkdir: (sessionId, remotePath) => ipcRenderer.invoke('sftp:mkdir', sessionId, remotePath),
    rename: (sessionId, oldPath, newPath) => ipcRenderer.invoke('sftp:rename', sessionId, oldPath, newPath),
    deleteFile: (sessionId, remotePath) => ipcRenderer.invoke('sftp:deleteFile', sessionId, remotePath),
    deleteDir: (sessionId, remotePath) => ipcRenderer.invoke('sftp:deleteDir', sessionId, remotePath),
    upload: (sessionId, localPath, remotePath) => ipcRenderer.invoke('sftp:upload', sessionId, localPath, remotePath),
    download: (sessionId, remotePath, localPath) => ipcRenderer.invoke('sftp:download', sessionId, remotePath, localPath),
    cancel: (transferId) => ipcRenderer.invoke('sftp:cancel', transferId),
    uploadDialog: (sessionId, remoteDir) => ipcRenderer.invoke('sftp:uploadDialog', sessionId, remoteDir),
    downloadDialog: (sessionId, remotePath) => ipcRenderer.invoke('sftp:downloadDialog', sessionId, remotePath),
    onTransferProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: SftpTransferProgress): void =>
        callback(progress)
      ipcRenderer.on('sftp:progress', handler)
      return () => ipcRenderer.removeListener('sftp:progress', handler)
    },
    onTransferComplete: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, transferId: string, fileName: string): void =>
        callback(transferId, fileName)
      ipcRenderer.on('sftp:complete', handler)
      return () => ipcRenderer.removeListener('sftp:complete', handler)
    },
    onTransferError: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, transferId: string, fileName: string, error: string): void =>
        callback(transferId, fileName, error)
      ipcRenderer.on('sftp:error', handler)
      return () => ipcRenderer.removeListener('sftp:error', handler)
    }
  },
  placeholderHistory: {
    get: (serverId, placeholderName) => ipcRenderer.invoke('placeholder-history:get', serverId, placeholderName),
    add: (serverId, placeholderName, value) => ipcRenderer.invoke('placeholder-history:add', serverId, placeholderName, value)
  },
  server: {
    addGroup: (projectId, parentGroupId, group) => ipcRenderer.invoke('server:addGroup', projectId, parentGroupId, group),
    updateGroup: (projectId, groupId, updates) => ipcRenderer.invoke('server:updateGroup', projectId, groupId, updates),
    deleteGroup: (projectId, groupId, cascade) => ipcRenderer.invoke('server:deleteGroup', projectId, groupId, cascade),
    moveServer: (projectId, serverId, fromGroupId, toGroupId) => ipcRenderer.invoke('server:moveServer', projectId, serverId, fromGroupId, toGroupId),
    validateGroupName: (projectId, parentGroupId, name, excludeId) => ipcRenderer.invoke('server:validateGroupName', projectId, parentGroupId, name, excludeId),
    findServerPath: (projectId, serverId) => ipcRenderer.invoke('server:findServerPath', projectId, serverId)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore fallback for non-isolated context
  window.api = api
}
