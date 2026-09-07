import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSessionStore } from '@/stores/session-store'
import { useServerStore } from '@/stores/server-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Loader2, AlertCircle, Wifi, WifiOff, Pencil, FileText } from 'lucide-react'
import { showWarning } from '@/stores/toast-store'

export function TabBar(): JSX.Element | null {
  const { t } = useTranslation()
  const { sessions, activeSessionId, setActiveSession, closeSession, updateSessionName, reconnectSession } = useSessionStore()
  const { renameServer } = useServerStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus()
      renameRef.current.select()
    }
  }, [renamingId])

  useEffect(() => {
    const close = (): void => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  if (sessions.length === 0) return null

  const handleClose = (e: React.MouseEvent, sessionId: string): void => {
    e.stopPropagation()
    window.api.ssh.disconnect(sessionId)
    closeSession(sessionId)
  }

  const handleContextMenu = (e: React.MouseEvent, sessionId: string): void => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId })
  }

  const handleRenameStart = (sessionId: string): void => {
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return
    setRenameValue(session.serverName)
    setRenamingId(sessionId)
    setContextMenu(null)
  }

  const handleRenameSubmit = async (session: typeof sessions[0]): Promise<void> => {
    const newName = renameValue.trim()
    if (!newName || newName === session.serverName) {
      setRenamingId(null)
      return
    }
    const result = await renameServer(session.serverId, newName)
    if (result.success) {
      updateSessionName(session.serverId, newName)
      setRenamingId(null)
    } else if (result.error === 'duplicate') {
      showWarning(t('tab.duplicateName'))
    }
  }

  const statusIcon = (status: string): JSX.Element => {
    switch (status) {
      case 'connecting':
        return <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
      case 'connected':
        return <Wifi className="h-3 w-3 text-green-500" />
      case 'error':
        return <AlertCircle className="h-3 w-3 text-red-500" />
      default:
        return <WifiOff className="h-3 w-3 text-muted-foreground" />
    }
  }

  return (
    <div className="flex items-center border-b border-border bg-card overflow-x-auto">
      {sessions.map((session) => (
        <div
          key={session.id}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer border-r border-border shrink-0 ${
            activeSessionId === session.id
              ? 'bg-background text-foreground'
              : 'text-muted-foreground hover:bg-accent/50'
          }`}
          onClick={() => setActiveSession(session.id)}
          onDoubleClick={() => reconnectSession(session.id)}
          onContextMenu={(e) => handleContextMenu(e, session.id)}
          title={session.sessionType === 'log-viewer'
            ? session.logFilePath || session.serverName
            : `${session.username}@${session.host}:${session.port}`
          }
        >
          {session.sessionType === 'log-viewer' ? (
            <FileText className="h-3 w-3 text-blue-500" />
          ) : (
            statusIcon(session.status)
          )}
          {renamingId === session.id ? (
            <form
              onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(session) }}
              onClick={(e) => e.stopPropagation()}
            >
              <Input
                ref={renameRef}
                className="h-5 w-24 text-xs px-1"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRenameSubmit(session)}
                onKeyDown={(e) => { if (e.key === 'Escape') setRenamingId(null) }}
              />
            </form>
          ) : (
            <span className="max-w-[120px] truncate">{session.serverName}</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 ml-1 shrink-0 hover:bg-destructive/20"
            onClick={(e) => handleClose(e, session.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-md shadow-md py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent"
            onClick={() => handleRenameStart(contextMenu.sessionId)}
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('tab.rename')}
          </button>
        </div>
      )}
    </div>
  )
}
