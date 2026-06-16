'use client'

import { getFlag } from '@/lib/flags'

interface TeamStats {
  teamId: string
  corners: number
  fouls: number
  shots: number
  offsides: number
  yellowCards: number
}

interface MatchStatsProps {
  teamA: string
  teamB: string
  home?: TeamStats
  away?: TeamStats
  isLoading?: boolean
}

const STAT_ROWS: { key: Exclude<keyof TeamStats, 'teamId'>; label: string; icon: string }[] = [
  { key: 'shots', label: 'Shots', icon: '🎯' },
  { key: 'corners', label: 'Corners', icon: '⛳' },
  { key: 'fouls', label: 'Fouls', icon: '📢' },
  { key: 'offsides', label: 'Offsides', icon: '🚩' },
  { key: 'yellowCards', label: 'Yellow Cards', icon: '🟨' },
]

function StatBar({ home, away, label, icon }: { home: number; away: number; label: string; icon: string }) {
  const total = home + away || 1
  const homePct = (home / total) * 100
  const awayPct = (away / total) * 100

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-bold text-gray-700 dark:text-gray-200">
        <span className="w-8 text-center">{home}</span>
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <span>{icon}</span>
          {label}
        </span>
        <span className="w-8 text-center">{away}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        <div
          className="bg-blue-500 transition-all duration-500"
          style={{ width: `${homePct}%` }}
        />
        <div
          className="bg-orange-500 transition-all duration-500"
          style={{ width: `${awayPct}%` }}
        />
      </div>
    </div>
  )
}

function StatBarSkeleton({ label, icon }: { label: string; icon: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-bold text-gray-400">
        <span className="w-8 text-center">—</span>
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <span>{icon}</span>
          {label}
        </span>
        <span className="w-8 text-center">—</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
        <div className="flex-1 bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </div>
    </div>
  )
}

export default function MatchStats({ teamA, teamB, home, away, isLoading }: MatchStatsProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/25">
        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Match Stats
        </h3>
        <span className="text-[10px] text-gray-400 font-semibold uppercase">Live</span>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{getFlag(teamA)}</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{teamA}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 dark:text-white">{teamB}</span>
            <span className="text-xl">{getFlag(teamB)}</span>
          </div>
        </div>

        <div className="space-y-3">
          {isLoading || !home || !away
            ? STAT_ROWS.map((row) => <StatBarSkeleton key={row.key} label={row.label} icon={row.icon} />)
            : STAT_ROWS.map((row) => (
                <StatBar
                  key={row.key}
                  home={home[row.key]}
                  away={away[row.key]}
                  label={row.label}
                  icon={row.icon}
                />
              ))}
        </div>
      </div>
    </div>
  )
}
