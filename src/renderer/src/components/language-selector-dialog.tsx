import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { LANGUAGES } from '@/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface LanguageSelectorDialogProps {
  open: boolean
  onConfirm: () => void
}

export function LanguageSelectorDialog({ open, onConfirm }: LanguageSelectorDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(i18n.language)

  const handleConfirm = (): void => {
    i18n.changeLanguage(selected)
    localStorage.setItem('devshell-language', selected)
    window.api.settings.update({ language: selected })
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('languageSelector.title')}</DialogTitle>
          <DialogDescription>{t('languageSelector.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                selected === lang.code
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border hover:bg-accent/50 text-muted-foreground'
              }`}
              onClick={() => setSelected(lang.code)}
            >
              <span className="text-sm font-medium">{lang.label}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={handleConfirm}>{t('languageSelector.confirm')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
