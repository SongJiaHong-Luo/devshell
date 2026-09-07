import { randomUUID } from 'crypto'

const byStream = new WeakMap<object, string>()
const flows = new Map<string, { stream: any; windowId: number; pending: number }>()

export function trackOutput(stream: any, windowId: number, length: number): string {
  let token = byStream.get(stream)
  if (!token) {
    token = randomUUID()
    byStream.set(stream, token)
    flows.set(token, { stream, windowId, pending: 0 })
    stream.once('close', () => { flows.delete(token!); byStream.delete(stream) })
  }
  const flow = flows.get(token)!
  flow.pending += length
  if (flow.pending >= 256 * 1024) { stream.pause(); stream.stderr?.pause() }
  return token
}

export function acknowledgeOutput(token: string, length: number, windowId: number): void {
  const flow = flows.get(token)
  if (!flow || flow.windowId !== windowId || !Number.isSafeInteger(length) || length <= 0 || length > flow.pending) return
  flow.pending -= length
  if (flow.pending < 128 * 1024) { flow.stream.resume(); flow.stream.stderr?.resume() }
}
