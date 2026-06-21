'use client'

import { useState, useRef, useEffect, useMemo } from 'react'

interface Player {
  id: string
  name: string
  shirtNumber: number
}

interface Group {
  label: string
  items: Player[]
}

interface SearchableSelectProps {
  groups: Group[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  disabled?: boolean
}

export default function SearchableSelect({ groups, value, onChange, placeholder = 'Select a player...', disabled }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return groups
    const q = query.toLowerCase()
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            String(p.shirtNumber).includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [groups, query])

  const totalResults = filtered.reduce((sum, g) => sum + g.items.length, 0)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const selectedLabel = useMemo(() => {
    if (!value) return null
    for (const g of groups) {
      const found = g.items.find((p) => p.name === value)
      if (found) return `${found.shirtNumber}. ${found.name}`
    }
    return value
  }, [value, groups])

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(!open) }}
        className={`w-full min-w-0 text-left text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
          open
            ? 'border-wc-gold ring-2 ring-wc-gold/50'
            : 'border-gray-200 dark:border-gray-700'
        } bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50`}
      >
        {selectedLabel ? (
          <span>{selectedLabel}</span>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <svg className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by name or number..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-wc-gold/50"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {totalResults === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No players found
              </div>
            ) : (
              filtered.map((group) => (
                <div key={group.label}>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                    {group.label}
                  </div>
                  {group.items.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => {
                        onChange(player.name)
                        setOpen(false)
                        setQuery('')
                      }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-wc-gold/10 transition-colors ${
                        value === player.name ? 'bg-wc-gold/10 text-wc-gold font-semibold' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <span className="w-7 text-center text-xs font-bold text-gray-400 dark:text-gray-500">{player.shirtNumber}</span>
                      <span className="flex-1 truncate">{player.name}</span>
                      {value === player.name && (
                        <svg className="w-4 h-4 text-wc-gold flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {value && (
            <div className="p-2 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); setQuery('') }}
                className="w-full py-1.5 text-xs font-medium text-gray-500 hover:text-red-500 transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
