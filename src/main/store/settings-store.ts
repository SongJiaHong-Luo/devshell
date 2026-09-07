import Store from 'electron-store'

export interface LogLevelSetting {
  level: string
  ansiColor: string
  enabled: boolean
}

export interface AppSettings {
  logColors: LogLevelSetting[]
  fontSize: number
  language: string
}

const DEFAULT_LOG_COLORS: LogLevelSetting[] = [
  { level: 'fatal', ansiColor: '\x1b[35m', enabled: true },
  { level: 'error', ansiColor: '\x1b[31m', enabled: true },
  { level: 'warn', ansiColor: '\x1b[33m', enabled: true },
  { level: 'info', ansiColor: '\x1b[32m', enabled: true },
  { level: 'debug', ansiColor: '\x1b[36m', enabled: true },
  { level: 'trace', ansiColor: '\x1b[90m', enabled: true }
]

const store = new Store<AppSettings>({
  name: 'app-settings',
  defaults: {
    logColors: DEFAULT_LOG_COLORS,
    fontSize: 14,
    language: ''
  }
})

export function getSettings(): AppSettings {
  return {
    logColors: store.get('logColors', DEFAULT_LOG_COLORS),
    fontSize: store.get('fontSize', 14),
    language: store.get('language', '')
  }
}

export function updateSettings(settings: Partial<AppSettings>): void {
  if (settings.logColors) store.set('logColors', settings.logColors)
  if (settings.fontSize !== undefined) store.set('fontSize', settings.fontSize)
  if (settings.language !== undefined) store.set('language', settings.language)
}
