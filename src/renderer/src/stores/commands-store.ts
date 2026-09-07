import { create } from 'zustand'
import type { QuickCommand } from '@shared/types/commands'

interface CommandsState {
  commands: QuickCommand[]
  fetchCommands: () => Promise<void>
  createCommand: (data: Omit<QuickCommand, 'id' | 'isBuiltin'>) => Promise<void>
  updateCommand: (
    id: string,
    data: Partial<Pick<QuickCommand, 'name' | 'template' | 'description' | 'autoEnter' | 'category' | 'favorite'>>
  ) => Promise<void>
  deleteCommand: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
}

export const useCommandsStore = create<CommandsState>((set, get) => ({
  commands: [],

  fetchCommands: async () => {
    const commands = await window.api.commands.getAll()
    set({ commands })
  },

  createCommand: async (data) => {
    await window.api.commands.create(data)
    await get().fetchCommands()
  },

  updateCommand: async (id, data) => {
    await window.api.commands.update(id, data)
    await get().fetchCommands()
  },

  deleteCommand: async (id) => {
    await window.api.commands.delete(id)
    await get().fetchCommands()
  },

  toggleFavorite: async (id) => {
    await window.api.commands.toggleFavorite(id)
    await get().fetchCommands()
  }
}))
