import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface AboutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (open) {
      window.api.app.getVersion().then(setVersion)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('about.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <img src="resources/icon.png" alt="DevShell" className="w-12 h-12 rounded-lg" />
            <div>
              <h3 className="text-lg font-bold">DevShell</h3>
              <p className="text-xs text-muted-foreground">{t('about.version', { version })}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('about.description')}
          </p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{t('about.techElectron')}</p>
            <p>{t('about.techTerminal')}</p>
            <p>{t('about.techSsh')}</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('common.ok')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
