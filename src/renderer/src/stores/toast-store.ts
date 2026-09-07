import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'error' | 'warning' | 'info' | 'success'
  message: string
  duration?: number
}

let toastCounter = 0

interface ToastState {
  toasts: Toast[]
  addToast: (type: Toast['type'], message: string, duration?: number) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (type, message, duration = 4000) => {
    const id = `toast-${++toastCounter}`
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, duration }]
    }))
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id)
        }))
      }, duration)
    }
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    }))
  }
}))

export function showError(message: string): void {
  useToastStore.getState().addToast('error', message)
}

export function showWarning(message: string): void {
  useToastStore.getState().addToast('warning', message)
}

export function showInfo(message: string): void {
  useToastStore.getState().addToast('info', message)
}

export function showSuccess(message: string): void {
  useToastStore.getState().addToast('success', message)
}
