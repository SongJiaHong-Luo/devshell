import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Folder,
  File,
  ChevronRight,
  ArrowUp,
  Upload,
  FolderPlus,
  RefreshCw,
  Trash2,
  Pencil,
  Download,
  X,
  Loader2
} from 'lucide-react'
import type { SftpFileEntry, SftpTransferProgress } from '@shared/types/sftp'
import { formatFileTransferError } from '@/lib/user-error'
import { ConfirmDialog } from './confirm-dialog'

interface SftpPanelProps {
  sessionId: string
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '-'
  const d = new Date(timestamp)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }): JSX.Element {
  const parts = path.split('/').filter(Boolean)
  return (
    <div className="flex items-center gap-0.5 text-xs overflow-x-auto whitespace-nowrap">
      <button
        className="hover:underline text-muted-foreground hover:text-foreground px-0.5"
        onClick={() => onNavigate('/')}
      >
        /
      </button>
      {parts.map((part, i) => {
        const partPath = '/' + parts.slice(0, i + 1).join('/')
        return (
          <span key={partPath} className="flex items-center gap-0.5">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              className="hover:underline text-muted-foreground hover:text-foreground px-0.5"
              onClick={() => onNavigate(partPath)}
            >
              {part}
            </button>
          </span>
        )
      })}
    </div>
  )
}

export function SftpPanel({ sessionId, onClose }: SftpPanelProps): JSX.Element {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState('~')
  const [entries, setEntries] = useState<SftpFileEntry[]>([])
  const [filePage, setFilePage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creatingDir, setCreatingDir] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [transfers, setTransfers] = useState<SftpTransferProgress[]>([])
  const [inputPath, setInputPath] = useState('')
  const [showPathInput, setShowPathInput] = useState(false)
  const [uploadTargetPath, setUploadTargetPath] = useState('~')
  const [deleteTarget, setDeleteTarget] = useState<SftpFileEntry | null>(null)
  const pathInputRef = useRef<HTMLInputElement>(null)
  const ownedTransfers = useRef(new Set<string>())
  const directoryRequest = useRef(0)
  const [staged, setStaged] = useState<{ id: string; name: string }[]>([])
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  useEffect(() => {
    window.api.sftp.stagedList().then(setStaged).catch((err) => setError(formatFileTransferError(err)))
  }, [])
  const uploadStaged = async (id: string): Promise<void> => {
    setUploadingId(id)
    try {
      await window.api.sftp.stagedUpload(id, sessionId, uploadTargetPath.trim())
      await loadDir(currentPath)
    } catch (err) { setError(formatFileTransferError(err)) }
    finally { setUploadingId(null) }
  }

  const loadDir = useCallback(async (path: string) => {
    const request = ++directoryRequest.current
    setLoading(true)
    setError(null)
    try {
      path = await window.api.sftp.resolvePath(sessionId, path)
      const result = await window.api.sftp.list(sessionId, path)
      if (request !== directoryRequest.current) return
      setEntries(result)
      setFilePage(0)
      setCurrentPath(path)
      setInputPath(path)
      setUploadTargetPath((previous) => previous || path)
    } catch (err) {
      if (request === directoryRequest.current) setError(formatFileTransferError(err))
    } finally {
      if (request === directoryRequest.current) setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    loadDir(currentPath)
    return () => { directoryRequest.current++ }
  }, [])

  useEffect(() => {
    let disposed = false
    let snapshotPending = true
    const finished = new Set<string>()
    const unsubProgress = window.api.sftp.onTransferProgress((progress) => {
      if (progress.sessionId !== sessionId) return
      ownedTransfers.current.add(progress.transferId)
      setTransfers((prev) => {
        const idx = prev.findIndex((t) => t.transferId === progress.transferId)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = progress
          return next
        }
        return [...prev, progress]
      })
    })

    const unsubComplete = window.api.sftp.onTransferComplete((transferId) => {
      if (snapshotPending) finished.add(transferId)
      if (!ownedTransfers.current.delete(transferId)) return
      setTransfers((prev) => prev.filter((t) => t.transferId !== transferId))
      loadDir(currentPath)
    })

    const unsubError = window.api.sftp.onTransferError((transferId, _fileName, message) => {
      if (snapshotPending) finished.add(transferId)
      if (!ownedTransfers.current.delete(transferId)) return
      setTransfers((prev) => prev.filter((t) => t.transferId !== transferId))
      setError(formatFileTransferError(new Error(message)))
    })

    window.api.sftp.getTransfers(sessionId).then((snapshot) => {
      if (disposed) return
      const pending = snapshot.filter(item => !finished.has(item.transferId))
      snapshotPending = false
      finished.clear()
      pending.forEach(item => ownedTransfers.current.add(item.transferId))
      setTransfers(previous => [...pending.filter(item => !previous.some(p => p.transferId === item.transferId)), ...previous])
    }).catch(err => { if (!disposed) setError(formatFileTransferError(err)) })
    return () => {
      disposed = true
      unsubProgress()
      unsubComplete()
      unsubError()
    }
  }, [currentPath, loadDir, sessionId])

  const navigateTo = (path: string): void => {
    setEditingName(null)
    setCreatingDir(false)
    loadDir(path)
  }

  const goUp = (): void => {
    if (currentPath === '/' || currentPath === '~') return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    navigateTo(parts.length === 0 ? '/' : '/' + parts.join('/'))
  }

  const handlePathSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (inputPath.trim()) {
      navigateTo(inputPath.trim())
      setShowPathInput(false)
    }
  }

  const handleUpload = async (): Promise<void> => {
    try {
      await window.api.sftp.uploadDialog(sessionId, currentPath)
      await loadDir(currentPath)
    } catch (err) {
      setError(formatFileTransferError(err))
    }
  }

  const handleUploadToTarget = async (): Promise<void> => {
    const target = uploadTargetPath.trim() || currentPath
    try {
      await window.api.sftp.uploadDialog(sessionId, target)
      await loadDir(currentPath)
    } catch (err) {
      setError(formatFileTransferError(err))
    }
  }

  const handleDownload = async (entry: SftpFileEntry): Promise<void> => {
    try {
      await window.api.sftp.downloadDialog(sessionId, entry.path)
    } catch (err) {
      setError(formatFileTransferError(err))
    }
  }

  const handleCancelTransfer = async (transferId: string): Promise<void> => {
    try { await window.api.sftp.cancel(transferId) }
    catch (err) { setError(formatFileTransferError(err)) }
  }

  const handleCreateDir = async (): Promise<void> => {
    if (!newDirName.trim()) return
    try {
      const dirPath = currentPath === '/'
        ? `/${newDirName.trim()}`
        : `${currentPath}/${newDirName.trim()}`
      await window.api.sftp.mkdir(sessionId, dirPath)
      setCreatingDir(false)
      setNewDirName('')
      loadDir(currentPath)
    } catch (err) {
      setError(formatFileTransferError(err))
    }
  }

  const handleDelete = async (entry: SftpFileEntry): Promise<void> => {
    try {
      if (entry.isDir) {
        await window.api.sftp.deleteDir(sessionId, entry.path)
      } else {
        await window.api.sftp.deleteFile(sessionId, entry.path)
      }
      loadDir(currentPath)
    } catch (err) {
      setError(formatFileTransferError(err))
    }
  }

  const handleRenameStart = (entry: SftpFileEntry): void => {
    setEditingName(entry.name)
    setNewName(entry.name)
    setCreatingDir(false)
  }

  const handleRenameSubmit = async (oldEntry: SftpFileEntry): Promise<void> => {
    if (!newName.trim() || newName === oldEntry.name) {
      setEditingName(null)
      return
    }
    try {
      const parent = currentPath === '/' ? '' : currentPath
      const newPath = `${parent}/${newName.trim()}`
      await window.api.sftp.rename(sessionId, oldEntry.path, newPath)
      setEditingName(null)
      loadDir(currentPath)
    } catch (err) {
      setError(formatFileTransferError(err))
    }
  }

  const handleEntryClick = (entry: SftpFileEntry): void => {
    if (entry.isDir) {
      navigateTo(entry.path)
    }
  }

  return (
    <div className="w-96 border-l border-border bg-card flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('sftp.title')}</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="p-2 border-b border-border space-y-1">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={goUp}
            disabled={currentPath === '/' || currentPath === '~'}>
            <ArrowUp className="h-3 w-3" />
          </Button>
          {showPathInput ? (
            <form onSubmit={handlePathSubmit} className="flex-1 flex gap-1">
              <Input
                ref={pathInputRef}
                className="h-6 text-xs flex-1"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                onBlur={() => setShowPathInput(false)}
                autoFocus
              />
            </form>
          ) : (
            <div
              className="flex-1 min-w-0 cursor-text px-1 py-0.5 rounded hover:bg-accent/50"
              onClick={() => { setShowPathInput(true); setInputPath(currentPath) }}
            >
              <Breadcrumb path={currentPath} onNavigate={navigateTo} />
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
            onClick={() => loadDir(currentPath)} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={handleUpload}>
            <Upload className="h-3 w-3" /> {t('sftp.upload')}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1"
            onClick={() => { setCreatingDir(true); setNewDirName(''); setEditingName(null) }}>
            <FolderPlus className="h-3 w-3" /> {t('sftp.newFolder')}
          </Button>
        </div>
        <div className="flex items-center gap-1 pt-1">
          <Input
            className="h-7 text-xs flex-1"
            value={uploadTargetPath}
            onChange={(e) => setUploadTargetPath(e.target.value)}
            placeholder={t('sftp.uploadTargetPlaceholder')}
            aria-label={t('sftp.uploadTarget')}
          />
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={handleUploadToTarget}>
            <Upload className="h-3 w-3" /> {t('sftp.uploadTo')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-red-500 bg-red-500/10 border-b border-border flex items-center justify-between">
          <span className="truncate">{error}</span>
          <Button variant="ghost" size="icon" className="h-4 w-4 shrink-0" onClick={() => setError(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="p-2 border-b space-y-2 max-h-56 overflow-y-auto">
        <Button variant="outline" size="sm" onClick={() => window.api.sftp.stage().then(setStaged).catch((err) => setError(formatFileTransferError(err)))}>添加文件到中转区</Button>
        <p className="text-xs text-muted-foreground">本地文件列表，退出软件后清空。上传使用上方目标目录（支持 ~），请保留原文件。</p>
        {staged.map((file) => <div key={file.id} className="flex items-center gap-1 text-xs">
          <span className="flex-1 truncate" title={file.name}>{file.name}</span>
          <Button size="sm" variant="ghost" disabled={uploadingId !== null} onClick={() => void uploadStaged(file.id)}>{uploadingId === file.id ? '上传中' : '上传'}</Button>
          <Button size="sm" variant="ghost" onClick={() => window.api.sftp.stagedSave(file.id).catch((err) => setError(formatFileTransferError(err)))}>另存</Button>
          <Button size="sm" variant="ghost" disabled={uploadingId === file.id} onClick={() => window.api.sftp.unstage(file.id).then(setStaged).catch((err) => setError(formatFileTransferError(err)))}>移除</Button>
        </div>)}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {creatingDir && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              <form
                className="flex-1 flex gap-1"
                onSubmit={(e) => { e.preventDefault(); handleCreateDir() }}
              >
                <Input
                  className="h-6 text-xs flex-1"
                  placeholder={t('sftp.folderName')}
                  value={newDirName}
                  onChange={(e) => setNewDirName(e.target.value)}
                  autoFocus
                  onBlur={() => { if (!newDirName.trim()) setCreatingDir(false) }}
                />
              </form>
            </div>
          )}

          {entries.slice(filePage * 200, (filePage + 1) * 200).map((entry) => (
            <div
              key={entry.path}
              className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer"
              onClick={() => {
                if (editingName !== entry.name) handleEntryClick(entry)
              }}
              onDoubleClick={() => {
                if (!entry.isDir) handleDownload(entry)
              }}
            >
              {entry.isDir ? (
                <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              ) : (
                <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}

              <div className="flex-1 min-w-0">
                {editingName === entry.name ? (
                  <form
                    className="flex gap-1"
                    onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(entry) }}
                  >
                    <Input
                      className="h-6 text-xs flex-1"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      autoFocus
                      onBlur={() => setEditingName(null)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </form>
                ) : (
                  <>
                    <div className="text-xs font-medium truncate">{entry.name}</div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground">
                      <span>{entry.isDir ? t('sftp.dir') : formatSize(entry.size)}</span>
                      <span>{formatDate(entry.modTime)}</span>
                      <span>{entry.permissions}</span>
                    </div>
                  </>
                )}
              </div>

              {editingName !== entry.name && (
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                  {!entry.isDir && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => { e.stopPropagation(); handleDownload(entry) }}
                      title={t('sftp.download')}
                    >
                      <Download className="h-2.5 w-2.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => { e.stopPropagation(); handleRenameStart(entry) }}
                    title={t('sftp.rename')}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(entry) }}
                    title={t('sftp.delete')}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}

          {!loading && entries.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              {t('sftp.emptyDir')}
            </div>
          )}
        </div>
      </ScrollArea>
      {entries.length > 200 && (
        <div className="flex items-center justify-between p-2 border-t text-xs">
          <Button variant="ghost" size="sm" disabled={filePage === 0} onClick={() => setFilePage(p => p - 1)}>上一页</Button>
          <span>{filePage + 1} / {Math.ceil(entries.length / 200)} · {entries.length} 项</span>
          <Button variant="ghost" size="sm" disabled={(filePage + 1) * 200 >= entries.length} onClick={() => setFilePage(p => p + 1)}>下一页</Button>
        </div>
      )}

      {transfers.length > 0 && (
        <div className="border-t border-border p-2 space-y-1 max-h-48 overflow-y-auto">
          <div className="text-[10px] font-medium text-muted-foreground">{t('sftp.transferQueue')}</div>
          {transfers.map((transfer) => (
            <div key={transfer.transferId} className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] truncate">
                  {transfer.status === 'queued' ? '等待中' : transfer.status === 'finishing' ? '正在完成' : transfer.direction === 'upload' ? t('sftp.uploading') : t('sftp.downloading')} {transfer.fileName}
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 mt-0.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{
                      width: transfer.totalBytes > 0
                        ? `${Math.min(100, (transfer.transferredBytes / transfer.totalBytes) * 100)}%`
                        : '0%'
                    }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatSize(transfer.transferredBytes)} / {formatSize(transfer.totalBytes)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleCancelTransfer(transfer.transferId)}
                disabled={transfer.status === 'finishing'}
                title="Cancel transfer"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.isDir ? '删除远程目录' : '删除远程文件'}
        description={deleteTarget ? `确定删除“${deleteTarget.name}”吗？此操作无法撤销。` : ''}
        onConfirm={() => { if (deleteTarget) void handleDelete(deleteTarget) }}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      />
    </div>
  )
}
