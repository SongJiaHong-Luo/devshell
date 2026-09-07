import Store from 'electron-store'

interface KnownHostRecord {
  fingerprint: string
  trustedAt: string
}

interface KnownHostsConfig {
  hosts: Record<string, KnownHostRecord>
}

const store = new Store<KnownHostsConfig>({
  name: 'known-hosts',
  defaults: { hosts: {} }
})

function hostKey(host: string, port: number): string {
  return `${host.trim().toLowerCase()}:${port}`
}

export function getKnownHost(host: string, port: number): KnownHostRecord | undefined {
  return store.get('hosts', {})[hostKey(host, port)]
}

export function trustHost(host: string, port: number, fingerprint: string): void {
  const hosts = store.get('hosts', {})
  hosts[hostKey(host, port)] = {
    fingerprint,
    trustedAt: new Date().toISOString()
  }
  store.set('hosts', hosts)
}
