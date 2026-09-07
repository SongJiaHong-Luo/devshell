import { BrowserWindow } from 'electron'
import type { SftpFileEntry, SftpTransferProgress } from '@shared/types/sftp'
import { getSession } from './session-manager'
import { randomUUID } from 'crypto'
import { rename, unlink, stat } from 'fs/promises'
import { basename, posix } from 'path'

function sendToRenderer(windowId: number, channel: string, ...args: unknown[]): void {
  const win = BrowserWindow.fromId(windowId)
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args)
  }
}

function formatPermissions(mode: number): string {
  const perms = (mode & parseInt('777', 8)).toString(8)
  return perms.padStart(3, '0')
}

function getSftp(sessionId: string): Promise<{ sftp: any; windowId: number }> {
  return new Promise((resolve, reject) => {
    const session = getSession(sessionId)
    if (!session) {
      reject(new Error('Session not found'))
      return
    }
    if (session.shellOnly) { reject(new Error('堡垒机菜单会话不支持 SFTP，请直连目标服务器。')); return }
    session.client.sftp((err: Error | null, sftp: any) => {
      if (err) {
        reject(err)
        return
      }
      resolve({ sftp, windowId: session.windowId })
    })
  })
}

interface TransferTask {
  progress: SftpTransferProgress
  start: () => void
  cancel: () => void
}
const activeTransfers = new Map<string, TransferTask>()
let runningTransfers = 0
function drainTransfers(): void {
  for (const task of activeTransfers.values()) {
    if (runningTransfers >= 2) break
    if (task.progress.status !== 'queued') continue
    task.progress.status = 'running'
    runningTransfers++
    task.start()
  }
}
export function getTransfers(sessionId: string): SftpTransferProgress[] {
  return [...activeTransfers.values()].filter(t => t.progress.sessionId === sessionId).map(t => ({ ...t.progress }))
}
export function cancelTransfer(transferId: string): boolean {
  const task = activeTransfers.get(transferId)
  if (!task || task.progress.status === 'finishing') return false
  task.cancel()
  return true
}
export async function pathExists(sessionId: string, remotePath: string): Promise<boolean> {
  const { sftp } = await getSftp(sessionId)
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err: Error | null) => {
      sftp.end()
      if (!err) resolve(true)
      else if (Number((err as { code?: string | number }).code) === 2) resolve(false)
      else reject(err)
    })
  })
}

export async function resolvePath(sessionId: string, remotePath: string): Promise<string> {
  const { sftp } = await getSftp(sessionId)
  const path = remotePath === '~' ? '.' : remotePath.replace(/^~\//, './')
  return new Promise((resolve, reject) => sftp.realpath(path, (error: Error | null, result: string) => {
    sftp.end()
    if (error) reject(error)
    else resolve(result)
  }))
}

export function listFiles(sessionId: string, remotePath: string): Promise<SftpFileEntry[]> {
  return new Promise((resolve, reject) => {
    getSftp(sessionId).then(({ sftp }) => {
      sftp.readdir(remotePath, (err: Error | null, list: any[]) => {
        if (err) {
          sftp.end()
          reject(err)
          return
        }

        const entries: SftpFileEntry[] = list
          .filter((item) => item.filename !== '.' && item.filename !== '..')
          .map((item) => ({
            name: item.filename,
            path: posix.join(remotePath, item.filename),
            size: item.attrs.size,
            modTime: item.attrs.mtime * 1000,
            permissions: formatPermissions(item.attrs.mode),
            isDir: (item.attrs.mode & 0o170000) === 0o040000,
            isSymlink: (item.attrs.mode & 0o170000) === 0o120000,
            owner: String(item.attrs.uid),
            group: String(item.attrs.gid)
          }))
          .sort((a, b) => {
            if (a.isDir && !b.isDir) return -1
            if (!a.isDir && b.isDir) return 1
            return a.name.localeCompare(b.name)
          })

        sftp.end()
        resolve(entries)
      })
    }).catch(reject)
  })
}

export function createDir(sessionId: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getSftp(sessionId).then(({ sftp }) => {
      sftp.mkdir(remotePath, (err: Error | null) => {
        sftp.end()
        if (err) reject(err)
        else resolve()
      })
    }).catch(reject)
  })
}

export function renamePath(sessionId: string, oldPath: string, newPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getSftp(sessionId).then(({ sftp }) => {
      sftp.rename(oldPath, newPath, (err: Error | null) => {
        sftp.end()
        if (err) reject(err)
        else resolve()
      })
    }).catch(reject)
  })
}

export function removeFile(sessionId: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getSftp(sessionId).then(({ sftp }) => {
      sftp.unlink(remotePath, (err: Error | null) => {
        sftp.end()
        if (err) reject(err)
        else resolve()
      })
    }).catch(reject)
  })
}

export function removeDir(sessionId: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getSftp(sessionId).then(({ sftp }) => {
      sftp.rmdir(remotePath, (err: Error | null) => {
        sftp.end()
        if (err) reject(err)
        else resolve()
      })
    }).catch(reject)
  })
}

export function uploadFile(sessionId: string, localPath: string, remotePath: string): Promise<string> {
  return transferFile(sessionId, localPath, remotePath, 'upload')
}
export function downloadFile(sessionId: string, remotePath: string, localPath: string): Promise<string> {
  return transferFile(sessionId, localPath, remotePath, 'download')
}
function transferFile(sessionId: string, localPath: string, remotePath: string, direction: 'upload' | 'download'): Promise<string> {
  const session = getSession(sessionId)
  if (!session) return Promise.reject(new Error('Session not found'))
  if (session.shellOnly) return Promise.reject(new Error('堡垒机菜单会话不支持 SFTP，请直连目标服务器。'))
  // ponytail: bounded memory queue; no durable/resumable job database.
  if (activeTransfers.size >= 32) return Promise.reject(new Error('传输队列已满，请等待部分任务完成'))
  if (!localPath || !remotePath.startsWith('/') || remotePath.includes('\0')) return Promise.reject(new Error('Invalid transfer path'))
  return new Promise((resolve, reject) => {
    const transferId = randomUUID()
    const fileName = basename(direction === 'upload' ? localPath : remotePath)
    const temporary = direction === 'upload'
      ? posix.join(posix.dirname(remotePath), `.${posix.basename(remotePath)}.devshell-part-${transferId}`)
      : `${localPath}.devshell-part-${transferId}`
    const progress: SftpTransferProgress = { sessionId, transferId, fileName, direction, transferredBytes: 0, totalBytes: 0, status: 'queued' }
    let sftp: any
    let settled = false
    let started = false
    let lastProgress = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let temporaryCreated = false
    const emit = (): void => sendToRenderer(session.windowId, 'sftp:progress', { ...progress })
    const onDisconnect = (): void => {
      if (direction === 'download' && progress.status === 'finishing') return
      void finish(new Error('连接已断开，传输已停止'))
    }
    const onError = (error: Error): void => {
      if (direction === 'download' && progress.status === 'finishing') return
      void finish(error)
    }
    const armTimeout = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void finish(new Error('传输超过 60 秒无响应，已停止')) }, 60000)
    }
    const finish = async (error?: Error): Promise<void> => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      session.client.removeListener('close', onDisconnect)
      session.client.removeListener('error', onError)
      session.channel.removeListener('close', onDisconnect)
      for (const emitter of [session.client, session.channel]) {
        if (emitter.getMaxListeners() > 0) emitter.setMaxListeners(emitter.getMaxListeners() - 1)
      }
      if (sftp) {
        sftp.removeListener('close', onDisconnect)
        try { sftp.end() } catch {}
      }
      let cleanupFailed = false
      if (error && temporaryCreated) {
        try {
          if (direction === 'download') {
            await unlink(temporary).catch(async (err) => {
              if (err.code === 'ENOENT') return
              await new Promise(r => setTimeout(r, 200))
              await unlink(temporary)
            })
          } else {
            if (getSession(sessionId) !== session) throw new Error('Disconnected')
            await new Promise<void>((res, rej) => {
              let cleanup: any
              let expired = false
              const timeout = setTimeout(() => { expired = true; cleanup?.end(); rej(new Error('Cleanup timeout')) }, 2000)
              getSftp(sessionId).then(({ sftp: channel }) => {
                cleanup = channel
                if (expired || getSession(sessionId) !== session) { clearTimeout(timeout); channel.end(); rej(new Error('Disconnected')); return }
                channel.on('error', () => {})
                channel.unlink(temporary, (err: Error | null) => {
                  clearTimeout(timeout); channel.end()
                  if (err && Number((err as any).code) !== 2) rej(err); else res()
                })
              }).catch(err => { clearTimeout(timeout); rej(err) })
            })
          }
        } catch { cleanupFailed = true }
      }
      activeTransfers.delete(transferId)
      if (started) runningTransfers--
      if (error) {
        const message = error.message + (cleanupFailed ? `；临时文件可能残留，请检查：${temporary}` : '')
        sendToRenderer(session.windowId, 'sftp:error', transferId, fileName, message)
        reject(new Error(message))
      } else {
        progress.transferredBytes = progress.totalBytes
        emit()
        sendToRenderer(session.windowId, 'sftp:complete', transferId, fileName)
        resolve(transferId)
      }
      drainTransfers()
    }
    const current = (): boolean => !settled && getSession(sessionId) === session
    const step = (bytes: number): void => {
      if (settled) return
      progress.transferredBytes = bytes
      if (Date.now() - lastProgress >= 200) {
        lastProgress = Date.now(); armTimeout(); emit()
      }
    }
    const start = async (): Promise<void> => {
      started = true
      emit(); armTimeout()
      try {
        if (!current()) throw new Error('Session disconnected')
        if (direction === 'upload') {
          const info = await stat(localPath)
          if (!info.isFile()) throw new Error('目前仅支持上传文件，不支持文件夹')
          progress.totalBytes = info.size
        }
        if (!current()) return
        const opened = await getSftp(sessionId)
        sftp = opened.sftp
        if (!current()) { sftp.end(); return }
        sftp.on('error', onError)
        sftp.on('close', onDisconnect)
        emit()
        if (direction === 'upload') {
          sftp.lstat(remotePath, (statError: Error | null, attrs: any) => {
            if (!current()) return
            if (statError && Number((statError as any).code) !== 2) { void finish(statError); return }
            if (attrs && (attrs.mode & 0o170000) !== 0o100000) { void finish(new Error('目标不是普通文件，不能覆盖')); return }
            temporaryCreated = true
            sftp.fastPut(localPath, temporary, { concurrency: 4, chunkSize: 32768, mode: attrs ? attrs.mode & 0o777 : 0o600, step }, (err: Error | null) => {
              if (!current()) return
              if (err) { void finish(err); return }
              progress.status = 'finishing'; emit(); armTimeout()
              const renamed = (renameError?: Error | null): void => { void finish(renameError || undefined) }
              // Never delete the old target as a fallback for unsupported atomic replacement.
              const fallback = (): void => {
                if (!attrs) sftp.rename(temporary, remotePath, renamed)
                else renamed(new Error('服务器不支持安全替换已有文件；原文件未改动，请改用新文件名'))
              }
              try { sftp.ext_openssh_rename(temporary, remotePath, (renameError: Error | null) => {
                if (settled) return
                if (renameError && Number((renameError as any).code) === 8) fallback()
                else renamed(renameError)
              }) } catch (error) {
                if (/does not support/i.test((error as Error).message)) fallback()
                else renamed(error as Error)
              }
            })
          })
        } else {
          sftp.stat(remotePath, (err: Error | null, attrs: any) => {
            if (!current()) return
            if (err) { void finish(err); return }
            progress.totalBytes = attrs.size
            temporaryCreated = true
            sftp.fastGet(remotePath, temporary, { concurrency: 4, chunkSize: 32768, step }, (downloadError: Error | null) => {
              if (!current()) { void unlink(temporary).catch(() => undefined); return }
              if (downloadError) { void finish(downloadError); return }
              progress.status = 'finishing'; emit(); armTimeout()
              rename(temporary, localPath).then(() => finish()).catch(finish)
            })
          })
        }
      } catch (error) { void finish(error as Error) }
    }
    activeTransfers.set(transferId, { progress, start: () => { void start() }, cancel: () => { void finish(new Error('Transfer cancelled')) } })
    // Each bounded task owns one listener per event; restore the allowance on finish.
    for (const emitter of [session.client, session.channel]) {
      if (emitter.getMaxListeners() > 0) emitter.setMaxListeners(emitter.getMaxListeners() + 1)
    }
    session.client.on('close', onDisconnect)
    session.client.on('error', onError)
    session.channel.on('close', onDisconnect)
    emit()
    drainTransfers()
  })
}
