import { Button } from '@/components/ui/button'
import { ChevronDown, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ScrollControlsProps {
  isAtBottom: boolean
  isPaused: boolean
  onScrollToBottom: () => void
  onTogglePause: () => void
}

export function ScrollControls({
  isAtBottom,
  isPaused,
  onScrollToBottom,
  onTogglePause
}: ScrollControlsProps): JSX.Element | null {
  const { t } = useTranslation()
  if (isAtBottom && !isPaused) return null

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1">
      {!isAtBottom && (
        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-xs shadow-lg gap-1"
          onClick={onScrollToBottom}
        >
          <ChevronDown className="h-3 w-3" />
          {t('terminal.scrollBottom')}
        </Button>
      )}
      {isPaused && (
        <Button
          variant="secondary"
          size="sm"
          className="h-7 text-xs shadow-lg gap-1"
          onClick={onTogglePause}
        >
          <Play className="h-3 w-3" />
          {t('terminal.resume')}
        </Button>
      )}
    </div>
  )
}
