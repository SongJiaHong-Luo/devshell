import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, X, Loader2 } from 'lucide-react'
import { shellQuote } from '@/lib/shell-escape'
import { formatConnectionError } from '@/lib/user-error'

interface GrepPanelProps {
  sessionId: string
  onClose: () => void
}

interface GrepLine {
  file: string
  lineNum: string
  content: string
  raw: string
}

export function GrepPanel({ sessionId, onClose }: GrepPanelProps): JSX.Element {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [directory, setDirectory] = useState('/var/log')
  const [filePattern, setFilePattern] = useState('*.log')
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [results, setResults] = useState<GrepLine[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  const buildCommand = useCallback((): string => {
    let cmd = 'grep -rn'

    // Time range via --after-context isn't ideal; use find + grep combo
    // For simplicity: if time range set, use find with -newermt
    if (timeFrom || timeTo) {
      const findParts = [`find ${shellQuote(directory)}`]
      if (filePattern) findParts.push(`-name ${shellQuote(filePattern)}`)
      if (timeFrom) findParts.push(`-newermt ${shellQuote(timeFrom)}`)
      if (timeTo) findParts.push(`! -newermt ${shellQuote(timeTo)}`)
      findParts.push('-type f')
      const findCmd = findParts.join(' ')
      cmd = `${findCmd} -exec grep -Hn -- ${shellQuote(keyword)} {} +`
    } else {
      if (filePattern) cmd += ` --include=${shellQuote(filePattern)}`
      cmd += ` -- ${shellQuote(keyword)} ${shellQuote(directory)}`
    }

    return cmd
  }, [keyword, directory, filePattern, timeFrom, timeTo])

  const parseResults = (output: string): GrepLine[] => {
    const lines = output.split('\n').filter((l) => l.trim())
    return lines.map((raw) => {
      const match = raw.match(/^(.+?):(\d+):(.*)$/)
      if (match) {
        return { file: match[1], lineNum: match[2], content: match[3], raw }
      }
      return { file: '', lineNum: '', content: raw, raw }
    })
  }

  const handleSearch = async (): Promise<void> => {
    if (!keyword.trim()) return
    setSearching(true)
    setError('')
    setResults([])
    try {
      const cmd = buildCommand()
      const output = await window.api.ssh.exec(sessionId, cmd)
      setResults(parseResults(output))
    } catch (err) {
      setError(formatConnectionError(err))
    } finally {
      setSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="w-96 border-l border-border bg-card flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('grep.title')}</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="p-3 space-y-2 border-b border-border">
        <div className="grid gap-1">
          <Label htmlFor="grep-keyword" className="text-xs">
            {t('grep.keyword')}
          </Label>
          <Input
            id="grep-keyword"
            placeholder={t('grep.keywordPlaceholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label htmlFor="grep-dir" className="text-xs">
              {t('grep.directory')}
            </Label>
            <Input
              id="grep-dir"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="grep-file" className="text-xs">
              {t('grep.filePattern')}
            </Label>
            <Input
              id="grep-file"
              value={filePattern}
              onChange={(e) => setFilePattern(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label htmlFor="grep-from" className="text-xs">
              {t('grep.dateFrom')}
            </Label>
            <Input
              id="grep-from"
              placeholder="2026-05-01"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="grep-to" className="text-xs">
              {t('grep.dateTo')}
            </Label>
            <Input
              id="grep-to"
              placeholder="2026-05-27"
              value={timeTo}
              onChange={(e) => setTimeTo(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <Button size="sm" className="w-full h-8" onClick={handleSearch} disabled={searching || !keyword.trim()}>
          {searching ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Search className="mr-1 h-3 w-3" />
          )}
          {t('grep.search')}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {error && (
          <div className="p-3 text-xs text-destructive">{error}</div>
        )}
        {results.length > 0 && (
          <div className="p-2 text-xs font-mono">
            <div className="text-muted-foreground mb-2">{t('grep.matches', { count: results.length })}</div>
            {results.map((r, i) => (
              <div key={i} className="py-0.5 hover:bg-accent/50 rounded px-1">
                {r.file && (
                  <div className="text-blue-400 text-[10px]">
                    {r.file}:{r.lineNum}
                  </div>
                )}
                <div className="text-foreground whitespace-pre-wrap break-all">
                  {r.content}
                </div>
              </div>
            ))}
          </div>
        )}
        {!searching && !error && results.length === 0 && keyword && (
          <div className="p-3 text-xs text-muted-foreground text-center">{t('grep.noResults')}</div>
        )}
      </ScrollArea>
    </div>
  )
}
