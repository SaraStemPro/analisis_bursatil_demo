import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { market } from '../../api'
import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (ticker: string, name?: string) => void
}

export default function TickerSearchInput({ value, onChange }: Props) {
  const [query, setQuery] = useState(value)
  useEffect(() => { setQuery(value) }, [value])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    clearTimeout(timerRef.current)
    if (query.length >= 1) {
      timerRef.current = setTimeout(() => setDebouncedQuery(query), 300)
    } else {
      setDebouncedQuery('')
    }
    return () => clearTimeout(timerRef.current)
  }, [query])

  const { data: results } = useQuery({
    queryKey: ['tickerSearch', debouncedQuery],
    queryFn: () => market.search(debouncedQuery),
    enabled: debouncedQuery.length >= 1,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <label className="text-sm text-gray-500">Ticker</label>
      <div className="flex items-center mt-1 bg-gray-100 border border-gray-300 rounded focus-within:border-emerald-500">
        <Search size={14} className="ml-2 text-gray-500" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value.toUpperCase()); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar ticker..."
          className="px-2 py-2 bg-transparent text-gray-900 w-40 focus:outline-none text-sm"
        />
        {query && (
          <button onClick={() => { setQuery(''); onChange(''); setOpen(false) }} className="mr-2 text-gray-500 hover:text-gray-900">
            <X size={14} />
          </button>
        )}
      </div>
      {open && results && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-72 bg-gray-100 border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {results.slice(0, 8).map((r) => (
            <button
              key={r.symbol}
              onClick={() => { setQuery(r.symbol); onChange(r.symbol, r.name); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-gray-200 flex items-center justify-between text-sm"
            >
              <div>
                <span className="font-medium text-gray-900">{r.symbol}</span>
                <span className="text-gray-500 ml-2 truncate">{r.name}</span>
              </div>
              <span className="text-xs text-gray-400">{r.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
