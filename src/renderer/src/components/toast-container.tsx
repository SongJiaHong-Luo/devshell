import { useToastStore } from '@/stores/toast-store'
import { X, AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react'

const ICONS = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle
}

const COLORS = {
  error: 'border-red-500/50 bg-red-500/10 text-red-400',
  warning: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
  info: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
  success: 'border-green-500/50 bg-green-500/10 text-green-400'
}

export function ToastContainer(): JSX.Element {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return <></>

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type]
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-2 p-3 rounded-lg border text-sm animate-toast-in ${COLORS[toast.type]}`}
          >
            <Icon className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="flex-1 break-words">{toast.message}</span>
            <button
              className="shrink-0 opacity-70 hover:opacity-100"
              onClick={() => removeToast(toast.id)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
