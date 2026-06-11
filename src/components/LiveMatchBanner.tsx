'use client'

import { useState, useEffect } from 'react'
import type { LiveMatch } from '@/lib/football-api'

export default function LiveMatchBanner() {
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    async function fetchLive() {
      try {
        const res = await fetch('/api/matches')
        if (!res.ok) throw new Error()
      } catch {
        setError(true)
      }
    }
    fetchLive()
    const interval = setInterval(fetchLive, 60000)
    return () => clearInterval(interval)
  }, [])

  const apiKey = process.env.NEXT_PUBLIC_FOOTBALL_DATA_API_KEY

  if (!apiKey) return null

  if (error) return null

  if (liveMatches.length === 0) return null

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span className="text-sm font-semibold text-red-700 dark:text-red-400">
          LIVE ({liveMatches.length})
        </span>
      </div>
      <div className="space-y-2">
        {liveMatches.map((m) => (
          <div key={m.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-4 py-2">
            <span className="text-sm font-medium">{m.homeTeam}</span>
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg">
                {m.homeScore ?? '-'} : {m.awayScore ?? '-'}
              </span>
              {m.minute && (
                <span className="text-xs text-red-500 font-medium">{m.minute}&apos;</span>
              )}
            </div>
            <span className="text-sm font-medium">{m.awayTeam}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
