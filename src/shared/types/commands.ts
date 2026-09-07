export interface QuickCommand {
  id: string
  name: string
  template: string
  description: string
  isBuiltin: boolean
  autoEnter?: boolean
  category?: CommandCategory
  favorite?: boolean
}

export type CommandCategory = 'logs' | 'docker' | 'system' | 'custom'

export const COMMAND_CATEGORY_LABELS: Record<CommandCategory, string> = {
  logs: '日志',
  docker: 'Docker',
  system: '系统',
  custom: '自定义'
}

export function getCommandCategory(command: Pick<QuickCommand, 'name' | 'isBuiltin' | 'category'>): CommandCategory {
  if (command.category) return command.category
  if (!command.isBuiltin) return 'custom'
  if (command.name.includes('Docker')) return 'docker'
  if (command.name.includes('Log')) return 'logs'
  return 'system'
}

export const BUILTIN_COMMAND_I18N: Record<string, { nameKey: string; descKey: string }> = {
  'Tail Log': { nameKey: 'builtinCommands.tailLog', descKey: 'builtinCommands.tailLogDesc' },
  'Grep Log': { nameKey: 'builtinCommands.grepLog', descKey: 'builtinCommands.grepLogDesc' },
  'Docker Logs': { nameKey: 'builtinCommands.dockerLogs', descKey: 'builtinCommands.dockerLogsDesc' },
  'Docker PS': { nameKey: 'builtinCommands.dockerPs', descKey: 'builtinCommands.dockerPsDesc' },
  'Disk Usage': { nameKey: 'builtinCommands.diskUsage', descKey: 'builtinCommands.diskUsageDesc' },
  'Memory Usage': { nameKey: 'builtinCommands.memoryUsage', descKey: 'builtinCommands.memoryUsageDesc' },
  'Process List': { nameKey: 'builtinCommands.processList', descKey: 'builtinCommands.processListDesc' },
  'System Uptime': { nameKey: 'builtinCommands.systemUptime', descKey: 'builtinCommands.systemUptimeDesc' }
  , 'Kubernetes Pods': { nameKey: 'builtinCommands.kubernetesPods', descKey: 'builtinCommands.kubernetesPodsDesc' }
}

export const BUILTIN_COMMANDS: Omit<QuickCommand, 'id'>[] = [
  {
    name: 'Tail Log',
    template: 'tail -f {log_path}',
    description: 'Follow a log file in real-time',
    category: 'logs',
    isBuiltin: true
  },
  {
    name: 'Grep Log',
    template: 'grep -rn "{keyword}" {directory} --include="{pattern}"',
    description: 'Search for a keyword in log files',
    category: 'logs',
    isBuiltin: true
  },
  {
    name: 'Docker Logs',
    template: 'docker logs -f --tail {lines} {container}',
    description: 'Follow Docker container logs',
    category: 'docker',
    isBuiltin: true
  },
  {
    name: 'Docker PS',
    template: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"',
    description: 'List running containers',
    category: 'docker',
    isBuiltin: true
  },
  {
    name: 'Disk Usage',
    template: 'df -h',
    description: 'Show disk usage',
    category: 'system',
    isBuiltin: true
  },
  {
    name: 'Memory Usage',
    template: 'free -m',
    description: 'Show memory usage',
    category: 'system',
    isBuiltin: true
  },
  {
    name: 'Process List',
    template: 'ps aux | head -20',
    description: 'List running processes',
    category: 'system',
    isBuiltin: true
  },
  {
    name: 'System Uptime',
    template: 'uptime',
    description: 'Show system uptime',
    category: 'system',
    isBuiltin: true
  },
  {
    name: 'Kubernetes Pods',
    template: 'kubectl get pods -A -o wide',
    description: 'List Kubernetes pods across all namespaces',
    category: 'system',
    isBuiltin: true
  }
]
