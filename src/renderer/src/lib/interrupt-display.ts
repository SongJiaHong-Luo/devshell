// Display-only repair: never send an extra Enter to the remote shell.
export function createInterruptDisplay(): { arm: () => void; format: (data: string) => string } {
  let until = 0
  let trailingCaret = false
  let afterEcho = false
  return {
    arm: () => { until = Date.now() + 2000; trailingCaret = false; afterEcho = false },
    format: (data) => {
      if (!data || Date.now() > until) return data
      if (afterEcho) {
        until = 0
        return /^[\r\n]/.test(data) ? data : '\r\n' + data
      }
      const index = data.indexOf('^C')
      const end = index >= 0 ? index + 2 : trailingCaret && data.startsWith('C') ? 1 : -1
      trailingCaret = data.endsWith('^')
      if (end < 0) return data
      if (end === data.length) { afterEcho = true; return data }
      until = 0
      return /[\r\n]/.test(data[end]) ? data : data.slice(0, end) + '\r\n' + data.slice(end)
    }
  }
}
