import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { SearchAddon } from '@xterm/addon-search'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown, X, Regex } from 'lucide-react'

interface TerminalSearchProps {
  searchAddon: SearchAddon | null
  onClose: () => void
}

export function TerminalSearch({ searchAddon, onClose }: TerminalSearchProps): JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(
    (direction: 'next' | 'prev') => {
      if (!searchAddon || !query) {
        return
      }
      if (direction === 'next') {
        searchAddon.findNext(query, { regex: useRegex, caseSensitive: false, wholeWord: false })
      } else {
        searchAddon.findPrevious(query, { regex: useRegex, caseSensitive: false, wholeWord: false })
      }
    },
    [searchAddon, query, useRegex]
  )

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      doSearch(e.shiftKey ? 'prev' : 'next')
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  useEffect(() => {
    if (!searchAddon || !query) {
      return
    }
    // Search on query change
    searchAddon.findNext(query, { regex: useRegex, caseSensitive: false, wholeWord: false })
  }, [query, useRegex, searchAddon])

  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-background border border-border rounded-md shadow-lg px-2 py-1">
      <Button
        variant={useRegex ? 'default' : 'ghost'}
        size="icon"
        className="h-6 w-6"
        onClick={() => setUseRegex(!useRegex)}
        title={t('terminal.regex')}
      >
        <Regex className="h-3 w-3" />
      </Button>
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('terminal.search')}
        className="h-6 w-48 text-xs border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => doSearch('prev')}>
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => doSearch('next')}>
        <ChevronDown className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}
