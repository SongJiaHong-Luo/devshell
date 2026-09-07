import { create } from 'zustand'

export interface LogLevelSetting {
  level: string
  ansiColor: string
  enabled: boolean
}

interface SettingsState {
  logColors: LogLevelSetting[]
  fontSize: number
  loaded: boolean

  fetchSettings: () => Promise<void>
  updateLogColor: (level: string, ansiColor: string) => Promise<void>
  toggleLogLevel: (level: string) => Promise<void>
  updateFontSize: (size: number) => Promise<void>
}

const LEVEL_LABELS: Record<string, string> = {
  fatal: 'FATAL',
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
  trace: 'TRACE'
}

const COLOR_OPTIONS = [
  { ansi: '\x1b[31m', name: 'Red', nameKey: 'red', hex: '#f38ba8' },
  { ansi: '\x1b[32m', name: 'Green', nameKey: 'green', hex: '#a6e3a1' },
  { ansi: '\x1b[33m', name: 'Yellow', nameKey: 'yellow', hex: '#f9e2af' },
  { ansi: '\x1b[34m', name: 'Blue', nameKey: 'blue', hex: '#89b4fa' },
  { ansi: '\x1b[35m', name: 'Magenta', nameKey: 'magenta', hex: '#f5c2e7' },
  { ansi: '\x1b[36m', name: 'Cyan', nameKey: 'cyan', hex: '#94e2d5' },
  { ansi: '\x1b[90m', name: 'Gray', nameKey: 'gray', hex: '#6c7086' },
  { ansi: '\x1b[37m', name: 'White', nameKey: 'white', hex: '#bac2de' }
]

export { LEVEL_LABELS, COLOR_OPTIONS }

export const useSettingsStore = create<SettingsState>((set, get) => ({
  logColors: [
    { level: 'fatal', ansiColor: '\x1b[35m', enabled: true },
    { level: 'error', ansiColor: '\x1b[31m', enabled: true },
    { level: 'warn', ansiColor: '\x1b[33m', enabled: true },
    { level: 'info', ansiColor: '\x1b[32m', enabled: true },
    { level: 'debug', ansiColor: '\x1b[36m', enabled: true },
    { level: 'trace', ansiColor: '\x1b[90m', enabled: true }
  ],
  fontSize: 14,
  loaded: false,

  fetchSettings: async () => {
    const data = await window.api.settings.get()
    set({ logColors: data.logColors, fontSize: data.fontSize, loaded: true })
  },

  updateLogColor: async (level, ansiColor) => {
    const logColors = get().logColors.map((c) =>
      c.level === level ? { ...c, ansiColor } : c
    )
    set({ logColors })
    await window.api.settings.update({ logColors })
  },

  toggleLogLevel: async (level) => {
    const logColors = get().logColors.map((c) =>
      c.level === level ? { ...c, enabled: !c.enabled } : c
    )
    set({ logColors })
    await window.api.settings.update({ logColors })
  },

  updateFontSize: async (fontSize) => {
    set({ fontSize })
    await window.api.settings.update({ fontSize })
  }
}))
