import { create } from 'zustand'
import type { Project, Server, Container } from '@shared/types/server'

interface ServerStoreState {
  projects: Project[]
  selectedId: string | null
  selectedType: 'project' | 'server' | 'container' | null
  searchQuery: string
  expandedIds: Set<string>

  fetchProjects: () => Promise<void>
  setSelected: (id: string | null, type?: 'project' | 'server' | 'container' | null) => void
  setSearchQuery: (query: string) => void
  toggleExpanded: (id: string) => void

  createProject: (data: { name: string; description: string }) => Promise<Project>
  updateProject: (id: string, data: { name?: string; description?: string }) => Promise<void>
  deleteProject: (id: string) => Promise<void>

  createServer: (
    projectId: string,
    data: Omit<Server, 'id' | 'containers' | 'createdAt' | 'updatedAt'>,
    groupPath?: string[]
  ) => Promise<void>
  updateServer: (
    projectId: string,
    serverId: string,
    data: Partial<Pick<Server, 'name' | 'host' | 'port' | 'username' | 'authType' | 'password' | 'privateKeyPath' | 'bastionCommand'>>
  ) => Promise<void>
  deleteServer: (projectId: string, serverId: string) => Promise<void>
  moveServer: (projectId: string, serverId: string, fromGroupId: string | null, toGroupId: string | null) => Promise<boolean>
  renameServer: (serverId: string, newName: string) => Promise<{ success: boolean; error?: string }>

  createContainer: (
    projectId: string,
    serverId: string,
    data: Omit<Container, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>
  updateContainer: (
    projectId: string,
    serverId: string,
    containerId: string,
    data: Partial<Pick<Container, 'name' | 'image' | 'logPath' | 'logStreamMode' | 'logLineCount'>>
  ) => Promise<void>
  deleteContainer: (projectId: string, serverId: string, containerId: string) => Promise<void>

  deleteGroup: (projectId: string, groupId: string, _parentGroupId?: string | null) => Promise<boolean>
  dissolveGroup: (projectId: string, groupId: string, _parentGroupId?: string | null) => Promise<boolean>

  importConfig: () => Promise<boolean>
  exportConfig: () => Promise<boolean>
}

export const useServerStore = create<ServerStoreState>((set, get) => ({
  projects: [],
  selectedId: null,
  selectedType: null,
  searchQuery: '',
  expandedIds: new Set<string>(),

  fetchProjects: async () => {
    const projects = await window.api.store.getProjects()
    set({ projects })
  },

  setSelected: (id, type = null) => set({ selectedId: id, selectedType: type }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleExpanded: (id) => {
    const expanded = new Set(get().expandedIds)
    if (expanded.has(id)) {
      expanded.delete(id)
    } else {
      expanded.add(id)
    }
    set({ expandedIds: expanded })
  },

  createProject: async (data) => {
    const project = await window.api.store.createProject(data)
    await get().fetchProjects()
    return project
  },

  updateProject: async (id, data) => {
    await window.api.store.updateProject(id, data)
    await get().fetchProjects()
  },

  deleteProject: async (id) => {
    await window.api.store.deleteProject(id)
    if (get().selectedId === id) set({ selectedId: null, selectedType: null })
    await get().fetchProjects()
  },

  createServer: async (projectId, data, groupPath?: string[]) => {
    const groupId = groupPath && groupPath.length > 0 ? groupPath[groupPath.length - 1] : undefined
    await window.api.store.createServer(projectId, data, groupId)
    await get().fetchProjects()
  },

  updateServer: async (projectId, serverId, data) => {
    await window.api.store.updateServer(projectId, serverId, data)
    await get().fetchProjects()
  },

  deleteServer: async (projectId, serverId) => {
    await window.api.store.deleteServer(projectId, serverId)
    if (get().selectedId === serverId) set({ selectedId: null, selectedType: null })
    await get().fetchProjects()
  },

  moveServer: async (projectId, serverId, fromGroupId, toGroupId) => {
    const result = await window.api.store.moveServer(projectId, serverId, fromGroupId, toGroupId)
    await get().fetchProjects()
    return result
  },

  renameServer: async (serverId, newName) => {
    const projects = get().projects
    // Check duplicate name across all projects
    for (const p of projects) {
      for (const s of p.servers) {
        if (s.id !== serverId && s.name === newName) {
          return { success: false, error: 'duplicate' }
        }
      }
    }
    // Find the project that owns this server
    for (const p of projects) {
      const server = p.servers.find((s) => s.id === serverId)
      if (server) {
        await window.api.store.updateServer(p.id, serverId, { name: newName })
        await get().fetchProjects()
        return { success: true }
      }
    }
    return { success: false, error: 'not_found' }
  },

  createContainer: async (projectId, serverId, data) => {
    await window.api.store.createContainer(projectId, serverId, data)
    await get().fetchProjects()
  },

  updateContainer: async (projectId, serverId, containerId, data) => {
    await window.api.store.updateContainer(projectId, serverId, containerId, data)
    await get().fetchProjects()
  },

  deleteContainer: async (projectId, serverId, containerId) => {
    await window.api.store.deleteContainer(projectId, serverId, containerId)
    if (get().selectedId === containerId) set({ selectedId: null, selectedType: null })
    await get().fetchProjects()
  },

  deleteGroup: async (projectId, groupId) => {
    const result = await window.api.server.deleteGroup(projectId, groupId, true)
    if (result) await get().fetchProjects()
    return result
  },

  dissolveGroup: async (projectId, groupId) => {
    const result = await window.api.server.deleteGroup(projectId, groupId, false)
    if (result) await get().fetchProjects()
    return result
  },

  importConfig: async () => {
    const result = await window.api.store.importConfig()
    if (result) await get().fetchProjects()
    return result
  },

  exportConfig: async () => {
    return await window.api.store.exportConfigToFile()
  }
}))
