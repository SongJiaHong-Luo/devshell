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
import { Badge } from '@/components/ui/badge'
import type { QuickCommand } from '@shared/types/commands'
import { useSessionStore } from '@/stores/session-store'

const PARAMETER_HINTS: Record<string, { label: string; placeholder: string; defaultValue?: string }> = {
  log_path: { label: '日志文件路径', placeholder: '/var/log/app.log' },
  directory: { label: '搜索目录', placeholder: '/var/log', defaultValue: '/var/log' },
  keyword: { label: '搜索关键词', placeholder: 'ERROR 或 Exception' },
  pattern: { label: '文件匹配规则', placeholder: '*.log', defaultValue: '*.log' },
  lines: { label: '日志行数', placeholder: '100', defaultValue: '100' },
  container: { label: '容器名称', placeholder: 'my-service' }
}

interface CommandRunDialogProps {
  open: boolean
  command?: QuickCommand
  onRun: (command: string) => void
  onOpenChange: (open: boolean) => void
}

export function CommandRunDialog({ open, command, onRun, onOpenChange }: CommandRunDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [params, setParams] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<Record<string, string[]>>({})
  const activeSessionId = useSessionStore((state) => state.activeSessionId)
  const sessions = useSessionStore((state) => state.sessions)

  const currentServerId = useMemo(() => {
    if (!activeSessionId) return null
    const session = sessions.find((s) => s.id === activeSessionId)
    return session?.serverId || null
  }, [activeSessionId, sessions])
  const placeholders = useMemo(() => {
    if (!command) return []
    const matches = command.template.match(/\{(\w+)\}/g)
    if (!matches) return []
    return [...new Set(matches)].map((m) => m.slice(1, -1))
  }, [command])

  useEffect(() => {
    if (open && command) {
      const initial: Record<string, string> = {}
      for (const p of placeholders) {
        initial[p] = PARAMETER_HINTS[p]?.defaultValue ?? ''
      }
      setParams(initial)

      if (currentServerId) {
        const loadHistory = async (): Promise<void> => {
          const historyData: Record<string, string[]> = {}
          for (const p of placeholders) {
            const h = await window.api.placeholderHistory.get(currentServerId, p)
            historyData[p] = h
          }
          setHistory(historyData)
        }
        loadHistory()
      } else {
        setHistory({})
      }
    }
  }, [open, command, placeholders, currentServerId])

  const preview = useMemo(() => {
    if (!command) return ''
    let result = command.template
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || `{${key}}`)
    }
    return result
  }, [command, params])

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    let result = command!.template
    for (const [key, value] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
    }

    // Add auto enter if enabled
    if (command!.autoEnter) {
      result += '\n'
    }

    // Execute command first (core functionality)
    onRun(result)

    // Save to history (optional, non-blocking)
    if (currentServerId) {
      for (const [key, value] of Object.entries(params)) {
        if (value.trim()) {
          window.api.placeholderHistory.add(currentServerId, key, value).catch((err) => {
            console.error('Failed to save placeholder history:', err)
          })
        }
      }
    }
  }

  if (!command) return <></>

  const hasMissingParameters = placeholders.some((placeholder) => !params[placeholder]?.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{command.name}</DialogTitle>
            <DialogDescription>{command.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {placeholders.map((p) => (
              <div key={p} className="grid gap-2">
                <Label htmlFor={`param-${p}`}>{PARAMETER_HINTS[p]?.label ?? p}</Label>
                <Input
                  id={`param-${p}`}
                  placeholder={PARAMETER_HINTS[p]?.placeholder ?? p}
                  value={params[p] || ''}
                  onChange={(e) => setParams((prev) => ({ ...prev, [p]: e.target.value }))}
                  autoFocus={p === placeholders[0]}
                />
                {history[p] && history[p].length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {history[p].map((val, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80"
                        onClick={() => setParams((prev) => ({ ...prev, [p]: val }))}
                      >
                        {val}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="bg-muted rounded-md p-2">
              <Label className="text-xs text-muted-foreground mb-1 block">{t('common.preview')}</Label>
              <code className="text-xs break-all">{preview}</code>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={hasMissingParameters}>{t('commands.run')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
