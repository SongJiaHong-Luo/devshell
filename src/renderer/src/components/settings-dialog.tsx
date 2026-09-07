import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { LANGUAGES } from '@/i18n'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useSettingsStore, LEVEL_LABELS, COLOR_OPTIONS } from '@/stores/settings-store'
import { useAppStore } from '@/stores/app-store'
import { Sun, Moon, RefreshCw } from 'lucide-react'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAbout?: () => void
}

export function SettingsDialog({ open, onOpenChange, onAbout }: SettingsDialogProps): JSX.Element {
  const { t } = useTranslation()
  const { logColors, fontSize, fetchSettings, updateLogColor, toggleLogLevel, updateFontSize } =
    useSettingsStore()
  const { theme, setTheme } = useAppStore()
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')

  useEffect(() => {
    const done = (message: string): void => { setCheckingUpdate(false); setUpdateMessage(message) }
    const subscriptions = [
      window.api.update.onChecking(() => { setCheckingUpdate(true); setUpdateMessage('') }),
      window.api.update.onNotAvailable(() => done('当前已是最新版本。')),
      window.api.update.onAvailable((info) => done(`发现新版本 ${info.version}，请在更新提示中下载。`)),
      window.api.update.onError((message) => done(`检查失败：${message}`))
    ]
    return () => subscriptions.forEach((unsubscribe) => unsubscribe())
  }, [])

  useEffect(() => {
    if (open) fetchSettings()
  }, [open])

  const handleLanguageChange = (code: string): void => {
    i18n.changeLanguage(code)
    localStorage.setItem('devshell-language', code)
    window.api.settings.update({ language: code })
  }

  const handleCheckForUpdates = (): void => {
    setCheckingUpdate(true)
    setUpdateMessage('')
    window.api.update.check().catch((error) => {
      setCheckingUpdate(false)
      setUpdateMessage(`检查失败：${String(error)}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-semibold">{t('settings.logColors')}</Label>
            <div className="space-y-2">
              {logColors.map((lc) => (
                <div key={lc.level} className="flex items-center gap-3">
                  <button
                    className={`w-4 h-4 rounded border ${
                      lc.enabled ? 'bg-primary' : 'bg-transparent'
                    }`}
                    onClick={() => toggleLogLevel(lc.level)}
                    title={lc.enabled ? t('settings.disable') : t('settings.enable')}
                  />
                  <span className="w-16 text-sm font-mono">
                    {LEVEL_LABELS[lc.level] || lc.level.toUpperCase()}
                  </span>
                  <div className="flex gap-1 flex-1">
                    {COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.ansi}
                        className={`w-5 h-5 rounded-full border-2 ${
                          lc.ansiColor === opt.ansi
                            ? 'border-foreground scale-110'
                            : 'border-transparent'
                        }`}
                        style={{ backgroundColor: opt.hex }}
                        title={t(`color.${opt.nameKey}`)}
                        onClick={() => updateLogColor(lc.level, opt.ansi)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t('settings.fontSize')}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={10}
                max={24}
                value={fontSize}
                onChange={(e) => updateFontSize(parseInt(e.target.value) || 14)}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">px</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t('settings.theme')}</Label>
            <div className="flex gap-2">
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setTheme('dark')}
              >
                <Moon className="h-3.5 w-3.5" />
                {t('settings.dark')}
              </Button>
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setTheme('light')}
              >
                <Sun className="h-3.5 w-3.5" />
                {t('settings.light')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">{t('settings.language')}</Label>
            <div className="flex gap-2 flex-wrap">
              {LANGUAGES.map((lang) => (
                <Button
                  key={lang.code}
                  variant={i18n.language === lang.code ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleLanguageChange(lang.code)}
                >
                  {lang.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="bg-muted rounded-md p-3">
            <Label className="text-xs text-muted-foreground mb-2 block">{t('common.preview')}</Label>
            <div className="font-mono text-xs space-y-0.5">
              {logColors
                .filter((c) => c.enabled)
                .map((lc) => {
                  const colorOpt = COLOR_OPTIONS.find((o) => o.ansi === lc.ansiColor)
                  return (
                    <div key={lc.level} style={{ color: colorOpt?.hex || '#fff' }}>
                      2026-05-27 10:23:45 [{LEVEL_LABELS[lc.level]}] {t('settings.sampleLog')}
                    </div>
                  )
                })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <div>
              <Label className="text-sm font-semibold">{t('update.title')}</Label>
              <p className="text-xs text-muted-foreground">{t('update.checkDescription')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleCheckForUpdates} disabled={checkingUpdate}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
              {checkingUpdate ? t('update.checking') : t('update.check')}
            </Button>
          </div>

          {updateMessage && <p role="status" className="text-xs break-words">{updateMessage}</p>}
          {onAbout && (
            <div className="text-center">
              <button
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                onClick={() => { onOpenChange(false); onAbout() }}
              >
                {t('app.about')}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
