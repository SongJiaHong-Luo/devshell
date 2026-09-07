export interface LogLevelColor {
  level: string
  pattern: RegExp
  ansiColor: string
  label: string
}

export const DEFAULT_LOG_COLORS: LogLevelColor[] = [
  { level: 'fatal', pattern: /\b(FATAL)\b/i, ansiColor: '\x1b[35m', label: 'FATAL (Magenta)' },
  { level: 'error', pattern: /\b(ERROR|ERR|ERRO|FAIL(?:ED|URE)?)\b|\b[\w.$]*(?:Exception|Error)\b|Communications link failure|Caused by:|异常|失败/i, ansiColor: '\x1b[31m', label: 'ERROR (Red)' },
  { level: 'warn', pattern: /\b(WARN(?:ING)?)\b/i, ansiColor: '\x1b[33m', label: 'WARN (Yellow)' },
  { level: 'info', pattern: /\b(INFO)\b/i, ansiColor: '\x1b[32m', label: 'INFO (Green)' },
  { level: 'debug', pattern: /\b(DEBUG|DBG)\b/i, ansiColor: '\x1b[36m', label: 'DEBUG (Cyan)' },
  { level: 'trace', pattern: /\b(TRACE|TRC)\b/i, ansiColor: '\x1b[90m', label: 'TRACE (Gray)' }
]

const ANSI_RESET = '\x1b[0m'

export function createLogHighlighter(
  colors: LogLevelColor[]
): (data: string) => string {
  let activeColor: string | null = null
  let partialLine = ''
  return (data: string): string => {
    // Split by lines, process each line independently
    const lines = data.split('\n')
    const result: string[] = []

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]
      const complete = index < lines.length - 1
      const text = partialLine + line
      partialLine = complete ? '' : text.slice(-16384)
      if (text.length === 0) {
        result.push(line)
        if (complete) activeColor = null
        continue
      }

      // Preserve remote terminal control sequences and its own color formatting.
      if (/\x1b/.test(text)) { result.push(line); continue }

      let highlighted = false
      for (const { pattern, ansiColor } of colors) {
        pattern.lastIndex = 0
        if (pattern.test(text)) {
          result.push(ansiColor + line + ANSI_RESET)
          activeColor = ansiColor
          highlighted = true
          break
        }
      }

      if (!highlighted) {
        const trimmed = text.trim()
        const isSqlLine = /^(SELECT|FROM|WHERE|AND|OR|ORDER\s+BY|GROUP\s+BY|LIMIT|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN)\b/i.test(trimmed)
        const isContinuation = /^\s+/.test(text) || /^(at\s+|Caused by:|Origin Sql:|Actual Sql:)/i.test(trimmed)
        if (isSqlLine && !activeColor) activeColor = colors.find((c) => c.level === 'debug')?.ansiColor ?? null
        if (activeColor && (isContinuation || isSqlLine)) {
          result.push(activeColor + line + ANSI_RESET)
        } else {
          result.push(line)
          activeColor = null
        }
      }
    }

    return result.join('\n')
  }
}
