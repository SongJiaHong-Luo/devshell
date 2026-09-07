import { Client, type ClientChannel } from 'ssh2'
import { readFileSync } from 'fs'
import { BrowserWindow, dialog } from 'electron'
import type { SshConnectOptions, SshConnectionTestOptions } from '@shared/types/ssh'
import { getKnownHost, trustHost } from '../store/known-hosts-store'
import { trackOutput } from './output-flow'

interface Session {
  client: Client
  channel: ClientChannel
  windowId: number
  shellOnly?: boolean
}

const sessions = new Map<string, Session>()

// Generation checks prevent callbacks from cancelled/replaced connections
// from registering shells or changing the replacement session's state.
const pendingDirectClients = new Map<string, { client: Client; generation: number }>()
const pendingGenerations = new Map<string, number>()
const generationCounters = new Map<string, number>()

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId)
}

function sendToRenderer(windowId: number, channel: string, ...args: unknown[]): void {
  const win = BrowserWindow.fromId(windowId)
  if (win && !win.isDestroyed()) {
    if (channel === 'ssh:data' || channel === 'ssh:exec-stream-data') {
      const stream = channel === 'ssh:data' ? sessions.get(args[0] as string)?.channel : execStreams.get(args[0] as string)?.stream
      if (!stream) return
      args.push(trackOutput(stream, windowId, (args[1] as string).length))
    }
    win.webContents.send(channel, ...args)
  }
}

function buildConnectConfig(
  opts: { host: string; port: number; username: string; authType: 'password' | 'key'; password?: string; privateKeyPath?: string },
  windowId: number
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    host: opts.host,
    port: opts.port,
    username: opts.username,
    readyTimeout: 15000,
    keepaliveInterval: 10000,
    hostHash: 'sha256',
    hostVerifier: (fingerprint: string, verify: (valid: boolean) => void): void => {
      const known = getKnownHost(opts.host, opts.port)
      if (known?.fingerprint === fingerprint) {
        verify(true)
        return
      }

      const win = BrowserWindow.fromId(windowId)
      if (!win || win.isDestroyed()) {
        verify(false)
        return
      }

      const changed = Boolean(known)
      void dialog.showMessageBox(win, {
        type: changed ? 'warning' : 'question',
        title: changed ? 'SSH 主机指纹已变化' : '确认 SSH 主机身份',
        message: changed
          ? `${opts.host}:${opts.port} 的主机指纹与此前记录不一致。`
          : `首次连接到 ${opts.host}:${opts.port}，请核对主机指纹。`,
        detail: changed
          ? `原指纹：SHA256:${known?.fingerprint}\n新指纹：SHA256:${fingerprint}\n\n除非管理员已确认服务器密钥发生变更，否则请取消连接。`
          : `SHA256:${fingerprint}`,
        buttons: changed ? ['取消连接', '信任新指纹'] : ['取消', '信任并连接'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      }).then(({ response }) => {
        if (response === 1) {
          trustHost(opts.host, opts.port, fingerprint)
          verify(true)
        } else {
          verify(false)
        }
      }).catch(() => verify(false))
    }
  }
  if (opts.authType === 'password') {
    config.password = opts.password
  } else if (opts.authType === 'key' && opts.privateKeyPath) {
    try {
      config.privateKey = readFileSync(opts.privateKeyPath)
    } catch (err) {
      throw new Error(`Failed to read private key: ${(err as Error).message}`)
    }
  }
  return config
}

function connectBastion(opts: SshConnectOptions['bastion'], windowId: number, sid: string, generation: number): Promise<Client> {
  if (!opts) return Promise.reject(new Error('No bastion config'))
  // Each terminal owns its connection; closing one must not close sibling shells.
  return new Promise((resolve, reject) => {
    const client = new Client()
    pendingDirectClients.set(sid, { client, generation })
    client.on('ready', () => {
      resolve(client)
    })
    client.on('error', (err) => {
      client.end()
      reject(new Error(`Bastion connection failed: ${err.message}`))
    })
    client.on('close', () => {
      reject(new Error('Bastion connection closed'))
    })
    try {
      const config = buildConnectConfig(opts, windowId)
      client.connect(config)
    } catch (err) {
      client.end()
      reject(err)
    }
  })
}

export function connectSession(opts: SshConnectOptions, windowId: number): void {
  disconnectSession(opts.sessionId)
  if (opts.bastion) {
    connectThroughBastion(opts, windowId)
  } else {
    connectDirect(opts, windowId)
  }
}

export function testConnection(options: SshConnectionTestOptions, windowId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    const timeout = setTimeout(() => {
      client.end()
      reject(new Error('Connection timed out after 15 seconds'))
    }, 15_000)
    let settled = false
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }

    client.once('ready', () => {
      client.end()
      finish(resolve)
    })
    client.once('error', (error) => {
      finish(() => reject(error))
    })
    try {
      client.connect(buildConnectConfig(options, windowId))
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

// ---------------------------------------------------------------------------
// Generation helpers
// ---------------------------------------------------------------------------

function invalidateGeneration(sid: string): void {
  pendingGenerations.set(sid, -1)
}

function nextGeneration(sid: string): number {
  const prev = generationCounters.get(sid) ?? 0
  const gen = prev + 1
  generationCounters.set(sid, gen)
  pendingGenerations.set(sid, gen)
  return gen
}

function currentGeneration(sid: string): number {
  return pendingGenerations.get(sid) ?? -1
}

// ---------------------------------------------------------------------------
// Direct connection
// ---------------------------------------------------------------------------

function connectDirect(opts: SshConnectOptions, windowId: number): void {
  const sid = opts.sessionId

  // 1. Terminate any previous pending direct client.
  const old = pendingDirectClients.get(sid)
  if (old) {
    old.client.end()
    pendingDirectClients.delete(sid)
  }

  // 2. If there's already an active session, clean it up.
  const existing = sessions.get(sid)
  if (existing) {
    existing.channel.close()
    existing.client.end()
    sessions.delete(sid)
  }

  // 3. Bump generation and register the new pending client.
  const generation = nextGeneration(sid)

  const client = new Client()
  pendingDirectClients.set(sid, { client, generation })

  client.on('ready', () => {
    if (currentGeneration(sid) !== generation) {
      client.end()
      return
    }
    openShell(client, sid, windowId, generation)
  })

  client.on('error', (err) => {
    if (currentGeneration(sid) !== generation) return
    if (currentGeneration(sid) === generation) {
      pendingDirectClients.delete(sid)
      pendingGenerations.delete(sid)
    }
    stopExecStreamsForSession(sid)
    sessions.delete(sid)
    sendToRenderer(windowId, 'ssh:error', sid, err.message)
  })

  client.on('close', () => {
    if (currentGeneration(sid) !== generation) return
    if (currentGeneration(sid) === generation) {
      pendingDirectClients.delete(sid)
      pendingGenerations.delete(sid)
    }
    stopExecStreamsForSession(sid)
    sessions.delete(sid)
    sendToRenderer(windowId, 'ssh:closed', sid)
  })

  try {
    const config = buildConnectConfig(opts, windowId)
    client.connect(config)
  } catch (err) {
    if (currentGeneration(sid) === generation) {
      pendingDirectClients.delete(sid)
      pendingGenerations.delete(sid)
    }
    client.end()
    sendToRenderer(windowId, 'ssh:error', sid, (err as Error).message)
  }
}

// ---------------------------------------------------------------------------
// Bastion (jump-host) connection
// ---------------------------------------------------------------------------

function connectThroughBastion(opts: SshConnectOptions, windowId: number): void {
  const sid = opts.sessionId
  const bastionOpts = opts.bastion!
  const bastionCmd = opts.bastionCommand

  // 1. If there's already an active session, clean it up.
  const existing = sessions.get(sid)
  if (existing) {
    existing.channel.close()
    existing.client.end()
    sessions.delete(sid)
  }

  // Bump generation so pending shell callbacks can detect cancellation.
  const generation = nextGeneration(sid)

  connectBastion(bastionOpts, windowId, sid, generation).then((bastionClient) => {
    // Guard: a newer connect or disconnect happened while we awaited.
    if (currentGeneration(sid) !== generation) {
      bastionClient.end()
      return
    }

    // Defer the shell() call so its callback fires as a macrotask AFTER
    // React StrictMode's synchronous cleanup has a chance to run.
    // Without this, the I/O callback can fire between .then and cleanup,
    // opening the shell and sending data before cleanup can prevent it.
    setTimeout(() => {
      bastionClient.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
      if (currentGeneration(sid) !== generation) {
        if (stream) stream.close()
        bastionClient.end()
        return
      }

      if (err) {
        pendingDirectClients.delete(sid)
        bastionClient.end()
        sendToRenderer(windowId, 'ssh:error', sid, err.message)
        return
      }

      // Shell opened, we're current — proceed.
      pendingDirectClients.delete(sid)
      sessions.set(sid, { client: bastionClient, channel: stream, windowId, shellOnly: Boolean(bastionCmd) })

      // Auto-login state machine
      let autoLoginDone = !bastionCmd
      let autoLoginStep = 0
      let autoLoginBuffer = ''
      let autoLoginFlushTimer: ReturnType<typeof setTimeout> | null = null

      let autoLoginFlushing = false

      const flushAutoLogin = (): void => {
        if (autoLoginFlushTimer) {
          clearTimeout(autoLoginFlushTimer)
          autoLoginFlushTimer = null
        }
        if (autoLoginBuffer) {
          sendToRenderer(windowId, 'ssh:data', sid, autoLoginBuffer)
          autoLoginBuffer = ''
        }
        // Now switch to direct mode — all subsequent data goes straight
        // to the renderer without buffering.
        autoLoginFlushing = false
      }

      const onData = (data: Buffer): void => {
        if (sessions.get(sid)?.channel !== stream) return
        const text = data.toString('utf-8')

        // After the flush is complete, send data directly.
        if (!autoLoginFlushing && autoLoginDone) {
          sendToRenderer(windowId, 'ssh:data', sid, text)
          return
        }

        // During auto-login (and the flush delay), accumulate data.
        autoLoginBuffer += text
        const lower = autoLoginBuffer.toLowerCase()

        if (autoLoginStep === 0 && /[>$#%\]]\s*$/.test(lower.trim())) {
          autoLoginStep = 1
          setTimeout(() => {
            if (currentGeneration(sid) === generation) stream.write(bastionCmd + '\r')
          }, 300)
        } else if (autoLoginStep === 1 && /username\s*[:：]/i.test(lower)) {
          autoLoginStep = 2
          setTimeout(() => {
            if (currentGeneration(sid) === generation) stream.write(opts.username + '\r')
          }, 200)
        } else if (autoLoginStep === 2 && /password\s*[:：]/i.test(lower)) {
          autoLoginStep = 3
          setTimeout(() => {
            if (currentGeneration(sid) !== generation) return
            stream.write((opts.password || '') + '\r')
            autoLoginDone = true
            autoLoginFlushing = true
            autoLoginFlushTimer = setTimeout(flushAutoLogin, 500)
          }, 200)
        }
      }

      stream.on('data', onData)

      stream.stderr.on('data', (data: Buffer) => {
        if (sessions.get(sid)?.channel !== stream) return
        sendToRenderer(windowId, 'ssh:data', sid, data.toString('utf-8'))
      })

      stream.on('close', () => {
        if (autoLoginFlushTimer) {
          clearTimeout(autoLoginFlushTimer)
        }
        if (sessions.get(sid)?.channel === stream) {
          stopExecStreamsForSession(sid)
          sessions.delete(sid)
          pendingGenerations.delete(sid)
          sendToRenderer(windowId, 'ssh:closed', sid)
        }
        bastionClient.end()
      })

      sendToRenderer(windowId, 'ssh:connected', sid)
    })
    }, 10) // end setTimeout
  }).catch((err) => {
    if (currentGeneration(sid) !== generation) return
    pendingDirectClients.delete(sid)
    if (currentGeneration(sid) === generation) {
      pendingGenerations.delete(sid)
    }
    sendToRenderer(windowId, 'ssh:error', sid, (err as Error).message)
  })
}

// ---------------------------------------------------------------------------
// Shell / data / lifecycle
// ---------------------------------------------------------------------------

function openShell(client: Client, sessionId: string, windowId: number, generation: number): void {
  client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
    if (currentGeneration(sessionId) !== generation) {
      if (stream) stream.close()
      client.end()
      return
    }
    pendingDirectClients.delete(sessionId)
    if (err) {
      sendToRenderer(windowId, 'ssh:error', sessionId, err.message)
      client.end()
      return
    }

    sessions.set(sessionId, { client, channel: stream, windowId })

    stream.on('data', (data: Buffer) => {
      if (sessions.get(sessionId)?.channel !== stream) return
      sendToRenderer(windowId, 'ssh:data', sessionId, data.toString('utf-8'))
    })

    stream.stderr.on('data', (data: Buffer) => {
      if (sessions.get(sessionId)?.channel !== stream) return
      sendToRenderer(windowId, 'ssh:data', sessionId, data.toString('utf-8'))
    })

    stream.on('close', () => {
      if (sessions.get(sessionId)?.channel === stream) {
        stopExecStreamsForSession(sessionId)
        sessions.delete(sessionId)
        pendingGenerations.delete(sessionId)
        sendToRenderer(windowId, 'ssh:closed', sessionId)
      }
      client.end()
    })

    sendToRenderer(windowId, 'ssh:connected', sessionId)
  })
}

export function sendData(sessionId: string, data: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.channel.write(data)
  }
}

export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.channel.setWindow(rows, cols, 0, 0)
  }
}

export function disconnectSession(sessionId: string): void {
  // 1. Invalidate all in-flight async callbacks for this session.
  invalidateGeneration(sessionId)
  stopExecStreamsForSession(sessionId)

  // 2. Terminate any pending direct client (SSH handshake still in progress).
  const pending = pendingDirectClients.get(sessionId)
  if (pending) {
    pending.client.end()
    pendingDirectClients.delete(sessionId)
  }

  // 4. Close the active session if one was already established.
  const session = sessions.get(sessionId)
  if (session) {
    session.channel.close()
    session.client.end()
    sessions.delete(sessionId)
  }

  pendingGenerations.delete(sessionId)
}

export function disconnectAll(): void {
  for (const [, p] of pendingDirectClients) {
    p.client.end()
  }
  pendingDirectClients.clear()

  pendingGenerations.clear()

  stopExecStreamsForSession()

  for (const [, session] of sessions) {
    session.channel.close()
    session.client.end()
  }
  sessions.clear()

}

export function execCommand(sessionId: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const session = sessions.get(sessionId)
    if (!session) {
      reject(new Error('Session not found'))
      return
    }
    if (session.shellOnly) {
      reject(new Error('堡垒机菜单会话仅支持终端操作，请在终端中执行命令。'))
      return
    }
    const maxOutputBytes = 5 * 1024 * 1024
    const timeoutMs = 30_000
    let output = ''
    let outputBytes = 0
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined

    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      callback()
    }

    session.client.exec(command, { pty: false }, (err, stream) => {
      if (sessions.get(sessionId) !== session) {
        if (stream) stream.close()
        finish(() => reject(new Error('Session disconnected')))
        return
      }
      if (err) {
        finish(() => reject(err))
        return
      }

      const append = (data: Buffer): void => {
        if (settled) return
        outputBytes += data.length
        if (outputBytes > maxOutputBytes) {
          try { stream.close() } catch {}
          finish(() => reject(new Error('Command output exceeded the 5 MB safety limit')))
          return
        }
        output += data.toString('utf-8')
      }

      stream.on('data', append)
      stream.stderr.on('data', append)
      stream.on('close', () => {
        finish(() => resolve(output))
      })

      timeout = setTimeout(() => {
        try { stream.close() } catch {}
        finish(() => reject(new Error('Command timed out after 30 seconds')))
      }, timeoutMs)
    })
  })
}

// Streaming exec: sends data events to renderer as they arrive (for tail -f)
const execStreams = new Map<string, { stream?: any; sessionId: string }>()

function stopExecStreamsForSession(sessionId?: string): void {
  for (const [streamId, entry] of execStreams) {
    if (!sessionId || entry.sessionId === sessionId) {
      execStreamStop(streamId)
    }
  }
}

export function execStreamStart(
  sessionId: string,
  streamId: string,
  command: string
): void {
  const session = sessions.get(sessionId)
  if (!session) return
  if (session.shellOnly) {
    sendToRenderer(session.windowId, 'ssh:exec-stream-error', streamId, '堡垒机菜单会话仅支持终端操作，请在终端中执行命令。')
    return
  }

  // Stop any existing stream with the same ID
  execStreamStop(streamId)
  const entry: { stream?: any; sessionId: string } = { sessionId }
  execStreams.set(streamId, entry)
  session.client.exec(command, { pty: false }, (err, stream) => {
    if (execStreams.get(streamId) !== entry || sessions.get(sessionId) !== session) {
      if (stream) stream.close()
      return
    }
    if (err) {
      execStreams.delete(streamId)
      sendToRenderer(session.windowId, 'ssh:exec-stream-error', streamId, err.message)
      return
    }

    entry.stream = stream

    stream.on('data', (data: Buffer) => {
      sendToRenderer(session.windowId, 'ssh:exec-stream-data', streamId, data.toString('utf-8'))
    })

    stream.stderr.on('data', (data: Buffer) => {
      sendToRenderer(session.windowId, 'ssh:exec-stream-data', streamId, data.toString('utf-8'))
    })

    stream.on('close', () => {
      if (execStreams.get(streamId) !== entry) return
      execStreams.delete(streamId)
      sendToRenderer(session.windowId, 'ssh:exec-stream-end', streamId)
    })
  })
}

export function execStreamStop(streamId: string): void {
  const entry = execStreams.get(streamId)
  if (entry) {
    execStreams.delete(streamId)
    try {
      entry.stream?.close()
    } catch {}
  }
}
