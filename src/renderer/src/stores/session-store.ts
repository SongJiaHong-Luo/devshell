import { create } from 'zustand'
import type { Server, BastionConfig } from '@shared/types/server'

export type SessionType = 'log-viewer'

export interface Session {
  id: string
  serverId: string
  serverName: string
  host: string
  port: number
  username: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  errorMessage?: string
  groupPath?: string[]  // Group IDs from project root to immediate parent
  bastion?: BastionConfig  // Bastion config from the group hierarchy
  bastionCommand?: string  // Menu command to send to bastion (e.g. "146")
  reconnectTrigger: number  // Incremented to signal reconnect from tab bar
  focusTrigger: number  // Incremented to signal terminal should focus
  // Log session fields
  sessionType?: SessionType  // 'log-viewer' | undefined (terminal)
  containerId?: string       // container id for log sessions
  logFilePath?: string       // file path for log-viewer sessions
  logPath?: string
}

interface SessionStore {
  sessions: Session[]
  activeSessionId: string | null

  openSession: (server: Server, groupPath?: string[], bastion?: BastionConfig, bastionCommand?: string) => string
  openLogViewer: (serverId: string, serverName: string, filePath: string, containerId: string, logPath: string) => string
  closeSession: (sessionId: string) => void
  setActiveSession: (sessionId: string) => void
  updateSessionStatus: (sessionId: string, status: Session['status'], errorMessage?: string) => void
  updateSessionName: (serverId: string, newName: string) => void
  reconnectSession: (sessionId: string) => void
  focusSession: (sessionId: string) => void
}

let sessionCounter = 0

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  openSession: (server, groupPath, bastion, bastionCommand) => {
    const existing = get().sessions.find((s) => s.serverId === server.id)
    if (existing) {
      set({ activeSessionId: existing.id })
      return existing.id
    }
    const sessionId = `session-${++sessionCounter}-${Date.now()}`
    const session: Session = {
      id: sessionId,
      serverId: server.id,
      serverName: server.name,
      host: server.host,
      port: server.port,
      username: server.username,
      status: 'connecting',
      groupPath,
      bastion,
      bastionCommand,
      reconnectTrigger: 0,
      focusTrigger: 0
    }
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: sessionId
    }))
    return sessionId
  },

  openLogViewer: (serverId, _serverName, filePath, containerId, logPath) => {
    const sessionId = `logview-${++sessionCounter}-${Date.now()}`
    const session: Session = {
      id: sessionId,
      serverId,
      serverName: filePath.split('/').pop() || filePath,
      host: '',
      port: 22,
      username: '',
      status: 'connected',
      reconnectTrigger: 0,
      focusTrigger: 0,
      sessionType: 'log-viewer',
      containerId,
      logPath,
      logFilePath: filePath
    }
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: sessionId
    }))
    return sessionId
  },

  closeSession: (sessionId) => {
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== sessionId)
      const activeSessionId =
        state.activeSessionId === sessionId
          ? sessions.length > 0
            ? sessions[sessions.length - 1].id
            : null
          : state.activeSessionId
      return { sessions, activeSessionId }
    })
  },

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  updateSessionStatus: (sessionId, status, errorMessage) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status, errorMessage } : s
      )
    }))
  },

  updateSessionName: (serverId, newName) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.serverId === serverId ? { ...s, serverName: newName } : s
      )
    }))
  },

  reconnectSession: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, reconnectTrigger: s.reconnectTrigger + 1 } : s
      )
    }))
  },

  focusSession: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, focusTrigger: s.focusTrigger + 1 } : s
      )
    }))
  }
}))
