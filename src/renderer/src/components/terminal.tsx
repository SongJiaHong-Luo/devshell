import { useEffect, useRef, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { Copy, ClipboardPaste, CopyPlus, Trash2, RotateCw } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import { useSessionStore } from '@/stores/session-store'
import { useSettingsStore } from '@/stores/settings-store'
import { createLogHighlighter, DEFAULT_LOG_COLORS } from '@/lib/log-parser'
import { createInterruptDisplay } from '@/lib/interrupt-display'
import { createTerminalWriter } from '@/lib/terminal-writer'
import { TerminalSearch } from './terminal-search'
import { ScrollControls } from './scroll-controls'
import type { Server } from '@shared/types/server'
import type { LogLevelColor } from '@/lib/log-parser'

interface TerminalProps {
  sessionId: string
  server: Server
  showSearch?: boolean
  onSearchClose?: () => void
  bastion?: {
    host: string
    port: number
    username: string
    authType: 'password' | 'key'
    password?: string
    privateKeyPath?: string
  }
  bastionCommand?: string
}

export function Terminal({ sessionId, server, showSearch, onSearchClose, bastion, bastionCommand }: TerminalProps): JSX.Element {
  const { t } = useTranslation()
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const highlighterRef = useRef<(data: string) => string>((data) => data)
  const interruptDisplay = useRef(createInterruptDisplay())
  const writerRef = useRef<ReturnType<typeof createTerminalWriter> | null>(null)
  const isAtBottomRef = useRef(true)
  const isPausedRef = useRef(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [selectionTip, setSelectionTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const updateSessionStatus = useSessionStore(state => state.updateSessionStatus)
  const logColors = useSettingsStore(state => state.logColors)

  useEffect(() => {
    const colors: LogLevelColor[] = logColors
      .filter((c) => c.enabled)
      .map((c) => {
        const def = DEFAULT_LOG_COLORS.find((d) => d.level === c.level)
        return {
          level: c.level,
          pattern: def?.pattern || new RegExp(`\\b(${c.level.toUpperCase()})\\b`, 'i'),
          ansiColor: c.ansiColor,
          label: c.level.toUpperCase()
        }
      })
    highlighterRef.current = createLogHighlighter(colors)
  }, [logColors])

  const handleDisconnect = useCallback((closedSessionId: string) => {
    if (closedSessionId === sessionId) updateSessionStatus(sessionId, 'disconnected')
  }, [sessionId, updateSessionStatus])

  const handleError = useCallback(
    (_sid: string, message: string) => {
      if (_sid === sessionId) {
        updateSessionStatus(sessionId, 'error', message)
      }
    },
    [sessionId, updateSessionStatus]
  )

  const handleConnected = useCallback(
    (_sid: string) => {
      if (_sid === sessionId) {
        updateSessionStatus(sessionId, 'connected')
      }
    },
    [sessionId, updateSessionStatus]
  )

  const handleData = useCallback(
    (_sid: string, data: string, consumed: () => void) => {
      if (_sid === sessionId) {
        if (writerRef.current) writerRef.current.push(interruptDisplay.current.format(data), consumed)
        else consumed()
      }
    },
    [sessionId]
  )

  useEffect(() => {
    if (!terminalRef.current) return

    const fontSize = useSettingsStore.getState().fontSize

    const term = new XTerm({
      cursorBlink: true,
      fontSize,
      lineHeight: 1.25,
      letterSpacing: 0.15,
      convertEol: true,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
      scrollback: 2000,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#585b70',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8'
      }
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const searchAddon = new SearchAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.loadAddon(searchAddon)
    term.open(terminalRef.current)

    xtermRef.current = term
    searchAddonRef.current = searchAddon
    const writer = createTerminalWriter((data, done) => {
      const follow = isAtBottomRef.current && !isPausedRef.current
      term.write(highlighterRef.current(data), () => {
        if (follow && !isPausedRef.current) term.scrollToBottom()
        done()
      })
    }, () => Boolean(terminalRef.current?.offsetWidth))
    writerRef.current = writer

    const fitTimer = setTimeout(() => fitAddon.fit(), 100)
    const resizeObserver = new ResizeObserver(() => {
      const dimensions = fitAddon.proposeDimensions()
      if (dimensions && dimensions.rows > 0) term.resize(term.cols, dimensions.rows)
    })
    resizeObserver.observe(terminalRef.current)

    term.onData((data) => {
      window.api.ssh.send(sessionId, data)
    })

    term.onResize(({ cols, rows }) => {
      window.api.ssh.resize(sessionId, cols, rows)
    })

    // Scroll detection: check if user has scrolled away from bottom
    term.onScroll(() => {
      const buffer = term.buffer.active
      const atBottom = buffer.viewportY >= buffer.baseY
      isAtBottomRef.current = atBottom
      setIsAtBottom(atBottom)
    })

    // Ctrl+F to toggle search, Ctrl+C to copy, Ctrl+V to paste
    term.attachCustomKeyEventHandler((event) => {
      if (event.ctrlKey && event.key === 'f' && event.type === 'keydown') {
        return false
      }

      // Ctrl+C copies a selection, otherwise sends only the interrupt signal.
      if (event.ctrlKey && event.key === 'c' && event.type === 'keydown') {
        const selection = term.getSelection()
        if (selection && selection.trim()) {
          navigator.clipboard.writeText(selection).catch((err) => {
            console.error('Failed to copy to clipboard:', err)
          })
          return false // Prevent ^C from being sent
        }
        if (term.buffer.active.type === 'normal') interruptDisplay.current.arm()
        window.api.ssh.send(sessionId, '\u0003')
        return false
      }

      // Ctrl+V: Paste from clipboard
      if (event.ctrlKey && event.key === 'v' && event.type === 'keydown') {
        navigator.clipboard.readText().then((text) => {
          if (text) {
            term.paste(text)
          }
        }).catch((err) => {
          console.error('Failed to read clipboard:', err)
        })
        return false // Prevent ^V from being sent
      }

      return true
    })

    // Right-click to show context menu.
    // Menus are positioned absolutely inside the terminal container, so convert
    // viewport coords (clientX/Y) into container-relative coords by subtracting
    // the container's bounding rect — otherwise the menu is offset by the
    // sidebar width / tab-bar height.
    const termEl = terminalRef.current!
    const handleContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      const rect = termEl.getBoundingClientRect()
      setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    termEl.addEventListener('contextmenu', handleContextMenu)

    // Double-click to show selection menu
    const handleDblClick = async (e: MouseEvent): Promise<void> => {
      setTimeout(() => {
        const selected = term.getSelection()
        if (selected && selected.trim()) {
          const rect = termEl.getBoundingClientRect()
          setSelectionTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: selected })
        }
      }, 10)
    }
    termEl.addEventListener('dblclick', handleDblClick)

    // Click outside to close context menu
    const handleClickOutside = (): void => {
      setContextMenu(null)
    }
    document.addEventListener('click', handleClickOutside)

    window.api.ssh.connect({
      sessionId,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: server.authType,
      password: server.password,
      privateKeyPath: server.privateKeyPath,
      bastion: bastion ? {
        host: bastion.host,
        port: bastion.port,
        username: bastion.username,
        authType: bastion.authType,
        password: bastion.password,
        privateKeyPath: bastion.privateKeyPath
      } : undefined,
      bastionCommand: bastionCommand || undefined
    })

    const unsubData = window.api.ssh.onData(handleData)
    const unsubConnected = window.api.ssh.onConnected(handleConnected)
    const unsubClosed = window.api.ssh.onClosed(handleDisconnect)
    const unsubError = window.api.ssh.onError(handleError)

    // Connection state is shown by the tab/sidebar. Do not write a permanent
    // "connecting" line into the terminal: it becomes stale after connect.

    return () => {
      writer.dispose()
      writerRef.current = null
      clearTimeout(fitTimer)
      resizeObserver.disconnect()
      unsubData()
      unsubConnected()
      unsubClosed()
      unsubError()
      termEl.removeEventListener('contextmenu', handleContextMenu)
      termEl.removeEventListener('dblclick', handleDblClick)
      document.removeEventListener('click', handleClickOutside)
      window.api.ssh.disconnect(sessionId)
      term.dispose()
      xtermRef.current = null
      searchAddonRef.current = null
    }
  }, [
    sessionId,
    server.id,
    server.host,
    server.port,
    server.username,
    server.authType,
    server.password,
    server.privateKeyPath,
    handleData,
    handleConnected,
    handleDisconnect,
    handleError
  ])

  const scrollToBottom = useCallback(() => {
    xtermRef.current?.scrollToBottom()
    isPausedRef.current = false
    setIsPaused(false)
    isAtBottomRef.current = true
    setIsAtBottom(true)
  }, [])

  const togglePause = useCallback(() => {
    isPausedRef.current = !isPausedRef.current
    setIsPaused(isPausedRef.current)
    if (!isPausedRef.current) {
      scrollToBottom()
    }
  }, [scrollToBottom])

  // Context menu handlers
  const handleClear = useCallback(() => {
    const term = xtermRef.current
    if (term) {
      term.clear()
      const row = Math.max(1, Math.floor(term.rows / 2))
      term.write(`\x1b[${row}T\x1b[${row + 1};${term.buffer.active.cursorX + 1}H`)
    }
    setContextMenu(null)
    xtermRef.current?.focus()
  }, [])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        xtermRef.current?.paste(text)
      }
    } catch (error) {
      console.error('Failed to paste:', error)
    }
    setContextMenu(null)
    setSelectionTip(null)
    xtermRef.current?.focus()
  }, [])

  const handleCopyPasteToTerminal = useCallback(async () => {
    const selected = selectionTip?.text || xtermRef.current?.getSelection()
    if (!selected) return
    try {
      await navigator.clipboard.writeText(selected)
      xtermRef.current?.paste(selected)
    } catch (error) {
      console.error('Failed to copy and paste to terminal:', error)
    }
    setSelectionTip(null)
    xtermRef.current?.focus()
  }, [selectionTip])

  const handleCopy = useCallback(async () => {
    const term = xtermRef.current
    if (term) {
      const selected = selectionTip?.text || term.getSelection()
      if (selected && selected.trim()) {
        try {
          await navigator.clipboard.writeText(selected)
        } catch (error) {
          console.error('Failed to copy:', error)
        }
      }
    }
    setContextMenu(null)
    setSelectionTip(null)
    xtermRef.current?.focus()
  }, [selectionTip])

  const handleReconnect = useCallback(() => {
    window.api.ssh.disconnect(sessionId)
    xtermRef.current?.clear()
    setContextMenu(null)
    xtermRef.current?.focus()
    // Reconnect using the bastion config passed as prop
    window.api.ssh.connect({
      sessionId,
      host: server.host,
      port: server.port,
      username: server.username,
      authType: server.authType,
      password: server.password,
      privateKeyPath: server.privateKeyPath,
      bastion: bastion ? {
        host: bastion.host,
        port: bastion.port,
        username: bastion.username,
        authType: bastion.authType,
        password: bastion.password,
        privateKeyPath: bastion.privateKeyPath
      } : undefined,
      bastionCommand: bastionCommand || undefined
    })
  }, [sessionId, server, bastion, bastionCommand])

  // Reconnect when triggered from tab bar double-click
  const reconnectTrigger = useSessionStore((state) =>
    state.sessions.find((s) => s.id === sessionId)?.reconnectTrigger ?? 0
  )
  const prevReconnectTriggerRef = useRef(0)
  useEffect(() => {
    if (reconnectTrigger > 0 && reconnectTrigger !== prevReconnectTriggerRef.current) {
      handleReconnect()
    }
    prevReconnectTriggerRef.current = reconnectTrigger
  }, [reconnectTrigger, handleReconnect])

  // Focus terminal when triggered externally (e.g. after quick command execution)
  const focusTrigger = useSessionStore((state) =>
    state.sessions.find((s) => s.id === sessionId)?.focusTrigger ?? 0
  )
  const prevFocusTriggerRef = useRef(0)
  useEffect(() => {
    if (focusTrigger !== prevFocusTriggerRef.current) {
      xtermRef.current?.focus()
    }
    prevFocusTriggerRef.current = focusTrigger
  }, [focusTrigger])

  return (
    <div className="relative w-full h-full">
      <div ref={terminalRef} className="w-full h-full overflow-x-auto" />
      {showSearch && searchAddonRef.current && (
        <TerminalSearch
          searchAddon={searchAddonRef.current}
          onClose={() => onSearchClose?.()}
        />
      )}
      {selectionTip && (
        <div
          className="absolute bg-popover border border-border rounded-md shadow-lg p-1 z-50 flex gap-1"
          style={{ left: selectionTip.x, top: selectionTip.y }}
          onMouseLeave={() => setSelectionTip(null)}
        >
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-accent rounded"
            title={t('terminal.copyToClipboard')}
          >
            <Copy className="w-3 h-3" />
            {t('terminal.copy')}
          </button>
          <button
            onClick={handlePaste}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-accent rounded"
            title={t('terminal.pasteToTerminal')}
          >
            <ClipboardPaste className="w-3 h-3" />
            {t('terminal.paste')}
          </button>
          <button
            onClick={handleCopyPasteToTerminal}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-accent rounded"
            title={t('terminal.copyPasteToTerminal')}
          >
            <CopyPlus className="w-3 h-3" />
            {t('terminal.copyPasteToTerminal')}
          </button>
        </div>
      )}
      {contextMenu && (
        <div
          className="absolute bg-popover border border-border rounded-md shadow-lg p-1 z-50 flex flex-col"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded text-left w-full"
          >
            <Trash2 className="w-4 h-4" />
            {t('terminal.clearScreen')}
          </button>
          <button
            onClick={handlePaste}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded text-left w-full"
          >
            <ClipboardPaste className="w-4 h-4" />
            {t('terminal.paste')}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded text-left w-full"
          >
            <Copy className="w-4 h-4" />
            {t('terminal.copy')}
          </button>
          <button
            onClick={handleReconnect}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded text-left w-full"
          >
            <RotateCw className="w-4 h-4" />
            {t('terminal.reconnect')}
          </button>
          <button onClick={handleCopyPasteToTerminal} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded text-left w-full">
            <CopyPlus className="w-4 h-4" />{t('terminal.copyPasteToTerminal')}
          </button>
        </div>
      )}
      <ScrollControls
        isAtBottom={isAtBottom}
        isPaused={isPaused}
        onScrollToBottom={scrollToBottom}
        onTogglePause={togglePause}
      />
    </div>
  )
}
