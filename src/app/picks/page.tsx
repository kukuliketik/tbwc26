'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import MatchCard from '@/components/MatchCard'
import { useToast } from '@/components/Toast'
import { getRoundColor } from '@/lib/flags'
import { parseWC26Date } from '@/lib/worldcup26-api'

interface LiveGameData {
  homeScore: number
  awayScore: number
  isLive: boolean
  isFinished: boolean
  timeElapsed: string
  finished: string
  localDate?: string
  stadiumId?: string
}

interface Match {
  id: number
  date: string
  round: string
  group: string | null
  stage: string
  teamA: string
  teamB: string
  result: string | null
  live?: LiveGameData | null
}

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
const KNOCKOUT_ROUNDS = [
  { key: 'Round of 32', label: 'Round of 32', icon: '🏟️' },
  { key: 'Round of 16', label: 'Round of 16', icon: '🔥' },
  { key: 'Quarterfinal', label: 'Quarterfinals', icon: '⚡' },
  { key: 'Semifinal', label: 'Semifinals', icon: '🌟' },
  { key: 'Third Place', label: 'Third Place', icon: '🥉' },
  { key: 'Final', label: 'Final', icon: '🏆' },
]

export default function PicksPage() {
  const { data: session, status } = useSession()
  const { addToast } = useToast()
  const [matches, setMatches] = useState<Match[]>([])
  const [predictions, setPredictions] = useState<Record<number, string>>({})
  const [activeTab, setActiveTab] = useState<'groups' | 'knockout'>('groups')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [activeRound, setActiveRound] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const [matchRes, predRes] = await Promise.all([
          fetch('/api/matches'),
          fetch('/api/predictions'),
        ])
        setMatches(await matchRes.json())
        const predData = await predRes.json()
        const predMap: Record<number, string> = {}
        for (const p of predData) predMap[p.matchId] = p.pick
        setPredictions(predMap)
      } catch {
        addToast('Failed to load data', 'error')
      } finally {
        setLoading(false)
      }
    }
    if (status === 'authenticated') load()
  }, [status])

  const handlePick = useCallback(async (matchId: number, pick: string) => {
    const match = matches.find((m) => m.id === matchId)
    if (match) {
      const matchDate = match.live?.localDate
        ? parseWC26Date(match.live.localDate, match.live.stadiumId)
        : new Date(match.date)
      const ONE_HOUR_MS = 60 * 60 * 1000
      if (matchDate.getTime() - ONE_HOUR_MS < Date.now()) {
        addToast('Match is locked — predictions closed 1h before kickoff', 'error')
        return
      }
    }

    setPredictions((prev) => ({ ...prev, [matchId]: pick }))
    setSavingIds((prev) => new Set(prev).add(matchId))

    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, pick }),
      })
      if (!res.ok) throw new Error()
      addToast('Prediction saved!', 'success')
    } catch {
      setPredictions((prev) => {
        const next = { ...prev }
        delete next[matchId]
        return next
      })
      addToast('Failed to save prediction', 'error')
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev)
        next.delete(matchId)
        return next
      })
    }
  }, [addToast, matches])

  if (status === 'unauthenticated') redirect('/')
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-wc-navy border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    )
  }

  const filtered = matches
    .filter((m) => {
      if (activeTab === 'groups') {
        const inGroupStage = m.round === 'Group Stage'
        if (!activeGroup) return inGroupStage
        return inGroupStage && m.group === activeGroup
      } else {
        const isKnockout = m.round !== 'Group Stage'
        if (!activeRound) return isKnockout
        return isKnockout && m.round === activeRound
      }
    })
    .sort((a, b) => a.id - b.id)

  const groupStageCount = matches.filter((m) => m.round === 'Group Stage').length
  const knockoutCount = matches.filter((m) => m.round !== 'Group Stage').length
  const predictedCount = Object.keys(predictions).length
  const progressPct = matches.length > 0 ? Math.round((predictedCount / matches.length) * 100) : 0

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Your Predictions</h1>
          <p className="text-sm text-gray-500 mt-1">Pick the winner for every match</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 sm:flex-none bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden min-w-[120px]">
            <div
              className="h-full bg-gradient-to-r from-wc-green to-wc-green-light rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">
            {predictedCount}/{matches.length}
          </span>
        </div>
      </div>

      {/* Round Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
        <button
          onClick={() => { setActiveTab('groups'); setActiveGroup(null) }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'groups'
              ? 'bg-white dark:bg-gray-700 text-wc-navy dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          ⚽ Group Stage
          <span className="text-[10px] opacity-60">({groupStageCount})</span>
        </button>
        <button
          onClick={() => { setActiveTab('knockout'); setActiveRound(null) }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'knockout'
              ? 'bg-white dark:bg-gray-700 text-wc-navy dark:text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          🏆 Knockout
          <span className="text-[10px] opacity-60">({knockoutCount})</span>
        </button>
      </div>

      {/* Group Selector */}
      {activeTab === 'groups' && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveGroup(null)}
            className={`px-3 h-10 rounded-xl text-sm font-bold transition-all ${
              activeGroup === null
                ? 'bg-wc-navy text-white shadow-md scale-105'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-wc-navy/30 hover:text-wc-navy'
            }`}
          >
            All
          </button>
          {GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                activeGroup === g
                  ? 'bg-wc-navy text-white shadow-md scale-105'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-wc-navy/30 hover:text-wc-navy'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Knockout tabs */}
      {activeTab === 'knockout' && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveRound(null)}
            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeRound === null
                ? 'bg-wc-navy text-white shadow-md'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-wc-navy/30'
            }`}
          >
            🏆 All
          </button>
          {KNOCKOUT_ROUNDS.map((r) => (
            <button
              key={r.key}
              onClick={() => setActiveRound(r.key)}
              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeRound === r.key
                  ? 'bg-wc-navy text-white shadow-md'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-wc-navy/30'
              }`}
            >
              {r.icon} {r.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 animate-pulse">
              <div className="flex gap-2 mb-3">
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-16" />
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-12" />
              </div>
              <div className="flex items-center gap-4 mb-3">
                <div className="h-6 bg-gray-100 dark:bg-gray-800 rounded flex-1" />
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-8" />
                <div className="h-6 bg-gray-100 dark:bg-gray-800 rounded flex-1" />
              </div>
              <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">⚽</div>
          <p className="text-gray-500 dark:text-gray-400">No matches found for this filter</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              userPick={predictions[match.id] ?? null}
              saving={savingIds.has(match.id)}
              onPick={handlePick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
