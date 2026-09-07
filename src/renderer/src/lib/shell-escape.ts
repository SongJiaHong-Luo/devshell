/**
 * Quote a single argument for a POSIX-compatible remote shell.
 *
 * DevShell executes commands through ssh2, so values originating from form
 * fields must never be interpolated as raw shell syntax.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

export function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
