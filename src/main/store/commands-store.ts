import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { QuickCommand } from '@shared/types/commands'
import { BUILTIN_COMMANDS } from '@shared/types/commands'

interface CommandsConfig {
  customCommands: QuickCommand[]
  builtinOverrides: Record<string, boolean>
  builtinFavorites: Record<string, boolean>
}

const store = new Store<CommandsConfig>({
  name: 'commands-config',
  defaults: {
    customCommands: [],
    builtinOverrides: {},
    builtinFavorites: {}
  }
})

export function getCommands(): QuickCommand[] {
  const customs = store.get('customCommands', [])
  const overrides = store.get('builtinOverrides', {})
  const builtinFavorites = store.get('builtinFavorites', {})

  const builtins: QuickCommand[] = BUILTIN_COMMANDS.map((cmd) => ({
    ...cmd,
    id: `builtin-${cmd.name.toLowerCase().replace(/\s+/g, '-')}`,
    isBuiltin: true,
    favorite: builtinFavorites[`builtin-${cmd.name.toLowerCase().replace(/\s+/g, '-')}`] === true
  })).filter((cmd) => overrides[cmd.id] !== false)

  return [...builtins, ...customs]
}

export function createCommand(data: Omit<QuickCommand, 'id' | 'isBuiltin'>): QuickCommand {
  const command: QuickCommand = {
    id: randomUUID(),
    name: data.name,
    template: data.template,
    description: data.description,
    isBuiltin: false,
    autoEnter: data.autoEnter,
    category: data.category ?? 'custom',
    favorite: data.favorite ?? false
  }
  const customs = store.get('customCommands', [])
  customs.push(command)
  store.set('customCommands', customs)
  return command
}

export function updateCommand(id: string, data: Partial<Pick<QuickCommand, 'name' | 'template' | 'description' | 'autoEnter' | 'category' | 'favorite'>>): QuickCommand | undefined {
  const customs = store.get('customCommands', [])
  const idx = customs.findIndex((c) => c.id === id)
  if (idx === -1) return undefined
  customs[idx] = { ...customs[idx], ...data }
  store.set('customCommands', customs)
  return customs[idx]
}

export function toggleFavorite(id: string): boolean {
  if (id.startsWith('builtin-')) {
    const favorites = store.get('builtinFavorites', {})
    favorites[id] = !favorites[id]
    store.set('builtinFavorites', favorites)
    return favorites[id]
  }
  const existing = store.get('customCommands', []).find((item) => item.id === id)
  const command = existing ? updateCommand(id, { favorite: !existing.favorite }) : undefined
  return command?.favorite ?? false
}

export function deleteCommand(id: string): boolean {
  if (id.startsWith('builtin-')) {
    const overrides = store.get('builtinOverrides', {})
    overrides[id] = false
    store.set('builtinOverrides', overrides)
    return true
  }
  const customs = store.get('customCommands', [])
  const filtered = customs.filter((c) => c.id !== id)
  if (filtered.length === customs.length) return false
  store.set('customCommands', filtered)
  return true
}
