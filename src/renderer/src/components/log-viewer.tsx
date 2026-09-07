import { useEffect, useRef, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSessionStore } from '@/stores/session-store'
import { useServerStore } from '@/stores/server-store'
import { Loader2, AlertCircle } from 'lucide-react'
import type { Container } from '@shared/types/server'
import { clampInteger, shellQuote } from '@/lib/shell-escape'
import { createLogHighlighter, DEFAULT_LOG_COLORS } from '@/lib/log-parser'
import { createTerminalWriter } from '@/lib/terminal-writer'
import '@xterm/xterm/css/xterm.css'

interface LogViewerProps {
  sessionId: string
  serverId: string
  containerName: string
  filePath: string
}

export function LogViewer({ sessionId, serverId, containerName, filePath }: LogViewerProps): JSX.Element {
  const { t } = useTranslation()
  const { sessions, updateSessionStatus } = useSessionStore()
  const { projects } = useServerStore()
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [streamId, setStreamId] = useState(() => `stream-${sessionId}`)
  const [status, setStatus] = useState<'connecting' | 'streaming' | 'disconnected' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState('')

  // Find a connected terminal session for this server
  const terminalSession = sessions.find(
    (s) => s.serverId === serverId && s.status === 'connected' && !s.sessionType
  )

  // containerName prop is the actual container name (e.g. "my-app-container")
  // Find container config
  const containerConfig: Container | undefined = (() => {
    if (!containerName) return undefined
    for (const p of projects) {
      for (const s of p.servers || []) {
        if (s.id === serverId) return s.containers?.find((c) => c.name === containerName)
      }
      for (const g of p.groups || []) {
        const srv = g.servers?.find((s) => s.id === serverId)
        if (srv) return srv.containers?.find((c) => c.name === containerName)
        const found = findContainerInGroups(g.groups || [], serverId, containerName)
        if (found) return found
      }
    }
    return undefined
  })()

  const streamMode = containerConfig?.logStreamMode ?? 'stream'
  const lineCount = containerConfig?.logLineCount ?? 500
  const containerImage = containerConfig?.image

  // Build docker exec prefix when viewing container logs
  const dockerPrefix = useMemo(() => {
    return containerImage ? `docker exec -- ${shellQuote(containerImage)} ` : ''
  }, [containerImage])

  const safeLineCount = clampInteger(lineCount, 1, 2000)

  useEffect(() => {
    if (!terminalRef.current || !terminalSession) return

    const term = new XTerm({
      cursorBlink: false,
      fontSize: 14,
      lineHeight: 1.25,
      convertEol: true,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
      scrollback: 2000,
      disableStdin: true,
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5'
      }
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()
    xtermRef.current = term
    fitAddonRef.current = fitAddon

    let fitted = Boolean(terminalRef.current.offsetWidth)
    const resizeObserver = new ResizeObserver(() => {
      const dimensions = fitAddon.proposeDimensions()
      if (!dimensions || dimensions.rows <= 0 || dimensions.cols <= 0) return
      term.resize(fitted ? term.cols : dimensions.cols, dimensions.rows)
      fitted = true
    })
    resizeObserver.observe(terminalRef.current)

    const cmd =
      streamMode === 'stream'
        ? `${dockerPrefix}tail -f -n ${safeLineCount} -- ${shellQuote(filePath)} 2>&1`
        : `${dockerPrefix}tail -n ${safeLineCount} -- ${shellQuote(filePath)} 2>&1`

    setStatus('connecting')
    term.writeln(`\x1b[33m>>> ${cmd}\x1b[0m\r\n`)

    // Listen for streaming data
    const highlight = createLogHighlighter(DEFAULT_LOG_COLORS)
    const writer = createTerminalWriter((data, done) => term.write(highlight(data), done),
      () => Boolean(terminalRef.current?.offsetWidth))
    let receivedData = false
    const unsubData = window.api.ssh.onExecStreamData((sid, data, consumed) => {
      if (sid !== streamId) return
      if (!receivedData) { receivedData = true; setStatus('streaming') }
      writer.push(data, consumed)
    })

    const unsubEnd = window.api.ssh.onExecStreamEnd((sid) => {
      if (sid !== streamId) return
      writer.push('\r\n\x1b[33m<<< Log stream ended\x1b[0m\r\n')
      setStatus('disconnected')
    })

    const unsubError = window.api.ssh.onExecStreamError((sid, message) => {
      if (sid !== streamId) return
      writer.push(`\x1b[31m${message}\x1b[0m\r\n`)
      setErrorMsg(message)
      setStatus('error')
    })

    // Handle server disconnect
    const unsubClosed = window.api.ssh.onClosed((sid) => {
      if (sid !== terminalSession.id) return
      writer.push('\r\n\x1b[31m>>> Server disconnected\x1b[0m\r\n')
      setStatus('disconnected')
      updateSessionStatus(sessionId, 'disconnected')
    })

    // Start the stream
    window.api.ssh.execStreamStart(terminalSession.id, streamId, cmd)

    return () => {
      writer.dispose()
      unsubData()
      unsubEnd()
      unsubError()
      unsubClosed()
      window.api.ssh.execStreamStop(streamId)
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [sessionId, terminalSession?.id, filePath, streamMode, safeLineCount, dockerPrefix, streamId])

  // Reconnect trigger from tab bar double-click
  const reconnectTrigger = useSessionStore(
    (state) => state.sessions.find((s) => s.id === sessionId)?.reconnectTrigger ?? 0
  )
  const prevTriggerRef = useRef(0)
  useEffect(() => {
    if (reconnectTrigger > 0 && reconnectTrigger !== prevTriggerRef.current) {
      setStatus('connecting')
      setErrorMsg('')
      if (xtermRef.current) {
        xtermRef.current.clear()
        xtermRef.current.writeln('\x1b[33m>>> Reconnecting...\x1b[0m\r\n')
      }
      setStreamId(`stream-${sessionId}-${Date.now()}`)
    }
    prevTriggerRef.current = reconnectTrigger
  }, [reconnectTrigger, sessionId])

  if (!terminalSession) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <AlertCircle className="w-8 h-8 text-yellow-500" />
        <p className="text-sm">{t('logBrowser.notConnected')}</p>
        <p className="text-xs text-muted-foreground">{t('logBrowser.connectFirst')}</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <div className="absolute bottom-1 right-4 z-10 text-[10px] text-muted-foreground bg-background/80 px-1 pointer-events-none">保留最近 2000 行历史</div>
      {status === 'connecting' && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 bg-background/80 px-2 py-1 rounded text-xs">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('logViewer.connecting')}
        </div>
      )}
      {status === 'disconnected' && (
        <div className="absolute top-2 right-2 z-10 bg-destructive/10 text-destructive px-2 py-1 rounded text-xs">
          {t('logViewer.disconnected')}
        </div>
      )}
      {status === 'error' && (
        <div className="absolute top-2 right-2 z-10 bg-destructive/10 text-destructive px-2 py-1 rounded text-xs">
          {errorMsg || t('logViewer.error')}
        </div>
      )}
      <div ref={terminalRef} className="w-full h-full overflow-x-auto" />
    </div>
  )
}

function findContainerInGroups(
  groups: { servers?: { id: string; containers?: Container[] }[]; groups?: typeof groups }[],
  serverId: string,
  containerName: string
): Container | undefined {
  for (const group of groups) {
    const srv = group.servers?.find((s) => s.id === serverId)
    if (srv) return srv.containers?.find((c) => c.name === containerName)
    if (group.groups) {
      const found = findContainerInGroups(group.groups, serverId, containerName)
      if (found) return found
    }
  }
  return undefined
}
