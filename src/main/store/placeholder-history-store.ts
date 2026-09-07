import Store from 'electron-store'

interface HistoryEntry {
  value: string
  timestamp: number
}

interface PlaceholderHistoryData {
  [serverId: string]: {
    [placeholderName: string]: HistoryEntry[]
  }
}

const store = new Store<PlaceholderHistoryData>({
  name: 'placeholder-history',
  defaults: {}
})

const MAX_HISTORY_ITEMS = 10

export function getHistory(serverId: string, placeholderName: string): string[] {
  const serverData = store.get(serverId, {})
  const entries = serverData[placeholderName] || []
  return entries.map((e) => e.value)
}

export function addHistory(serverId: string, placeholderName: string, value: string): void {
  if (!value.trim()) return

  const allData = store.store
  const serverData = allData[serverId] || {}
  let entries = serverData[placeholderName] || []

  entries = entries.filter((e) => e.value !== value)

  entries.unshift({ value, timestamp: Date.now() })

  if (entries.length > MAX_HISTORY_ITEMS) {
    entries = entries.slice(0, MAX_HISTORY_ITEMS)
  }

  serverData[placeholderName] = entries
  allData[serverId] = serverData
  store.store = allData
}

export function clearServerHistory(serverId: string): void {
  const allData = store.store
  delete allData[serverId]
  store.store = allData
}
