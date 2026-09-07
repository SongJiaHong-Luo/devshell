import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useServerStore } from '@/stores/server-store'
import { parseSshCommand } from '@/lib/ssh-command-parser'
import { showError, showSuccess } from '@/stores/toast-store'
import { formatConnectionError } from '@/lib/user-error'
import type { Server, Group } from '@shared/types/server'

interface FlatGroup {
  id: string
  name: string
  depth: number
}

function flattenGroups(groups: Group[], depth: number): FlatGroup[] {
  const result: FlatGroup[] = []
  for (const g of groups) {
    result.push({ id: g.id, name: g.name, depth })
    if (g.groups && g.groups.length > 0) {
      result.push(...flattenGroups(g.groups, depth + 1))
    }
  }
  return result
}

interface ServerDialogProps {
  open: boolean
  projectId: string
  groupPath?: string[]
  server?: Server
  onOpenChange: (open: boolean) => void
}

export function ServerDialog({
  open,
  projectId,
  groupPath,
  server,
  onOpenChange
}: ServerDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [authType, setAuthType] = useState<'password' | 'key'>('password')
  const [password, setPassword] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const { createServer, updateServer, moveServer, projects } = useServerStore()
  const [jumpServerId, setJumpServerId] = useState('')
  const [bastionCommand, setBastionCommand] = useState('')
  const [targetGroupId, setTargetGroupId] = useState('')
  const [sshCommand, setSshCommand] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Build flat group list for the current project
  const groupOptions = useMemo(() => {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return []
    return flattenGroups(project.groups || [], 0)
  }, [projects, projectId])

  const allServers = useMemo(() => {
    const result: { id: string; name: string; host: string }[] = []
    for (const p of projects) {
      for (const s of p.servers) {
        if (s.id !== server?.id) {
          result.push({ id: s.id, name: s.name, host: s.host })
        }
      }
    }
    return result
  }, [projects, server?.id])

  useEffect(() => {
    if (open) {
      setName(server?.name ?? '')
      setHost(server?.host ?? '')
      setPort(String(server?.port ?? 22))
      setUsername(server?.username ?? 'root')
      setAuthType(server?.authType ?? 'password')
      setPassword(server?.password ?? '')
      setPrivateKeyPath(server?.privateKeyPath ?? '')
      setJumpServerId('')
      setBastionCommand(server?.bastionCommand ?? '')
      // Set current group from groupPath (last element = current group, '' = project root)
      setTargetGroupId(groupPath && groupPath.length > 0 ? groupPath[groupPath.length - 1] : '')
      setTestResult(null)
    }
  }, [open, server, groupPath])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !host.trim() || !username.trim()) return
    const data = {
      name: name.trim(),
      host: host.trim(),
      port: parseInt(port) || 22,
      username: username.trim(),
      authType,
      ...(authType === 'password' ? { password } : { privateKeyPath: privateKeyPath.trim() }),
      bastionCommand: bastionCommand.trim() || undefined
    }
    try {
      if (server) {
        await updateServer(projectId, server.id, data)
        const originalGroupId = groupPath && groupPath.length > 0 ? groupPath[groupPath.length - 1] : null
        const newGroupId = targetGroupId || null
        if (originalGroupId !== newGroupId) {
          await moveServer(projectId, server.id, originalGroupId, newGroupId)
        }
      } else {
        const createData = { ...data, jumpServerId: jumpServerId || undefined }
        const newGroupPath = targetGroupId ? [targetGroupId] : []
        await createServer(projectId, createData, newGroupPath)
      }
      onOpenChange(false)
    } catch (err) {
      console.error('[ServerDialog] submit error:', err)
    }
  }

  const handleParseSshCommand = (): void => {
    const parsed = parseSshCommand(sshCommand)
    if (!parsed) {
      showError('无法识别 SSH 命令，请使用例如 ssh user@host -p 22 的格式。')
      return
    }
    setHost(parsed.host)
    if (parsed.port) setPort(String(parsed.port))
    if (parsed.username) setUsername(parsed.username)
    if (parsed.privateKeyPath) {
      setAuthType('key')
      setPrivateKeyPath(parsed.privateKeyPath)
    }
    if (!name.trim()) setName(parsed.host)
    showSuccess('已从 SSH 命令填入连接信息。')
  }

  const handleTestConnection = async (): Promise<void> => {
    if (!host.trim() || !username.trim()) {
      showError('请先填写主机地址和用户名。')
      return
    }
    setTestingConnection(true)
    try {
      await window.api.ssh.testConnection({
        host: host.trim(),
        port: parseInt(port) || 22,
        username: username.trim(),
        authType,
        ...(authType === 'password' ? { password } : { privateKeyPath: privateKeyPath.trim() })
      })
      const message = '连接测试成功，可以保存服务器。'
      setTestResult({ type: 'success', message })
      showSuccess(message)
    } catch (error) {
      const message = formatConnectionError(error)
      setTestResult({ type: 'error', message })
      showError(message)
    } finally {
      setTestingConnection(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{server ? t('serverDialog.editTitle') : t('serverDialog.newTitle')}</DialogTitle>
            <DialogDescription>
              {server
                ? t('serverDialog.editDesc')
                : t('serverDialog.newDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2 rounded-md border border-dashed border-border p-3">
              <Label htmlFor="server-ssh-command">粘贴 SSH 命令（可选）</Label>
              <div className="flex gap-2">
                <Input
                  id="server-ssh-command"
                  placeholder="ssh root@192.168.1.100 -p 22"
                  value={sshCommand}
                  onChange={(event) => setSshCommand(event.target.value)}
                />
                <Button type="button" variant="outline" onClick={handleParseSshCommand}>自动填写</Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="server-name">{t('common.name')}</Label>
              <Input
                id="server-name"
                placeholder={t('serverDialog.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 grid gap-2">
                <Label htmlFor="server-host">{t('serverDialog.host')}</Label>
                <Input
                  id="server-host"
                  placeholder={t('serverDialog.hostPlaceholder')}
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="server-port">{t('serverDialog.port')}</Label>
                <Input
                  id="server-port"
                  type="number"
                  placeholder="22"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="server-username">{t('serverDialog.username')}</Label>
              <Input
                id="server-username"
                placeholder={t('serverDialog.usernamePlaceholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('serverDialog.authentication')}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={authType === 'password' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAuthType('password')}
                >
                  {t('serverDialog.password')}
                </Button>
                <Button
                  type="button"
                  variant={authType === 'key' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAuthType('key')}
                >
                  {t('serverDialog.privateKey')}
                </Button>
              </div>
            </div>
            {authType === 'password' ? (
              <div className="grid gap-2">
                <Label htmlFor="server-password">{t('serverDialog.password')}</Label>
                <Input
                  id="server-password"
                  type="password"
                  placeholder={t('serverDialog.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="server-key">{t('serverDialog.privateKeyPath')}</Label>
                <Input
                  id="server-key"
                  placeholder={t('serverDialog.privateKeyPlaceholder')}
                  value={privateKeyPath}
                  onChange={(e) => setPrivateKeyPath(e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="server-group">{t('serverDialog.mountGroup')}</Label>
              <select
                id="server-group"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={targetGroupId}
                onChange={(e) => setTargetGroupId(e.target.value)}
              >
                <option value="">{t('serverDialog.projectRoot')}</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {'  '.repeat(g.depth)}{g.depth > 0 ? '└ ' : ''}{g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="server-jump">{t('serverDialog.jumpHost')}</Label>
              <select
                id="server-jump"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={jumpServerId}
                onChange={(e) => setJumpServerId(e.target.value)}
              >
                <option value="">{t('serverDialog.jumpHostNone')}</option>
                {allServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.host})
                  </option>
                ))}
              </select>
              {allServers.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('serverDialog.jumpHostHint')}</p>
              )}
            </div>
            {jumpServerId && (
              <div className="grid gap-2">
                <Label htmlFor="server-bastion-cmd">{t('serverDialog.bastionCommand')}</Label>
                <Input
                  id="server-bastion-cmd"
                  placeholder={t('serverDialog.bastionCommandPlaceholder')}
                  value={bastionCommand}
                  onChange={(e) => setBastionCommand(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('serverDialog.bastionCommandHint')}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <div className="flex flex-1 flex-col items-start gap-1">
              <Button type="button" variant="outline" onClick={handleTestConnection} disabled={testingConnection}>
                {testingConnection ? '测试中…' : '测试连接'}
              </Button>
              {testResult && (
                <p className={`text-xs ${testResult.type === 'success' ? 'text-emerald-500' : 'text-destructive'}`}>
                  {testResult.message}
                </p>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || !host.trim() || !username.trim()}>
              {server ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
