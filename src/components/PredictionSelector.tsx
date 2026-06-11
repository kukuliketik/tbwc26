'use client'

import { useState } from 'react'
import { getFlag } from '@/lib/flags'

interface Props {
  pick: string | null
  disabled: boolean
  onSelect: (pick: string) => void
  teamA: string
  teamB: string
}

export default function PredictionSelector({ pick, disabled, onSelect, teamA, teamB }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)

  const handleSelect = (value: string) => {
    if (disabled) return
    onSelect(value)
  }

  const options = [
    { label: teamA, value: 'Team A', flag: getFlag(teamA), color: 'from-blue-500 to-blue-600' },
    { label: 'Draw', value: 'Draw', flag: '🤝', color: 'from-gray-500 to-gray-600' },
    { label: teamB, value: 'Team B', flag: getFlag(teamB), color: 'from-wc-green to-wc-green-light' },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((option) => {
        const isSelected = pick === option.value
        const isHovered = hovered === option.value

        return (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            onMouseEnter={() => setHovered(option.value)}
            onMouseLeave={() => setHovered(null)}
            disabled={disabled}
            className={`relative flex flex-col items-center justify-center gap-1.5 px-2 py-3 rounded-xl border-2 text-xs font-bold transition-all duration-200 ${
              disabled
                ? 'opacity-50 cursor-not-allowed border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-gray-400'
                : isSelected
                  ? 'border-wc-navy dark:border-wc-gold bg-wc-navy dark:bg-wc-navy/80 text-white shadow-lg shadow-wc-navy/20 dark:shadow-wc-gold/20 scale-[1.02]'
                  : isHovered
                    ? 'border-wc-navy/50 dark:border-wc-gold/50 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 scale-[1.02]'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            {/* Selected indicator */}
            {isSelected && !disabled && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-wc-gold rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900">
                <svg className="w-3 h-3 text-wc-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <span className="text-2xl">{option.flag}</span>
            <span className="text-[10px] truncate max-w-full text-center leading-tight">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
