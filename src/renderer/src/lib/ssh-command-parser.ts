export interface ParsedSshCommand {
  host: string
  port?: number
  username?: string
  privateKeyPath?: string
}

/** Parse the common `ssh [-p port] [-i key] user@host` form without executing it. */
export function parseSshCommand(input: string): ParsedSshCommand | null {
  const tokens = input.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
  if (!tokens || tokens[0] !== 'ssh') return null

  let port: number | undefined
  let privateKeyPath: string | undefined
  let target = ''
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '-p' && tokens[index + 1]) {
      const value = Number(tokens[++index])
      if (Number.isInteger(value) && value > 0 && value <= 65535) port = value
    } else if (token === '-i' && tokens[index + 1]) {
      privateKeyPath = tokens[++index].replace(/^("|')|("|')$/g, '')
    } else if (!token.startsWith('-')) {
      target = token
    }
  }

  if (!target) return null
  const atIndex = target.lastIndexOf('@')
  const username = atIndex > 0 ? target.slice(0, atIndex) : undefined
  const host = atIndex > 0 ? target.slice(atIndex + 1) : target
  return host ? { host, port, username, privateKeyPath } : null
}
