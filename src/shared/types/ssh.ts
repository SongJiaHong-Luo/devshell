export interface SshConnectOptions {
  sessionId: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  privateKeyPath?: string
  bastion?: {
    host: string
    port: number
    username: string
    authType: 'password' | 'key'
    password?: string
    privateKeyPath?: string
  }
  bastionCommand?: string
}

export interface SshSessionInfo {
  sessionId: string
  host: string
  port: number
  username: string
}

export type SshConnectionTestOptions = Omit<SshConnectOptions, 'sessionId' | 'bastion' | 'bastionCommand'>
