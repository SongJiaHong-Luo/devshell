import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Download, CheckCircle, Loader2, X } from 'lucide-react'

interface UpdateInfo {
  version: string
  releaseDate: string
  releaseNotes: string
}

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'

export function UpdateBanner(): JSX.Element {
  const { t } = useTranslation()
  const [state, setState] = useState<UpdateState>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsubChecking = window.api.update.onChecking(() => {
      setState('checking')
      setDismissed(false)
    })

    const unsubAvailable = window.api.update.onAvailable((updateInfo) => {
      setState('available')
      setInfo(updateInfo)
      setDismissed(false)
    })

    const unsubNotAvailable = window.api.update.onNotAvailable(() => {
      setState('idle')
    })

    const unsubProgress = window.api.update.onProgress((p) => {
      setState('downloading')
      setProgress(p.percent)
    })

    const unsubDownloaded = window.api.update.onDownloaded(() => {
      setState('downloaded')
    })

    const unsubError = window.api.update.onError(() => {
      setState('error')
    })

    return () => {
      unsubChecking()
      unsubAvailable()
      unsubNotAvailable()
      unsubProgress()
      unsubDownloaded()
      unsubError()
    }
  }, [])

  if (dismissed || state === 'idle' || state === 'checking') return <></>

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-popover border border-border rounded-lg shadow-lg p-3 flex items-center gap-3 max-w-md">
      {state === 'available' && info && (
        <>
          <Download className="h-4 w-4 text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{t('update.available', { version: info.version })}</p>
            <p className="text-xs text-muted-foreground">{t('update.description')}</p>
          </div>
          <Button size="sm" onClick={() => window.api.update.download()}>
            {t('update.download')}
          </Button>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setDismissed(true)}>
            <X className="h-4 w-4" />
          </button>
        </>
      )}
      {state === 'downloading' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-accent shrink-0" />
          <div className="flex-1">
            <p className="text-sm">{t('update.downloading')}</p>
            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
              <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </>
      )}
      {state === 'downloaded' && (
        <>
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
          <p className="text-sm flex-1">{t('update.downloaded')}</p>
          <Button size="sm" onClick={() => window.api.update.install()}>
            {t('update.restart')}
          </Button>
        </>
      )}
      {state === 'error' && (
        <>
          <X className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm flex-1">{t('update.error')}</p>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setDismissed(true)}>
            <X className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  )
}
