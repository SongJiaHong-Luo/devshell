// One xterm write in flight; SSH acknowledgements apply backpressure upstream.
export function createTerminalWriter(
  write: (data: string, done: () => void) => void,
  isVisible: () => boolean
): { push: (data: string, consumed?: () => void) => void; dispose: () => void } {
  let pending: { data: string; consumed?: () => void }[] = []
  let writing = false
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (): void => {
    if (disposed || writing || timer || !pending.length) return
    timer = setTimeout(flush, isVisible() ? 16 : 200)
  }
  const flush = (): void => {
    timer = undefined
    if (disposed || writing || !pending.length) return
    const batch = pending
    pending = []
    writing = true
    write(batch.map(item => item.data).join(''), () => {
      batch.forEach(item => item.consumed?.())
      writing = false
      schedule()
    })
  }
  return {
    push: (data, consumed) => {
      if (disposed) { consumed?.(); return }
      pending.push({ data, consumed })
      schedule()
    },
    dispose: () => {
      disposed = true
      if (timer) clearTimeout(timer)
      pending.forEach(item => item.consumed?.())
      pending = []
    }
  }
}
