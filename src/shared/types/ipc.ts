import type { Project, Server, Container, ServerConfig, Group } from './server'
import type { SshConnectOptions, SshConnectionTestOptions } from './ssh'
import type { QuickCommand } from './commands'
import type { SftpFileEntry, SftpTransferProgress } from './sftp'

export interface AppSettings {
  logColors: { level: string; ansiColor: string; enabled: boolean }[]
  fontSize: number
  language: string
}

export interface FileDialogOptions {
  title: string
  filters?: { name: string; extensions: string[] }[]
}

export interface IpcApi {
  app: {
    getVersion(): Promise<string>
    ping(message: string): Promise<string>
  }
  system: {
    selectFile(options: FileDialogOptions): Promise<string | null>
  }
  store: {
    getProjects(): Promise<Project[]>
    createProject(data: { name: string; description: string }): Promise<Project>
    updateProject(id: string, data: { name?: string; description?: string }): Promise<Project | null>
    deleteProject(id: string): Promise<boolean>
    createServer(projectId: string, data: Omit<Server, 'id' | 'containers' | 'createdAt' | 'updatedAt'>, groupId?: string | null): Promise<Server | null>
    moveServer(projectId: string, serverId: string, fromGroupId: string | null, toGroupId: string | null): Promise<boolean>
    updateServer(projectId: string, serverId: string, data: Partial<Pick<Server, 'name' | 'host' | 'port' | 'username' | 'authType' | 'password' | 'privateKeyPath' | 'bastionCommand'>>): Promise<Server | null>
    deleteServer(projectId: string, serverId: string): Promise<boolean>
    createContainer(projectId: string, serverId: string, data: Omit<Container, 'id' | 'createdAt' | 'updatedAt'>): Promise<Container | null>
    updateContainer(projectId: string, serverId: string, containerId: string, data: Partial<Pick<Container, 'name' | 'image' | 'logPath' | 'logStreamMode' | 'logLineCount'>>): Promise<Container | null>
    deleteContainer(projectId: string, serverId: string, containerId: string): Promise<boolean>
    exportConfig(): Promise<ServerConfig>
    importConfig(): Promise<boolean>
    exportConfigToFile(): Promise<boolean>
  }
  ssh: {
    connect(options: SshConnectOptions): Promise<void>
    testConnection(options: SshConnectionTestOptions): Promise<void>
    send(sessionId: string, data: string): Promise<void>
    resize(sessionId: string, cols: number, rows: number): Promise<void>
    disconnect(sessionId: string): Promise<void>
    exec(sessionId: string, command: string): Promise<string>
    execStreamStart(sessionId: string, streamId: string, command: string): Promise<void>
    execStreamStop(streamId: string): Promise<void>
    onExecStreamData(callback: (streamId: string, data: string, consumed: () => void) => void): () => void
    onExecStreamEnd(callback: (streamId: string) => void): () => void
    onExecStreamError(callback: (streamId: string, message: string) => void): () => void
    onData(callback: (sessionId: string, data: string, consumed: () => void) => void): () => void
    onConnected(callback: (sessionId: string) => void): () => void
    onClosed(callback: (sessionId: string) => void): () => void
    onError(callback: (sessionId: string, message: string) => void): () => void
  }
  settings: {
    get(): Promise<AppSettings>
    update(settings: Partial<AppSettings>): Promise<void>
  }
  commands: {
    getAll(): Promise<QuickCommand[]>
    create(data: Omit<QuickCommand, 'id' | 'isBuiltin'>): Promise<QuickCommand>
    update(id: string, data: Partial<Pick<QuickCommand, 'name' | 'template' | 'description' | 'autoEnter' | 'category' | 'favorite'>>): Promise<QuickCommand | null>
    delete(id: string): Promise<boolean>
    toggleFavorite(id: string): Promise<boolean>
  }
  update: {
    check(): Promise<void>
    download(): Promise<void>
    install(): Promise<void>
    onChecking(callback: () => void): () => void
    onAvailable(callback: (info: { version: string; releaseDate: string; releaseNotes: string }) => void): () => void
    onNotAvailable(callback: () => void): () => void
    onProgress(callback: (progress: { percent: number; transferred: number; total: number }) => void): () => void
    onDownloaded(callback: () => void): () => void
    onError(callback: (message: string) => void): () => void
  }
  sftp: {
    getTransfers(sessionId: string): Promise<SftpTransferProgress[]>
    resolvePath(sessionId: string, path: string): Promise<string>
    stagedList(): Promise<{ id: string; name: string }[]>
    stage(): Promise<{ id: string; name: string }[]>
    unstage(id: string): Promise<{ id: string; name: string }[]>
    stagedSave(id: string): Promise<void>
    stagedUpload(id: string, sessionId: string, remoteDir: string): Promise<boolean>
    list(sessionId: string, remotePath: string): Promise<SftpFileEntry[]>
    mkdir(sessionId: string, remotePath: string): Promise<void>
    rename(sessionId: string, oldPath: string, newPath: string): Promise<void>
    deleteFile(sessionId: string, remotePath: string): Promise<void>
    deleteDir(sessionId: string, remotePath: string): Promise<void>
    upload(sessionId: string, localPath: string, remotePath: string): Promise<string>
    download(sessionId: string, remotePath: string, localPath: string): Promise<string>
    cancel(transferId: string): Promise<boolean>
    uploadDialog(sessionId: string, remoteDir: string): Promise<boolean>
    downloadDialog(sessionId: string, remotePath: string): Promise<boolean>
    onTransferProgress(callback: (progress: SftpTransferProgress) => void): () => void
    onTransferComplete(callback: (transferId: string, fileName: string) => void): () => void
    onTransferError(callback: (transferId: string, fileName: string, error: string) => void): () => void
  }
  placeholderHistory: {
    get(serverId: string, placeholderName: string): Promise<string[]>
    add(serverId: string, placeholderName: string, value: string): Promise<void>
  }
  server: {
    addGroup(projectId: string, parentGroupId: string | null, group: Omit<Group, 'id' | 'servers' | 'groups' | 'createdAt' | 'updatedAt'>): Promise<Group | null>
    updateGroup(projectId: string, groupId: string, updates: Partial<Pick<Group, 'name' | 'description' | 'bastion'>>): Promise<Group | null>
    deleteGroup(projectId: string, groupId: string, cascade: boolean): Promise<boolean>
    moveServer(projectId: string, serverId: string, fromGroupId: string | null, toGroupId: string | null): Promise<boolean>
    validateGroupName(projectId: string, parentGroupId: string | null, name: string, excludeId?: string): Promise<boolean>
    findServerPath(projectId: string, serverId: string): Promise<string[] | undefined>
  }
}
