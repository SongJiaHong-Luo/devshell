import Store from 'electron-store'
import { safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import type { Project, Server, Container, ServerConfig, Group } from '@shared/types/server'
import * as placeholderHistory from './placeholder-history-store'

const store = new Store<ServerConfig>({
  name: 'server-config',
  defaults: { projects: [] }
})

const ENCRYPTED_PREFIX = 'safe:v1:'

function protectSecret(secret?: string): string | undefined {
  if (!secret || secret.startsWith(ENCRYPTED_PREFIX)) return secret
  if (!safeStorage.isEncryptionAvailable()) return secret
  return ENCRYPTED_PREFIX + safeStorage.encryptString(secret).toString('base64')
}

function revealSecret(secret?: string): string | undefined {
  if (!secret?.startsWith(ENCRYPTED_PREFIX)) return secret
  try {
    return safeStorage.decryptString(Buffer.from(secret.slice(ENCRYPTED_PREFIX.length), 'base64'))
  } catch {
    return undefined
  }
}

function mapGroupSecrets(group: Group, transform: (secret?: string) => string | undefined): Group {
  return {
    ...group,
    bastion: group.bastion
      ? { ...group.bastion, password: transform(group.bastion.password) }
      : undefined,
    servers: group.servers.map((server) => ({ ...server, password: transform(server.password) })),
    groups: group.groups.map((child) => mapGroupSecrets(child, transform))
  }
}

function mapProjectSecrets(projects: Project[], transform: (secret?: string) => string | undefined): Project[] {
  return projects.map((project) => ({
    ...project,
    servers: project.servers.map((server) => ({ ...server, password: transform(server.password) })),
    groups: (project.groups || []).map((group) => mapGroupSecrets(group, transform))
  }))
}

function persistProjects(projects: Project[]): void {
  store.set('projects', mapProjectSecrets(projects, protectSecret))
}

function hasPlaintextSecret(projects: Project[]): boolean {
  const isPlaintext = (value?: string): boolean => Boolean(value && !value.startsWith(ENCRYPTED_PREFIX))
  const groupHasPlaintext = (group: Group): boolean =>
    isPlaintext(group.bastion?.password) ||
    group.servers.some((server) => isPlaintext(server.password)) ||
    group.groups.some(groupHasPlaintext)

  return projects.some((project) =>
    project.servers.some((server) => isPlaintext(server.password)) ||
    (project.groups || []).some(groupHasPlaintext)
  )
}

// Module-level flag to track if migration has been executed
let migrated = false

// Legacy server interface for migration
interface LegacyServer extends Server {
  jumpServerId?: string
  bastionCommand?: string
}

/**
 * Migrate legacy configuration with jumpServerId to new group structure
 */
function migrateLegacyConfig(projects: Project[]): Project[] {
  const migratedProjects = projects.map(project => {
    const legacyServers = project.servers as LegacyServer[]
    const hasLegacyServers = legacyServers.some(s => s.jumpServerId)

    if (!hasLegacyServers) return project

    // Group servers by jumpServerId
    const bastionGroups = new Map<string, LegacyServer[]>()
    const regularServers: Server[] = []

    legacyServers.forEach(server => {
      if (server.jumpServerId) {
        const groupServers = bastionGroups.get(server.jumpServerId) || []
        groupServers.push(server)
        bastionGroups.set(server.jumpServerId, groupServers)
      } else {
        regularServers.push(server)
      }
    })

    // Create groups for each bastion
    const newGroups: Group[] = [...(project.groups || [])]

    bastionGroups.forEach((groupServers, bastionServerId) => {
      const bastionServer = legacyServers.find(s => s.id === bastionServerId)
      if (!bastionServer) return

      const now = new Date().toISOString()
      const group: Group = {
        id: randomUUID(),
        name: `堡垒机-${bastionServer.name}`,
        description: 'Auto-migrated from legacy bastion configuration',
        bastion: {
          host: bastionServer.host,
          port: bastionServer.port,
          username: bastionServer.username,
          authType: bastionServer.authType,
          password: bastionServer.password,
          privateKeyPath: bastionServer.privateKeyPath
        },
        servers: groupServers.map(s => {
          const { jumpServerId, ...cleanServer } = s
          return cleanServer
        }),
        groups: [],
        createdAt: now,
        updatedAt: now
      }

      newGroups.push(group)
    })

    return {
      ...project,
      servers: regularServers,
      groups: newGroups
    }
  })

  return migratedProjects
}

export function getProjects(): Project[] {
  const storedProjects = store.get('projects', [])
  const projects = mapProjectSecrets(storedProjects, revealSecret)
  if (!migrated) {
    const migratedProjects = migrateLegacyConfig(projects)
    if (
      JSON.stringify(projects) !== JSON.stringify(migratedProjects) ||
      (safeStorage.isEncryptionAvailable() && hasPlaintextSecret(storedProjects))
    ) {
      persistProjects(migratedProjects)
    }
    migrated = true
    return migratedProjects
  }
  return projects
}

export function getProject(id: string): Project | undefined {
  return getProjects().find((p) => p.id === id)
}

/**
 * Recursively find a group by ID within a project
 */
export function findGroupById(projectId: string, groupId: string): { group: Group; parent: Group | Project } | undefined {
  const project = getProject(projectId)
  if (!project) return undefined

  function searchInGroups(groups: Group[], parent: Group | Project): { group: Group; parent: Group | Project } | undefined {
    for (const group of groups) {
      if (group.id === groupId) {
        return { group, parent }
      }
      const found = searchInGroups(group.groups, group)
      if (found) return found
    }
    return undefined
  }

  return searchInGroups(project.groups || [], project)
}

// Find group within an already-loaded projects array (avoids stale reference bugs)
function findGroupInProjects(projects: Project[], projectId: string, groupId: string): Group | undefined {
  const project = projects.find((p) => p.id === projectId)
  if (!project) return undefined
  function search(groups: Group[]): Group | undefined {
    for (const g of groups) {
      if (g.id === groupId) return g
      const found = search(g.groups || [])
      if (found) return found
    }
    return undefined
  }
  return search(project.groups || [])
}

/**
 * Recursively find server path (group names) for a given server
 */
export function findServerPath(projectId: string, serverId: string): string[] | undefined {
  const project = getProject(projectId)
  if (!project) return undefined

  // Check project-level servers
  if (project.servers.some(s => s.id === serverId)) {
    return []
  }

  function searchInGroups(groups: Group[], path: string[]): string[] | undefined {
    for (const group of groups) {
      if (group.servers.some(s => s.id === serverId)) {
        return [...path, group.name]
      }
      const found = searchInGroups(group.groups, [...path, group.name])
      if (found) return found
    }
    return undefined
  }

  return searchInGroups(project.groups || [], [])
}

/**
 * Validate group name uniqueness within the same level
 */
export function validateGroupName(projectId: string, parentGroupId: string | null, name: string, excludeId?: string): boolean {
  const project = getProject(projectId)
  if (!project) return false

  let groups: Group[]
  if (!parentGroupId) {
    groups = project.groups || []
  } else {
    const result = findGroupById(projectId, parentGroupId)
    if (!result) return false
    groups = result.group.groups
  }

  return !groups.some(g => g.id !== excludeId && g.name === name)
}

/**
 * Add a new group to a project or parent group
 */
export function addGroup(projectId: string, parentGroupId: string | null, group: Omit<Group, 'id' | 'servers' | 'groups' | 'createdAt' | 'updatedAt'>): Group | undefined {
  if (!validateGroupName(projectId, parentGroupId, group.name)) {
    return undefined
  }

  const projects = getProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return undefined

  const now = new Date().toISOString()
  const newGroup: Group = {
    id: randomUUID(),
    name: group.name,
    description: group.description,
    bastion: group.bastion,
    servers: [],
    groups: [],
    createdAt: now,
    updatedAt: now
  }

  if (!parentGroupId) {
    if (!project.groups) project.groups = []
    project.groups.push(newGroup)
  } else {
    const parent = findGroupInProjects(projects, projectId, parentGroupId)
    if (!parent) return undefined
    if (!parent.groups) parent.groups = []
    parent.groups.push(newGroup)
  }

  persistProjects(projects)
  return newGroup
}

/**
 * Update a group
 */
export function updateGroup(projectId: string, groupId: string, updates: Partial<Pick<Group, 'name' | 'description' | 'bastion'>>): Group | undefined {
  const projects = getProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) {
    return undefined
  }

  function searchInGroups(groups: Group[], parent: Group | Project): { group: Group; parent: Group | Project } | undefined {
    for (const group of groups) {
      if (group.id === groupId) {
        return { group, parent }
      }
      const found = searchInGroups(group.groups, group)
      if (found) return found
    }
    return undefined
  }

  const result = searchInGroups(project.groups || [], project)
  if (!result) {
    return undefined
  }

  if (updates.name) {
    const parentGroupId = 'id' in result.parent && result.parent.id !== projectId ? (result.parent as Group).id : null
    const isValid = validateGroupName(projectId, parentGroupId, updates.name, groupId)
    if (!isValid) {
      return undefined
    }
  }

  Object.assign(result.group, updates, { updatedAt: new Date().toISOString() })

  persistProjects(projects)

  return result.group
}

/**
 * Delete a group
 */
export function deleteGroup(projectId: string, groupId: string, cascade: boolean): boolean {
  const projects = getProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return false

  // Find group and its parent within the same projects reference
  function searchInGroups(groups: Group[], parent: Group | Project): { group: Group; parent: Group | Project } | undefined {
    for (const group of groups) {
      if (group.id === groupId) return { group, parent }
      const found = searchInGroups(group.groups || [], group)
      if (found) return found
    }
    return undefined
  }

  const result = searchInGroups(project.groups || [], project)
  if (!result) return false

  const { group, parent } = result

  if (cascade) {
    function deleteAllServers(g: Group): void {
      g.servers.forEach(s => placeholderHistory.clearServerHistory(s.id))
      g.groups.forEach(deleteAllServers)
    }
    deleteAllServers(group)
  } else {
    parent.servers.push(...group.servers)
    if (!parent.groups) parent.groups = []
    parent.groups.push(...group.groups)
  }

  parent.groups = parent.groups.filter(g => g.id !== groupId)
  persistProjects(projects)
  return true
}

/**
 * Move a server from one group to another
 */
export function moveServer(projectId: string, serverId: string, fromGroupId: string | null, toGroupId: string | null): boolean {
  const projects = getProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return false

  // Find group within the same projects reference
  const findGroup = (groups: Group[], id: string): Group | undefined => {
    for (const g of groups) {
      if (g.id === id) return g
      const found = findGroup(g.groups || [], id)
      if (found) return found
    }
    return undefined
  }

  let fromContainer: { servers: Server[] }
  let toContainer: { servers: Server[] }

  // Find source container
  if (!fromGroupId) {
    fromContainer = project
  } else {
    const group = findGroup(project.groups || [], fromGroupId)
    if (!group) return false
    fromContainer = group
  }

  // Find destination container
  if (!toGroupId) {
    toContainer = project
  } else {
    const group = findGroup(project.groups || [], toGroupId)
    if (!group) return false
    toContainer = group
  }

  // Find and move server
  const serverIndex = fromContainer.servers.findIndex(s => s.id === serverId)
  if (serverIndex === -1) return false

  const [server] = fromContainer.servers.splice(serverIndex, 1)
  toContainer.servers.push(server)

  persistProjects(projects)
  return true
}

export function createProject(data: Omit<Project, 'id' | 'servers' | 'groups' | 'createdAt' | 'updatedAt'>): Project {
  const now = new Date().toISOString()
  const project: Project = {
    id: randomUUID(),
    name: data.name,
    description: data.description,
    servers: [],
    groups: [],
    createdAt: now,
    updatedAt: now
  }
  const projects = getProjects()
  projects.push(project)
  persistProjects(projects)
  return project
}

export function updateProject(id: string, data: Partial<Pick<Project, 'name' | 'description'>>): Project | undefined {
  const projects = getProjects()
  const idx = projects.findIndex((p) => p.id === id)
  if (idx === -1) return undefined
  projects[idx] = { ...projects[idx], ...data, updatedAt: new Date().toISOString() }
  persistProjects(projects)
  return projects[idx]
}

export function deleteProject(id: string): boolean {
  const projects = getProjects()
  const filtered = projects.filter((p) => p.id !== id)
  if (filtered.length === projects.length) return false
  persistProjects(filtered)
  return true
}

export function createServer(projectId: string, data: Omit<Server, 'id' | 'containers' | 'createdAt' | 'updatedAt'>, groupId?: string | null): Server | undefined {
  const projects = getProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return undefined

  let container: { servers: Server[] }
  if (!groupId) {
    container = project
  } else {
    // Find group within the same projects reference to avoid stale copies
    const findInGroups = (groups: Group[]): Group | undefined => {
      for (const g of groups) {
        if (g.id === groupId) return g
        const found = findInGroups(g.groups || [])
        if (found) return found
      }
      return undefined
    }
    const group = findInGroups(project.groups || [])
    if (!group) return undefined
    container = group
  }

  const now = new Date().toISOString()
  const server: Server = {
    id: randomUUID(),
    name: data.name,
    host: data.host,
    port: data.port,
    username: data.username,
    authType: data.authType,
    password: data.password,
    privateKeyPath: data.privateKeyPath,
    bastionCommand: data.bastionCommand,
    containers: [],
    createdAt: now,
    updatedAt: now
  }
  container.servers.push(server)
  persistProjects(projects)
  return server
}

export function updateServer(projectId: string, serverId: string, data: Partial<Pick<Server, 'name' | 'host' | 'port' | 'username' | 'authType' | 'password' | 'privateKeyPath' | 'bastionCommand'>>, groupId?: string | null): Server | undefined {
  const projects = getProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return undefined

  let container: { servers: Server[] }
  if (groupId === undefined) {
    // Search in all containers within the same projects reference
    function findServerContainer(groups: Group[]): { servers: Server[] } | undefined {
      for (const g of groups) {
        if (g.servers.some(s => s.id === serverId)) return g
        const found = findServerContainer(g.groups || [])
        if (found) return found
      }
      return undefined
    }
    if (project.servers.some(s => s.id === serverId)) {
      container = project
    } else {
      const found = findServerContainer(project.groups || [])
      if (!found) return undefined
      container = found
    }
  } else if (!groupId) {
    container = project
  } else {
    const group = findGroupInProjects(projects, projectId, groupId)
    if (!group) return undefined
    container = group
  }

  const idx = container.servers.findIndex((s) => s.id === serverId)
  if (idx === -1) return undefined
  container.servers[idx] = { ...container.servers[idx], ...data, updatedAt: new Date().toISOString() }
  persistProjects(projects)
  return container.servers[idx]
}

export function deleteServer(projectId: string, serverId: string, groupId?: string | null): boolean {
  const projects = getProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return false

  let container: { servers: Server[] }
  if (groupId === undefined) {
    // Search in all containers
    const path = findServerPath(projectId, serverId)
    if (path === undefined) {
      // Try project level
      container = project
    } else if (path.length === 0) {
      container = project
    } else {
      // Find by searching all groups
      function findServerContainer(groups: Group[]): { servers: Server[] } | undefined {
        for (const g of groups) {
          if (g.servers.some(s => s.id === serverId)) return g
          const found = findServerContainer(g.groups)
          if (found) return found
        }
        return undefined
      }
      const found = findServerContainer(project.groups || [])
      if (!found) return false
      container = found
    }
  } else if (!groupId) {
    container = project
  } else {
    const result = findGroupById(projectId, groupId)
    if (!result) return false
    container = result.group
  }

  const before = container.servers.length
  container.servers = container.servers.filter((s) => s.id !== serverId)
  if (container.servers.length === before) return false
  persistProjects(projects)
  placeholderHistory.clearServerHistory(serverId)
  return true
}

export function createContainer(projectId: string, serverId: string, data: Omit<Container, 'id' | 'createdAt' | 'updatedAt'>): Container | undefined {
  const projects = getProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return undefined

  // Search for server in project and all groups
  function findServer(servers: Server[]): Server | undefined {
    return servers.find(s => s.id === serverId)
  }

  function searchInGroups(groups: Group[]): Server | undefined {
    for (const group of groups) {
      const server = findServer(group.servers)
      if (server) return server
      const found = searchInGroups(group.groups)
      if (found) return found
    }
    return undefined
  }

  const server = findServer(project.servers) || searchInGroups(project.groups || [])
  if (!server) return undefined

  const now = new Date().toISOString()
  const container: Container = {
    id: randomUUID(),
    name: data.name,
    image: data.image,
    logPath: data.logPath,
    logStreamMode: data.logStreamMode,
    logLineCount: data.logLineCount,
    createdAt: now,
    updatedAt: now
  }
  server.containers.push(container)
  persistProjects(projects)
  return container
}

export function updateContainer(projectId: string, serverId: string, containerId: string, data: Partial<Pick<Container, 'name' | 'image' | 'logPath' | 'logStreamMode' | 'logLineCount'>>): Container | undefined {
  const projects = getProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return undefined

  // Search for server in project and all groups
  function findServer(servers: Server[]): Server | undefined {
    return servers.find(s => s.id === serverId)
  }

  function searchInGroups(groups: Group[]): Server | undefined {
    for (const group of groups) {
      const server = findServer(group.servers)
      if (server) return server
      const found = searchInGroups(group.groups)
      if (found) return found
    }
    return undefined
  }

  const server = findServer(project.servers) || searchInGroups(project.groups || [])
  if (!server) return undefined

  const idx = server.containers.findIndex((c) => c.id === containerId)
  if (idx === -1) return undefined
  server.containers[idx] = { ...server.containers[idx], ...data, updatedAt: new Date().toISOString() }
  persistProjects(projects)
  return server.containers[idx]
}

export function deleteContainer(projectId: string, serverId: string, containerId: string): boolean {
  const projects = getProjects()
  const project = projects.find((p) => p.id === projectId)
  if (!project) return false

  // Search for server in project and all groups
  function findServer(servers: Server[]): Server | undefined {
    return servers.find(s => s.id === serverId)
  }

  function searchInGroups(groups: Group[]): Server | undefined {
    for (const group of groups) {
      const server = findServer(group.servers)
      if (server) return server
      const found = searchInGroups(group.groups)
      if (found) return found
    }
    return undefined
  }

  const server = findServer(project.servers) || searchInGroups(project.groups || [])
  if (!server) return false

  const before = server.containers.length
  server.containers = server.containers.filter((c) => c.id !== containerId)
  if (server.containers.length === before) return false
  persistProjects(projects)
  return true
}

export function exportConfig(): ServerConfig {
  const stripServerCredentials = (server: Server): Server => ({
    ...server,
    password: undefined
  })

  const stripGroupCredentials = (group: Group): Group => ({
    ...group,
    bastion: group.bastion ? { ...group.bastion, password: undefined } : undefined,
    servers: group.servers.map(stripServerCredentials),
    groups: group.groups.map(stripGroupCredentials)
  })

  return {
    projects: getProjects().map((project) => ({
      ...project,
      servers: project.servers.map(stripServerCredentials),
      groups: project.groups.map(stripGroupCredentials)
    }))
  }
}

export function importConfig(config: ServerConfig): void {
  persistProjects(config.projects)
}
