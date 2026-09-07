import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useServerStore } from '@/stores/server-store'
import { useSessionStore } from '@/stores/session-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  FolderOpen,
  Server,
  Box,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  Upload,
  Wifi,
  Link,
  Folders,
  Shield,
  Folder,
  FileText,
  RefreshCw
} from 'lucide-react'
import { ProjectDialog } from './project-dialog'
import { ServerDialog } from './server-dialog'
import { ContainerDialog } from './container-dialog'
import { ConfirmDialog } from './confirm-dialog'
import { GroupDialog } from './group-dialog'
import type { Project, Server as ServerType, Container, Group } from '@shared/types/server'
import { showError } from '@/stores/toast-store'
import { shellQuote } from '@/lib/shell-escape'

export function ServerSidebar(): JSX.Element {
  const { t } = useTranslation()
  const {
    projects,
    searchQuery,
    expandedIds,
    selectedId,
    setSearchQuery,
    toggleExpanded,
    setSelected,
    fetchProjects,
    deleteProject,
    deleteServer,
    deleteContainer,
    exportConfig,
    importConfig,
    deleteGroup,
    dissolveGroup
  } = useServerStore()

  const { sessions, openSession, openLogViewer } = useSessionStore()

  // Dialog states
  const [projectDialog, setProjectDialog] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    project?: Project
  }>({ open: false, mode: 'create' })

  const [serverDialog, setServerDialog] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    projectId?: string
    groupPath?: string[]
    server?: ServerType
  }>({ open: false, mode: 'create' })

  const [containerDialog, setContainerDialog] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    projectId?: string
    serverId?: string
    container?: Container
  }>({ open: false, mode: 'create' })

  const [groupDialog, setGroupDialog] = useState<{
    open: boolean
    mode: 'create' | 'edit' | 'create-sub'
    projectId?: string
    parentGroupId?: string
    group?: Group
  }>({ open: false, mode: 'create' })

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {}
  })

  // Log tree state: maps "containerKey:/path" to its children entries
  const [directoryContents, setDirectoryContents] = useState<
    Record<string, { name: string; isDirectory: boolean; size: string; date: string }[]>
  >({})

  function parseLsOutput(output: string): { name: string; isDirectory: boolean; size: string; date: string }[] {
    const entries: { name: string; isDirectory: boolean; size: string; date: string }[] = []
    const lines = output.split('\n').filter((l) => l.trim())
    for (const line of lines) {
      // Strip ANSI escape codes — handle both \x1b[...m and bare [...m that
      // might appear after the ESC character was consumed somewhere in the pipe.
      const clean = line
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\x1b/g, '')
        .trim()
      if (!clean) continue
      // Skip the "total NNN" line
      if (/^total\s+\d+/.test(clean)) continue
      const parts = clean.split(/\s+/)
      if (parts.length < 9) continue
      const name = parts.slice(8).join(' ')
      if (name === '.' || name === '..') continue
      entries.push({
        name,
        isDirectory: parts[0].startsWith('d'),
        size: parts[4],
        date: `${parts[5]} ${parts[6]} ${parts[7]}`
      })
    }
    return entries
  }

  async function handleContainerClick(
    serverId: string,
    containerKey: string,
    container: Container
  ): Promise<void> {
    const termSession = useSessionStore.getState().sessions.find(
      (s) => s.serverId === serverId && s.status === 'connected' && !s.sessionType
    )

    if (!termSession) {
      showError(t('logBrowser.notConnected'))
      return
    }

    const mapKey = `${containerKey}:${container.logPath}`
    if (directoryContents[mapKey]) {
      setDirectoryContents((prev) => {
        const next = { ...prev }
        delete next[mapKey]
        return next
      })
      return
    }
    try {
      const markerBegin = `__B_${Math.random().toString(36).slice(2)}__`
      const markerEnd = `__E_${Math.random().toString(36).slice(2)}__`
      const cmd = `echo ${markerBegin} && ls -la --color=never -- ${shellQuote(container.logPath)} 2>&1 && echo ${markerEnd}\n`

      let output = ''
      let overflow = false
      const handler = (_sid: string, data: string) => {
        if (_sid === termSession.id && !overflow) {
          if (output.length + data.length > 1024 * 1024) overflow = true
          else output += data
        }
      }
      const unsub = window.api.ssh.onData(handler)

      window.api.ssh.send(termSession.id, cmd)

      // Wait for end marker with timeout
      for (let i = 0; i < 100; i++) {
        await new Promise(r => setTimeout(r, 100))
        if (overflow || output.includes(markerEnd)) break
      }
      unsub()
      if (overflow) { showError('目录输出过大，请使用 SFTP 文件面板浏览'); return }

      // Extract content between markers
      const beginIdx = output.indexOf(markerBegin)
      const endIdx = output.indexOf(markerEnd)
      let result = ''
      if (beginIdx >= 0 && endIdx > beginIdx) {
        result = output.substring(beginIdx + markerBegin.length, endIdx)
          .replace(/\r/g, '')
          .trim()
      }

      if (result.trim()) {
        console.log('[HCC] raw result (first 600):', JSON.stringify(result.substring(0, 600)))
        const entries = parseLsOutput(result)
        console.log('[HCC] entries count:', entries.length)
        if (entries.length > 0) {
          console.log('[HCC] setting directory contents')
          setDirectoryContents((prev) => ({ ...prev, [mapKey]: entries }))
        } else {
          console.log('[HCC] parseLsOutput returned 0 entries')
        }
      } else {
        console.log('[HCC] result.trim() is empty')
      }
    } catch (err: any) {
      showError(err?.message || 'Failed to list directory')
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Recursive search in groups
  const searchInGroup = useCallback(
    (
      group: Group,
      query: string,
      projectId: string,
      parentPath: string[]
    ): {
      group: Group | null
      hasMatch: boolean
      matchedPaths: Set<string>
    } => {
      const lowerQuery = query.toLowerCase()
      const currentPath = [...parentPath, group.id]
      const groupKey = `${projectId}-group-${currentPath.join('/')}`

      let hasDirectMatch = group.name.toLowerCase().includes(lowerQuery)
      const matchedPaths = new Set<string>()

      if (hasDirectMatch) {
        matchedPaths.add(groupKey)
      }

      // Search in child groups
      const matchedChildGroups: Group[] = []
      if (group.groups) {
        for (const childGroup of group.groups) {
          const result = searchInGroup(childGroup, query, projectId, currentPath)
          if (result.hasMatch) {
            matchedChildGroups.push(result.group!)
            result.matchedPaths.forEach((p) => matchedPaths.add(p))
            hasDirectMatch = true
          }
        }
      }

      // Search in servers
      const matchedServers =
        group.servers?.filter(
          (server) =>
            server.name.toLowerCase().includes(lowerQuery) ||
            server.host?.toLowerCase().includes(lowerQuery)
        ) || []

      if (matchedServers.length > 0) {
        hasDirectMatch = true
      }

      if (!hasDirectMatch) {
        return { group: null, hasMatch: false, matchedPaths }
      }

      return {
        group: {
          ...group,
          groups: matchedChildGroups,
          servers: matchedServers
        },
        hasMatch: true,
        matchedPaths
      }
    },
    []
  )

  // Filtered projects based on search
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return projects
    }

    const lowerQuery = searchQuery.toLowerCase()
    const filtered: Project[] = []

    for (const project of projects) {
      const projectMatches = project.name.toLowerCase().includes(lowerQuery)

      // Search in groups
      const matchedGroups: Group[] = []
      const allMatchedPaths = new Set<string>()

      if (project.groups) {
        for (const group of project.groups) {
          const result = searchInGroup(group, searchQuery, project.id, [])
          if (result.hasMatch) {
            matchedGroups.push(result.group!)
            result.matchedPaths.forEach((p) => allMatchedPaths.add(p))
          }
        }
      }

      // Search in project-level servers
      const matchedServers =
        project.servers?.filter(
          (server) =>
            server.name.toLowerCase().includes(lowerQuery) ||
            server.host?.toLowerCase().includes(lowerQuery)
        ) || []

      if (projectMatches || matchedGroups.length > 0 || matchedServers.length > 0) {
        filtered.push({
          ...project,
          groups: matchedGroups,
          servers: matchedServers
        })
      }
    }

    return filtered
  }, [projects, searchQuery, searchInGroup])

  // Auto-expand paths that match the current search query.
  // Done in an effect (not inside the filter memo) so we never call setState
  // during render, which would risk an infinite re-render loop.
  useEffect(() => {
    if (!searchQuery.trim()) return

    const lowerQuery = searchQuery.toLowerCase()
    const pathsToExpand = new Set<string>()

    for (const project of projects) {
      const matchedGroups: Group[] = []
      if (project.groups) {
        for (const group of project.groups) {
          const result = searchInGroup(group, searchQuery, project.id, [])
          if (result.hasMatch) {
            matchedGroups.push(result.group!)
            result.matchedPaths.forEach((p) => pathsToExpand.add(p))
          }
        }
      }
      const matchedServers =
        project.servers?.filter(
          (server) =>
            server.name.toLowerCase().includes(lowerQuery) ||
            server.host?.toLowerCase().includes(lowerQuery)
        ) || []

      if (project.name.toLowerCase().includes(lowerQuery) || matchedGroups.length > 0 || matchedServers.length > 0) {
        pathsToExpand.add(`${project.id}-project`)
      }
    }

    pathsToExpand.forEach((path) => {
      if (!expandedIds.has(path)) {
        toggleExpanded(path)
      }
    })
  }, [searchQuery, projects, searchInGroup, expandedIds, toggleExpanded])

  // Handlers
  const handleExport = useCallback(async () => {
    await exportConfig()
  }, [exportConfig])

  const handleImport = useCallback(async () => {
    await importConfig()
  }, [importConfig])

  const handleConnectServer = useCallback(
    (server: ServerType, groupPath: string[]) => {
      // Find bastion config from the group hierarchy
      let bastion: typeof projects[0]['groups'][0]['bastion'] | undefined
      if (groupPath.length > 0) {
        // We need to find the innermost group's bastion
        const project = projects.find(p =>
          // Check if server belongs to this project
          findServerInProjectGroups(p, server.id, groupPath) !== null
        )
        if (project) {
          bastion = findBastionInPath(project, groupPath)
        }
      }

      const sessionId = openSession(server, groupPath, bastion, server.bastionCommand)
      setSelected(sessionId)
    },
    [openSession, setSelected, projects]
  )

  // Helper to find bastion config in group path (innermost group's bastion takes precedence)
  const findBastionInPath = (project: Project, groupPath: string[]): typeof project.groups[0]['bastion'] | undefined => {
    let currentGroups = project.groups || []
    let foundBastion: typeof project.groups[0]['bastion'] | undefined

    for (const groupId of groupPath) {
      const group = currentGroups.find(g => g.id === groupId)
      if (!group) break
      if (group.bastion) {
        foundBastion = group.bastion // Innermost bastion wins
      }
      currentGroups = group.groups || []
    }

    return foundBastion
  }

  // Helper to check if server exists in project's group hierarchy
  const findServerInProjectGroups = (project: Project, serverId: string, groupPath: string[]): ServerType | null => {
    let currentGroups = project.groups || []

    for (let i = 0; i < groupPath.length; i++) {
      const groupId = groupPath[i]
      const group = currentGroups.find(g => g.id === groupId)
      if (!group) return null

      // If this is the last group in path, search for server here
      if (i === groupPath.length - 1) {
        return group.servers?.find(s => s.id === serverId) || null
      }

      currentGroups = group.groups || []
    }

    return null
  }

  // handleConnectContainer removed — containers don't support direct SSH connection.
  // Their purpose is to browse log directories and open log files via LogViewer.

  // GroupNode Component
  interface GroupNodeProps {
    project: Project
    group: Group
    parentGroupId?: string
    groupPath: string[]
  }

  const GroupNode = useCallback(
    ({ project, group, parentGroupId, groupPath }: GroupNodeProps) => {
      const currentPath = [...groupPath, group.id]
      const groupKey = `${project.id}-group-${currentPath.join('/')}`
      const isExpanded = expandedIds.has(groupKey)
      const isSelected = selectedId === groupKey
      const hasBastion = !!group.bastion

      return (
        <div key={groupKey}>
          <div
            className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent rounded-md ${
              isSelected ? 'bg-accent' : ''
            }`}
            onClick={() => {
              toggleExpanded(groupKey)
              setSelected(groupKey)
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(groupKey)
              }}
              className="p-0.5 hover:bg-accent rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            <Folders className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {hasBastion && <Shield className="w-3 h-3 text-blue-500 flex-shrink-0" />}
            <span className="text-sm truncate flex-1">{group.name}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-1 hover:bg-accent rounded opacity-0 group-hover:opacity-100">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setGroupDialog({
                      open: true,
                      mode: 'edit',
                      projectId: project.id,
                      parentGroupId,
                      group
                    })
                  }}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {t('sidebar.editGroup')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setGroupDialog({
                      open: true,
                      mode: 'create-sub',
                      projectId: project.id,
                      parentGroupId: group.id
                    })
                  }}
                >
                  <Folders className="w-4 h-4 mr-2" />
                  {t('sidebar.addSubGroup')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setServerDialog({
                      open: true,
                      mode: 'create',
                      projectId: project.id,
                      groupPath: currentPath
                    })
                  }}
                >
                  <Server className="w-4 h-4 mr-2" />
                  {t('sidebar.addServer')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setConfirmDialog({
                      open: true,
                      title: t('sidebar.dissolveGroup'),
                      description: t('sidebar.dissolveGroupConfirm', { name: group.name }),
                      onConfirm: () => {
                        dissolveGroup(project.id, group.id, parentGroupId)
                      }
                    })
                  }}
                >
                  <Link className="w-4 h-4 mr-2" />
                  {t('sidebar.dissolveGroup')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setConfirmDialog({
                      open: true,
                      title: t('sidebar.deleteGroup'),
                      description: t('sidebar.deleteGroupConfirm', { name: group.name }),
                      onConfirm: () => {
                        deleteGroup(project.id, group.id, parentGroupId)
                      }
                    })
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('sidebar.deleteGroup')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isExpanded && (
            <div className="ml-4">
              {group.groups?.map((childGroup) => (
                <GroupNode
                  key={childGroup.id}
                  project={project}
                  group={childGroup}
                  parentGroupId={group.id}
                  groupPath={currentPath}
                />
              ))}
              {group.servers?.map((server) => (
                <ServerNode
                  key={server.id}
                  project={project}
                  server={server}
                  groupPath={currentPath}
                />
              ))}
            </div>
          )}
        </div>
      )
    },
    [
      expandedIds,
      selectedId,
      toggleExpanded,
      setSelected,
      t,
      dissolveGroup,
      deleteGroup
    ]
  )

  // Click-timing refs for single/double-click detection
  const clickTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  useEffect(() => {
    const timers = clickTimersRef.current
    return () => {
      timers.forEach(t => clearTimeout(t))
      timers.clear()
    }
  }, [])

  // ServerNode Component
  interface ServerNodeProps {
    project: Project
    server: ServerType
    groupPath: string[]
  }

  const ServerNode = useCallback(
    ({ project, server, groupPath }: ServerNodeProps) => {
      const serverKey = `${project.id}-${server.id}`
      const isExpanded = expandedIds.has(serverKey)
      const isSelected = selectedId === serverKey

      const handleClick = () => {
        const timers = clickTimersRef.current
        const existing = timers.get(serverKey)
        if (existing) {
          clearTimeout(existing)
          timers.delete(serverKey)
          handleConnectServer(server, groupPath)
        } else {
          const timer = setTimeout(() => {
            timers.delete(serverKey)
            toggleExpanded(serverKey)
          }, 300)
          timers.set(serverKey, timer)
        }
      }

      return (
        <div key={serverKey} className="group">
          <div
            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent rounded-md ${
              isSelected ? 'bg-accent' : ''
            }`}
            onClick={handleClick}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(serverKey)
              }}
              className="p-0.5 hover:bg-accent rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            <Server className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 truncate">
              <div className="text-sm truncate">{server.name}</div>
              <div className="text-xs text-muted-foreground truncate">{server.host}</div>
            </div>
            <Wifi className="w-3 h-3 text-green-500 flex-shrink-0 opacity-0 group-hover:opacity-100" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-1 hover:bg-accent rounded opacity-0 group-hover:opacity-100">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    handleConnectServer(server, groupPath)
                  }
                >
                  <Wifi className="w-4 h-4 mr-2" />
                  {t('sidebar.connect')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setServerDialog({
                      open: true,
                      mode: 'edit',
                      projectId: project.id,
                      groupPath,
                      server
                    })
                  }}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {t('sidebar.editServer')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setContainerDialog({
                      open: true,
                      mode: 'create',
                      projectId: project.id,
                      serverId: server.id
                    })
                  }}
                >
                  <Box className="w-4 h-4 mr-2" />
                  {t('sidebar.addContainer')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setConfirmDialog({
                      open: true,
                      title: t('sidebar.deleteServer'),
                      description: t('sidebar.deleteServerConfirm', { name: server.name }),
                      onConfirm: () => {
                        deleteServer(project.id, server.id)
                      }
                    })
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('sidebar.deleteServer')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isExpanded && server.containers && server.containers.length > 0 && (
            <div className="ml-8">
              {server.containers.map((container) => (
                <ContainerNode
                  key={container.name}
                  project={project}
                  server={server}
                  container={container}
                />
              ))}
            </div>
          )}
        </div>
      )
    },
    [
      expandedIds,
      selectedId,
      toggleExpanded,
      setSelected,
      handleConnectServer,
      t,
      deleteServer
    ]
  )

  // LogTree Component — inline directory tree in sidebar
  interface LogTreeProps {
    containerKey: string
    serverId: string
    container: Container
    currentPath: string
    entries: { name: string; isDirectory: boolean; size: string; date: string }[]
  }

  const LogTree = useCallback(
    ({ containerKey, serverId, container, currentPath, entries }: LogTreeProps) => {
      const childEntries = (name: string): { name: string; isDirectory: boolean; size: string; date: string }[] | undefined => {
        const childPath = currentPath.endsWith('/') ? currentPath + name : currentPath + '/' + name
        return directoryContents[`${containerKey}:${childPath}`]
      }

      const handleClick = (entry: { name: string; isDirectory: boolean }, e: React.MouseEvent): void => {
        e.stopPropagation()
        const fullPath = currentPath.endsWith('/') ? currentPath + entry.name : currentPath + '/' + entry.name

        if (entry.isDirectory) {
          const mapKey = `${containerKey}:${fullPath}`
          if (directoryContents[mapKey]) {
            setDirectoryContents((prev) => { const n = { ...prev }; delete n[mapKey]; return n })
            return
          }
          const termSession = sessions.find((s) => s.serverId === serverId && s.status === 'connected' && !s.sessionType)
          if (!termSession) { showError(t('logBrowser.notConnected')); return }

          // Use shell channel (works through bastion) instead of exec
          const markerBegin = `__B_${Math.random().toString(36).slice(2)}__`
          const markerEnd = `__E_${Math.random().toString(36).slice(2)}__`
          const dockerPrefix = container.image ? `docker exec -- ${shellQuote(container.image)} ` : ''
          const shellCmd = `echo ${markerBegin} && ${dockerPrefix}ls -la --color=never -- ${shellQuote(fullPath)} 2>&1; echo ${markerEnd}\n`

          let shellOutput = ''
          let overflow = false
          const dataHandler = (_sid: string, data: string) => {
            if (_sid === termSession.id && !overflow) {
              if (shellOutput.length + data.length > 1024 * 1024) overflow = true
              else shellOutput += data
            }
          }
          const unsub = window.api.ssh.onData(dataHandler)
          window.api.ssh.send(termSession.id, shellCmd)

          ;(async () => {
            for (let i = 0; i < 80; i++) {
              await new Promise(r => setTimeout(r, 100))
              if (overflow || shellOutput.includes(markerEnd)) break
            }
            unsub()
            if (overflow) { showError('目录输出过大，请使用 SFTP 文件面板浏览'); return }
            const bi = shellOutput.indexOf(markerBegin)
            const ei = shellOutput.indexOf(markerEnd)
            let result = ''
            if (bi >= 0 && ei > bi) {
              result = shellOutput.substring(bi + markerBegin.length, ei).replace(/\r/g, '').trim()
            }
            if (result.trim()) {
              setDirectoryContents((prev) => ({ ...prev, [mapKey]: parseLsOutput(result) }))
            }
          })()
        } else {
          // Files: timer-based single/double-click distinction
          const entryKey = `${containerKey}:${fullPath}`
          const timers = clickTimersRef.current
          const existing = timers.get(entryKey)
          if (existing) {
            clearTimeout(existing)
            timers.delete(entryKey)
            // Double-click on file: open log viewer
            openLogViewer(serverId, serverId, fullPath, container.name, currentPath)
          } else {
            const timer = setTimeout(() => {
              timers.delete(entryKey)
            }, 300)
            timers.set(entryKey, timer)
          }
        }
      }

      return (
        <>
          {entries.map((entry) => {
            const children = entry.isDirectory ? childEntries(entry.name) : undefined
            return (
              <div key={entry.name}>
                <div
                  className="group flex items-center gap-2 pr-2 py-1 cursor-pointer hover:bg-accent rounded-md text-sm"
                  style={{ paddingLeft: '24px' }}
                  onClick={(e) => handleClick(entry, e)}
                >
                  {entry.isDirectory ? (
                    children
                      ? <ChevronDown className="w-3 h-3 flex-shrink-0" />
                      : <ChevronRight className="w-3 h-3 flex-shrink-0" />
                  ) : (
                    <span className="w-3 h-3 flex-shrink-0" />
                  )}
                  {entry.isDirectory
                    ? <Folder className="w-4 h-4 ml-1 text-yellow-500 flex-shrink-0" />
                    : <FileText className="w-4 h-4 ml-1 text-blue-500 flex-shrink-0" />
                  }
                  <span className="truncate flex-1">{entry.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100">{entry.date}</span>
                </div>
                {children && children.length > 0 && (
                  <LogTree
                    containerKey={containerKey}
                    serverId={serverId}
                    container={container}
                    currentPath={currentPath.endsWith('/') ? currentPath + entry.name : currentPath + '/' + entry.name}
                    entries={children}
                  />
                )}
              </div>
            )
          })}
        </>
      )
    },
    [directoryContents, sessions, openLogViewer, showError, t]
  )

  // ContainerNode Component
  interface ContainerNodeProps {
    project: Project
    server: ServerType
    container: Container
  }

  const ContainerNode = useCallback(
    ({ project, server, container }: ContainerNodeProps) => {
      const containerKey = `${project.id}-${server.id}-container-${container.name}`
      const isSelected = selectedId === containerKey
      const logEntries = directoryContents[`${containerKey}:${container.logPath}`]

      const handleClick = () => {
        setSelected(containerKey)
        const timers = clickTimersRef.current
        const existing = timers.get(containerKey)
        if (existing) {
          clearTimeout(existing)
          timers.delete(containerKey)
          handleContainerClick(server.id, containerKey, container)
          return
        }
        const timer = setTimeout(() => {
          timers.delete(containerKey)
          handleContainerClick(server.id, containerKey, container)
        }, 300)
        timers.set(containerKey, timer)
      }

      return (
        <div key={containerKey}>
          <div
            className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent rounded-md ${
              isSelected ? 'bg-accent' : ''
            }`}
            onClick={handleClick}
          >
            <Box className="w-4 h-4 ml-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm truncate flex-1">{container.name}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-1 hover:bg-accent rounded opacity-0 group-hover:opacity-100">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setContainerDialog({ open: true, mode: 'edit', projectId: project.id, serverId: server.id, container })
                  }}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {t('sidebar.editContainer')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setConfirmDialog({
                      open: true,
                      title: t('sidebar.deleteContainer'),
                      description: t('sidebar.deleteContainerConfirm', { name: container.name }),
                      onConfirm: () => deleteContainer(project.id, server.id, container.id)
                    })
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('sidebar.deleteContainer')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {logEntries && logEntries.length > 0 && (
            <LogTree
              containerKey={containerKey}
              serverId={server.id}
              container={container}
              currentPath={container.logPath}
              entries={logEntries}
            />
          )}
        </div>
      )
    },
    [selectedId, setSelected, handleContainerClick, directoryContents, t, deleteContainer]
  )

  // ProjectNode Component
  interface ProjectNodeProps {
    project: Project
  }

  const ProjectNode = useCallback(
    ({ project }: ProjectNodeProps) => {
      const projectKey = `${project.id}-project`
      const isExpanded = expandedIds.has(projectKey)
      const isSelected = selectedId === projectKey

      return (
        <div key={projectKey} className="mb-4">
          <div
            className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent rounded-md ${
              isSelected ? 'bg-accent' : ''
            }`}
            onClick={() => {
              toggleExpanded(projectKey)
              setSelected(projectKey)
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(projectKey)
              }}
              className="p-0.5 hover:bg-accent rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            <FolderOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium flex-1 truncate">{project.name}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-1 hover:bg-accent rounded opacity-0 group-hover:opacity-100">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setProjectDialog({ open: true, mode: 'edit', project })
                  }}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {t('sidebar.editProject')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setGroupDialog({
                      open: true,
                      mode: 'create',
                      projectId: project.id
                    })
                  }}
                >
                  <Folders className="w-4 h-4 mr-2" />
                  {t('sidebar.addGroup')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setServerDialog({
                      open: true,
                      mode: 'create',
                      projectId: project.id,
                      groupPath: []
                    })
                  }}
                >
                  <Server className="w-4 h-4 mr-2" />
                  {t('sidebar.addServer')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setConfirmDialog({
                      open: true,
                      title: t('sidebar.deleteProject'),
                      description: t('sidebar.deleteProjectConfirm', { name: project.name }),
                      onConfirm: () => {
                        deleteProject(project.id)
                      }
                    })
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('sidebar.deleteProject')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isExpanded && (
            <div className="ml-4">
              {project.groups?.map((group) => (
                <GroupNode
                  key={group.id}
                  project={project}
                  group={group}
                  groupPath={[]}
                />
              ))}
              {project.servers?.map((server) => (
                <ServerNode
                  key={server.id}
                  project={project}
                  server={server}
                  groupPath={[]}
                />
              ))}
            </div>
          )}
        </div>
      )
    },
    [
      expandedIds,
      selectedId,
      toggleExpanded,
      setSelected,
      t,
      GroupNode,
      ServerNode,
      deleteProject
    ]
  )

  return (
    <div className="flex flex-col h-full bg-background border-r">
      <div className="p-4 border-b space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('sidebar.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchProjects()}
            title={t('logBrowser.refresh')}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProjectDialog({ open: true, mode: 'create' })}
            className="flex-1"
          >
            <Plus className="w-4 h-4 mr-1" />
            {t('sidebar.newProject')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                {t('sidebar.export')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleImport}>
                <Upload className="w-4 h-4 mr-2" />
                {t('sidebar.import')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {filteredProjects.map((project) => (
            <ProjectNode key={project.id} project={project} />
          ))}
        </div>
      </ScrollArea>

      <ProjectDialog
        open={projectDialog.open}
        project={projectDialog.project}
        onOpenChange={(open) => {
          if (!open) {
            fetchProjects()
            setProjectDialog({ open: false, mode: 'create' })
          }
        }}
      />

      <ServerDialog
        open={serverDialog.open}
        projectId={serverDialog.projectId || ''}
        groupPath={serverDialog.groupPath}
        server={serverDialog.server}
        onOpenChange={(open) => {
          if (!open) {
            fetchProjects()
            // Auto-expand group path so newly added server is visible
            if (serverDialog.groupPath && serverDialog.groupPath.length > 0) {
              const projectId = serverDialog.projectId
              for (const groupId of serverDialog.groupPath) {
                const groupKey = `${projectId}-group-${serverDialog.groupPath.slice(0, serverDialog.groupPath.indexOf(groupId) + 1).join('/')}`
                if (!expandedIds.has(groupKey)) {
                  toggleExpanded(groupKey)
                }
              }
            }
            setServerDialog({ open: false, mode: 'create' })
          }
        }}
      />

      <ContainerDialog
        open={containerDialog.open}
        projectId={containerDialog.projectId || ''}
        serverId={containerDialog.serverId || ''}
        container={containerDialog.container}
        onOpenChange={(open) => {
          if (!open) {
            fetchProjects()
            setContainerDialog({ open: false, mode: 'create' })
          }
        }}
      />

      <GroupDialog
        open={groupDialog.open}
        projectId={groupDialog.projectId || ''}
        parentGroupId={groupDialog.parentGroupId}
        group={groupDialog.group}
        onOpenChange={(open) => {
          if (!open) {
            fetchProjects()
            setGroupDialog({ open: false, mode: 'create' })
          }
        }}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={() => {
          confirmDialog.onConfirm()
        }}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog({ open: false, title: '', description: '', onConfirm: () => {} })
          }
        }}
      />
    </div>
  )
}
