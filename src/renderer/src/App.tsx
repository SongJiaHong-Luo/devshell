import { useState, useEffect, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { useAppStore } from '@/stores/app-store'
import { useSessionStore } from '@/stores/session-store'
import { ServerSidebar } from '@/components/server-sidebar'
import { TabBar } from '@/components/tab-bar'
import { Terminal } from '@/components/terminal'
import { ToastContainer } from '@/components/toast-container'
import { UpdateBanner } from '@/components/update-banner'
import { useServerStore } from '@/stores/server-store'
import { showError } from '@/stores/toast-store'
import { formatConnectionError } from '@/lib/user-error'
import { Button } from '@/components/ui/button'
import { Settings, Search, Terminal as TerminalIcon, Zap, FolderOpen, CircleCheck, Circle } from 'lucide-react'
import type { Server } from '@shared/types/server'

const SettingsDialog = lazy(() => import('@/components/settings-dialog').then((m) => ({ default: m.SettingsDialog })))
const GrepPanel = lazy(() => import('@/components/grep-panel').then((m) => ({ default: m.GrepPanel })))
const CommandPanel = lazy(() => import('@/components/command-panel').then((m) => ({ default: m.CommandPanel })))
const SftpPanel = lazy(() => import('@/components/sftp-panel').then((m) => ({ default: m.SftpPanel })))
const AboutDialog = lazy(() => import('@/components/about-dialog').then((m) => ({ default: m.AboutDialog })))
const LanguageSelectorDialog = lazy(() => import('@/components/language-selector-dialog').then((m) => ({ default: m.LanguageSelectorDialog })))
const LogViewer = lazy(() => import('@/components/log-viewer').then((m) => ({ default: m.LogViewer })))

function App(): JSX.Element {
  const { t } = useTranslation()
  const { theme } = useAppStore()
  const { sessions, activeSessionId, focusSession } = useSessionStore()
  const { projects } = useServerStore()
  const [showLanguageSelector, setShowLanguageSelector] = useState(false)

  useEffect(() => {
    const unsubError = window.api.ssh.onError((_sessionId, message) => {
      showError(formatConnectionError(new Error(message)))
    })
    window.api.settings.get().then((settings) => {
      if (settings.language) {
        i18n.changeLanguage(settings.language)
        localStorage.setItem('devshell-language', settings.language)
      } else if (!localStorage.getItem('devshell-language')) {
        setShowLanguageSelector(true)
      }
    })
    return () => { unsubError() }
  }, [])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showGrep, setShowGrep] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [showSftp, setShowSftp] = useState(false)

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const handleRunCommand = (command: string): void => {
    if (activeSession) {
      // 不再自动添加 \n，由调用方决定是否添加
      window.api.ssh.send(activeSession.id, command)
      focusSession(activeSession.id)
    }
  }

  return (
    <div className={`${theme} h-screen flex bg-background text-foreground`}>
      <ServerSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TabBar />
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 relative">
            {sessions.length > 0 ? (
              <>
                {sessions.map((session) => {
                  // Log viewer session
                  if (session.sessionType === 'log-viewer') {
                    return (
                      <div
                        key={session.id}
                        className="w-full h-full absolute inset-0"
                        style={{ display: session.id === activeSessionId ? 'block' : 'none' }}
                      >
                        <Suspense>
                          <LogViewer
                            sessionId={session.id}
                            serverId={session.serverId}
                            containerName={session.containerId!}
                            filePath={session.logFilePath!}
                          />
                        </Suspense>
                      </div>
                    )
                  }

                  // Terminal session
                  const server = findServerById(projects, session.serverId)
                  if (!server) return null
                  return (
                    <div
                      key={session.id}
                      className="w-full h-full absolute inset-0"
                      style={{ display: session.id === activeSessionId ? 'block' : 'none' }}
                    >
                      <Terminal
                        sessionId={session.id}
                        server={server}
                        bastion={session.bastion}
                        bastionCommand={session.bastionCommand}
                        showSearch={session.id === activeSessionId && showSearch}
                        onSearchClose={() => setShowSearch(false)}
                      />
                    </div>
                  )
                })}
                <div className="absolute bottom-3 right-3 flex gap-1 z-10">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-50 hover:opacity-100"
                    onClick={() => setShowSearch(!showSearch)}
                    title={t('app.terminalSearch')}
                  >
                    <Search className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={showGrep ? 'default' : 'ghost'}
                    size="icon"
                    className="h-7 w-7 opacity-50 hover:opacity-100"
                    onClick={() => setShowGrep(!showGrep)}
                    title={t('app.grepSearch')}
                  >
                    <TerminalIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={showCommands ? 'default' : 'ghost'}
                    size="icon"
                    className="h-7 w-7 opacity-50 hover:opacity-100"
                    onClick={() => setShowCommands(!showCommands)}
                    title={t('app.quickCommands')}
                  >
                    <Zap className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={showSftp ? 'default' : 'ghost'}
                    size="icon"
                    className="h-7 w-7 opacity-50 hover:opacity-100"
                    onClick={() => setShowSftp(!showSftp)}
                    title={t('app.sftpBrowser')}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-50 hover:opacity-100"
                    onClick={() => setSettingsOpen(true)}
                    title={t('app.settings')}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
                  <h2 className="text-2xl font-bold">{t('app.welcome')}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {projects.length === 0
                      ? '从创建一个项目开始，随后添加 SSH 服务器即可连接。'
                      : '双击左侧服务器建立连接；连接后即可使用日志搜索、快捷命令和 SFTP。'}
                  </p>
                  <div className="mt-6 space-y-3 text-left text-sm">
                    <div className="flex items-center gap-3">
                      <CircleCheck className="h-4 w-4 text-primary" />
                      <span>创建项目，整理不同环境的服务器</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Circle className="h-4 w-4 text-muted-foreground" />
                      <span>粘贴 SSH 命令，自动填入连接信息</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Circle className="h-4 w-4 text-muted-foreground" />
                      <span>测试连接后，开始查看日志与排查问题</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {showGrep && activeSession && (
            <Suspense>
              <GrepPanel sessionId={activeSession.id} onClose={() => setShowGrep(false)} />
            </Suspense>
          )}
          {showCommands && (
            <Suspense>
              <CommandPanel onRun={handleRunCommand} onClose={() => setShowCommands(false)} />
            </Suspense>
          )}
          {showSftp && activeSession && (
            <Suspense>
              <SftpPanel key={activeSession.id} sessionId={activeSession.id} onClose={() => setShowSftp(false)} />
            </Suspense>
          )}
        </div>
      </div>
      <Suspense>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} onAbout={() => setAboutOpen(true)} />
      </Suspense>
      <Suspense>
        <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      </Suspense>
      <Suspense>
        <LanguageSelectorDialog open={showLanguageSelector} onConfirm={() => setShowLanguageSelector(false)} />
      </Suspense>
      <ToastContainer />
      <UpdateBanner />
    </div>
  )
}

function findServerById(
  projects: ReturnType<typeof useServerStore.getState>['projects'],
  serverId: string
): Server | null {
  for (const p of projects) {
    // Check project-level servers
    const found = p.servers?.find((s) => s.id === serverId)
    if (found) return found
    // Recursively check groups
    const inGroup = findServerInGroups(p.groups || [], serverId)
    if (inGroup) return inGroup
  }
  return null
}

function findServerInGroups(groups: { servers?: Server[]; groups?: typeof groups }[], serverId: string): Server | null {
  for (const group of groups) {
    const found = group.servers?.find((s) => s.id === serverId)
    if (found) return found
    if (group.groups) {
      const inSubGroup = findServerInGroups(group.groups, serverId)
      if (inSubGroup) return inSubGroup
    }
  }
  return null
}

export default App
