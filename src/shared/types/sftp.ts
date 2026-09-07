export interface SftpFileEntry {
  name: string
  path: string
  size: number
  modTime: number
  permissions: string
  isDir: boolean
  isSymlink: boolean
  owner: string
  group: string
}

export interface SftpTransferProgress {
  sessionId: string
  transferId: string
  fileName: string
  transferredBytes: number
  totalBytes: number
  direction: 'upload' | 'download'
  status?: 'queued' | 'running' | 'finishing'
}
