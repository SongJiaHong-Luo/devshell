import { useEffect, useState } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { useCommandsStore } from '@/stores/commands-store'
import type { QuickCommand } from '@shared/types/commands'
import { COMMAND_CATEGORY_LABELS, type CommandCategory } from '@shared/types/commands'

interface CommandEditDialogProps {
  open: boolean
  command?: QuickCommand
  onOpenChange: (open: boolean) => void
}

export function CommandEditDialog({ open, command, onOpenChange }: CommandEditDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('')
  const [description, setDescription] = useState('')
  const [autoEnter, setAutoEnter] = useState(false)
  const [category, setCategory] = useState<CommandCategory>('custom')
  const { createCommand, updateCommand } = useCommandsStore()

  useEffect(() => {
    if (open) {
      setName(command?.name ?? '')
      setTemplate(command?.template ?? '')
      setDescription(command?.description ?? '')
      setAutoEnter(command?.autoEnter ?? false)
      setCategory(command?.category ?? 'custom')
    }
  }, [open, command])

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!name.trim() || !template.trim()) return
    if (command) {
      await updateCommand(command.id, { name: name.trim(), template: template.trim(), description: description.trim(), autoEnter, category })
    } else {
      await createCommand({ name: name.trim(), template: template.trim(), description: description.trim(), autoEnter, category })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{command ? t('commands.editCommand') : t('commands.newCommand')}</DialogTitle>
            <DialogDescription>
              {t('commands.editDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cmd-name">{t('common.name')}</Label>
              <Input
                id="cmd-name"
                placeholder={t('commands.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cmd-category">分类</Label>
              <select
                id="cmd-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as CommandCategory)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {(Object.entries(COMMAND_CATEGORY_LABELS) as [CommandCategory, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cmd-template">{t('commands.template')}</Label>
              <Input
                id="cmd-template"
                placeholder={t('commands.templatePlaceholder')}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cmd-desc">{t('common.description')}</Label>
              <Input
                id="cmd-desc"
                placeholder={t('commands.optionalDesc')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="cmd-auto-enter"
                checked={autoEnter}
                onCheckedChange={setAutoEnter}
              />
              <Label htmlFor="cmd-auto-enter" className="cursor-pointer">
                {t('commands.autoEnter')}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || !template.trim()}>
              {command ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
