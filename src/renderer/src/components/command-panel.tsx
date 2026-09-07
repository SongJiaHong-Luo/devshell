import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCommandsStore } from '@/stores/commands-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, Zap, Pencil, Trash2, Plus, Star } from 'lucide-react'
import { CommandEditDialog } from './command-edit-dialog'
import { CommandRunDialog } from './command-run-dialog'
import type { QuickCommand } from '@shared/types/commands'
import { BUILTIN_COMMAND_I18N, COMMAND_CATEGORY_LABELS, getCommandCategory, type CommandCategory } from '@shared/types/commands'

interface CommandPanelProps {
  onRun: (command: string) => void
  onClose: () => void
}

export function CommandPanel({ onRun }: CommandPanelProps): JSX.Element {
  const { t } = useTranslation()
  const { commands, fetchCommands, deleteCommand, toggleFavorite } = useCommandsStore()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'favorites' | CommandCategory>('all')
  const [editCmd, setEditCmd] = useState<{ open: boolean; command?: QuickCommand }>({ open: false })
  const [runCmd, setRunCmd] = useState<{ open: boolean; command?: QuickCommand }>({ open: false })

  useEffect(() => {
    fetchCommands()
  }, [])

  const filtered = useMemo(() => {
    const scoped = filter === 'all'
      ? commands
      : filter === 'favorites'
        ? commands.filter((command) => command.favorite)
        : commands.filter((command) => getCommandCategory(command) === filter)
    if (!search.trim()) return scoped
    const q = search.toLowerCase()
    return scoped.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    )
  }, [commands, search, filter])

  const handleRun = (cmd: QuickCommand): void => {
    const placeholders = cmd.template.match(/\{(\w+)\}/g)
    if (placeholders) {
      setRunCmd({ open: true, command: cmd })
    } else {
      // 对于没有占位符的命令，也要考虑 autoEnter 选项
      let command = cmd.template
      if (cmd.autoEnter) {
        command += '\n'
      }
      onRun(command)
    }
  }

  return (
    <div className="w-72 border-l border-border bg-card flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('commands.title')}</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setEditCmd({ open: true })}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={t('common.filter')}
            className="pl-7 h-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
          {([
            ['all', '全部'],
            ['favorites', '收藏'],
            ['logs', COMMAND_CATEGORY_LABELS.logs],
            ['docker', COMMAND_CATEGORY_LABELS.docker],
            ['system', COMMAND_CATEGORY_LABELS.system],
            ['custom', COMMAND_CATEGORY_LABELS.custom]
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={filter === value ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 shrink-0 px-2 text-[10px]"
              onClick={() => setFilter(value)}
            >
              {value === 'favorites' && <Star className="mr-1 h-2.5 w-2.5" />}
              {label}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1">
          {filtered.map((cmd) => (
            <div
              key={cmd.id}
              className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer"
              onClick={() => handleRun(cmd)}
            >
              <Zap className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">
                  {cmd.isBuiltin && BUILTIN_COMMAND_I18N[cmd.name]
                    ? t(BUILTIN_COMMAND_I18N[cmd.name].nameKey)
                    : cmd.name}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {cmd.isBuiltin && BUILTIN_COMMAND_I18N[cmd.name]
                    ? t(BUILTIN_COMMAND_I18N[cmd.name].descKey)
                    : cmd.description}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onClick={(event) => {
                  event.stopPropagation()
                  void toggleFavorite(cmd.id)
                }}
                title={cmd.favorite ? '取消收藏' : '收藏命令'}
              >
                <Star className={`h-3 w-3 ${cmd.favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </Button>
              {!cmd.isBuiltin && (
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditCmd({ open: true, command: cmd })
                    }}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteCommand(cmd.id)
                    }}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-4 text-xs text-muted-foreground">{t('commands.noCommands')}</div>
          )}
        </div>
      </ScrollArea>

      <CommandEditDialog
        open={editCmd.open}
        command={editCmd.command}
        onOpenChange={(open) => setEditCmd({ open })}
      />
      <CommandRunDialog
        open={runCmd.open}
        command={runCmd.command}
        onRun={(cmd) => {
          onRun(cmd)
          setRunCmd({ open: false })
        }}
        onOpenChange={(open) => setRunCmd({ open })}
      />
    </div>
  )
}
