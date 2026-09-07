export interface Container {
  id: string
  name: string
  image: string
  logPath: string
  logStreamMode?: 'stream' | 'fixed'  // stream = tail -f, fixed = tail -n
  logLineCount?: number                // default 500
  createdAt: string
  updatedAt: string
}

export interface BastionConfig {
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  privateKeyPath?: string
}

export interface Group {
  id: string
  name: string
  description?: string
  bastion?: BastionConfig
  servers: Server[]
  groups: Group[]
  createdAt: string
  updatedAt: string
}

export interface Server {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  privateKeyPath?: string
  bastionCommand?: string
  containers: Container[]
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  description: string
  servers: Server[]
  groups: Group[]
  createdAt: string
  updatedAt: string
}

export interface ServerConfig {
  projects: Project[]
}

export type NodeType = 'project' | 'group' | 'server' | 'container'

export interface TreeNode {
  id: string
  name: string
  type: NodeType
  parentId?: string
  children?: TreeNode[]
  data: Project | Group | Server | Container
}
