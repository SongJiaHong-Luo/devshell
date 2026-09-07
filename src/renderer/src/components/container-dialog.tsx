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
import { useServerStore } from '@/stores/server-store'
import type { Container } from '@shared/types/server'

interface ContainerDialogProps {
  open: boolean
  projectId: string
  serverId: string
  container?: Container
  onOpenChange: (open: boolean) => void
}

export function ContainerDialog({
  open,
  projectId,
  serverId,
  container,
  onOpenChange
}: ContainerDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [logPath, setLogPath] = useState('')
  const [logStreamMode, setLogStreamMode] = useState<'stream' | 'fixed'>('stream')
  const [logLineCount, setLogLineCount] = useState(500)
  const { createContainer, updateContainer } = useServerStore()

  useEffect(() => {
    if (open) {
      setName(container?.name ?? '')
      setImage(container?.image ?? '')
      setLogPath(container?.logPath ?? '/var/log/')
      setLogStreamMode(container?.logStreamMode ?? 'stream')
      setLogLineCount(container?.logLineCount ?? 500)
    }
  }, [open, container])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const data = {
      name: name.trim(),
      image: image.trim(),
      logPath: logPath.trim(),
      logStreamMode,
      logLineCount
    }
    if (container) {
      await updateContainer(projectId, serverId, container.id, data)
    } else {
      await createContainer(projectId, serverId, data)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{container ? t('containerDialog.editTitle') : t('containerDialog.newTitle')}</DialogTitle>
            <DialogDescription>
              {container
                ? t('containerDialog.editDesc')
                : t('containerDialog.newDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="container-name">{t('common.name')}</Label>
              <Input
                id="container-name"
                placeholder={t('containerDialog.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="container-image">{t('containerDialog.image')}</Label>
              <Input
                id="container-image"
                placeholder={t('containerDialog.imagePlaceholder')}
                value={image}
                onChange={(e) => setImage(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="container-logpath">{t('containerDialog.logPath')}</Label>
              <Input
                id="container-logpath"
                placeholder={t('containerDialog.logPathPlaceholder')}
                value={logPath}
                onChange={(e) => setLogPath(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('containerDialog.logStreamMode')}</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="logStreamMode"
                    checked={logStreamMode === 'stream'}
                    onChange={() => setLogStreamMode('stream')}
                  />
                  <span className="text-sm">{t('containerDialog.streamMode')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="logStreamMode"
                    checked={logStreamMode === 'fixed'}
                    onChange={() => setLogStreamMode('fixed')}
                  />
                  <span className="text-sm">{t('containerDialog.fixedMode')}</span>
                </label>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="container-linecount">{t('containerDialog.logLineCount')}</Label>
              <Input
                id="container-linecount"
                type="number"
                min={1}
                max={10000}
                value={logLineCount}
                onChange={(e) => setLogLineCount(Number(e.target.value) || 500)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {container ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
