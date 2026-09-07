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
import type { Project } from '@shared/types/server'

interface ProjectDialogProps {
  open: boolean
  project?: Project
  onOpenChange: (open: boolean) => void
}

export function ProjectDialog({ open, project, onOpenChange }: ProjectDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { createProject, updateProject } = useServerStore()

  useEffect(() => {
    if (open) {
      setName(project?.name ?? '')
      setDescription(project?.description ?? '')
    }
  }, [open, project])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (project) {
      await updateProject(project.id, { name: name.trim(), description: description.trim() })
    } else {
      await createProject({ name: name.trim(), description: description.trim() })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{project ? t('projectDialog.editTitle') : t('projectDialog.newTitle')}</DialogTitle>
            <DialogDescription>
              {project
                ? t('projectDialog.editDesc')
                : t('projectDialog.newDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">{t('common.name')}</Label>
              <Input
                id="project-name"
                placeholder={t('projectDialog.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-desc">{t('common.description')}</Label>
              <Input
                id="project-desc"
                placeholder={t('projectDialog.descPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {project ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
