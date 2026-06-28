'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { getFlag, getRoundColor, getRoundIcon } from '@/lib/flags'

interface AuditLog {
  id: string
  category: string
  points: number
  detail: string
  createdAt: string
}

interface MatchAudit {
  matchId: number
  match: {
    id: number
    teamA: string
    teamB: string
    round: string
    stage: string
    date: string
    result: string | null
  }
  totalPoints: number
  logs: AuditLog[]
}

interface AuditData {
  matches: MatchAudit[]
  grandTotal: number
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  prediction: { label: 'Winner Pick', icon: '🏆', color: 'text-blue-600 dark:text-blue-400' },
  score: { label: 'Score Prediction', icon: '📊', color: 'text-purple-600 dark:text-purple-400' },
  corner: { label: 'Corner Prediction', icon: '📐', color: 'text-orange-600 dark:text-orange-400' },
  scorer: { label: 'Goal Scorer', icon: '⚽', color: 'text-emerald-600 dark:text-emerald-400' },
}

export default function PointsPage() {
  const { data: session, status } = useSession()
  const { addToast } = useToast()
  const [data, setData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/points/audit')
        if (!res.ok) throw new Error('Failed')
        const json = await res.json()
        setData(json)
      } catch {
        addToast('Failed to load point audit logs', 'error')
      } finally {
        setLoading(false)
      }
    }
    if (status === 'authenticated') load()
  }, [status, addToast])

  if (status === 'unauthenticated') redirect('/')
  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-wc-gold border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading point audit...</span>
        </div>
      </div>
    )
  }

  if (!data) return null

  const totalEarned = data.matches.reduce((sum, m) => sum + m.totalPoints, 0)
  const predictionPoints = data.matches.reduce((sum, m) => sum + m.logs.filter(l => l.category === 'prediction').reduce((s, l) => s + l.points, 0), 0)
  const boosterPoints = totalEarned - predictionPoints

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Point Audit Log</h1>
        <p className="text-sm text-white/60 mt-1">Detailed breakdown of your points per match</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 text-center">
          <div className="text-2xl mb-1">🏆</div>
          <div className="text-xl font-black text-wc-navy dark:text-wc-gold">{predictionPoints}</div>
          <div className="text-[10px] text-gray-500">Prediction Points</div>
          <div className="text-[9px] text-gray-400 mt-0.5">Group +1 · Knockout +2</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 text-center">
          <div className="text-2xl mb-1">🚀</div>
          <div className={`text-xl font-black ${boosterPoints >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {boosterPoints > 0 ? '+' : ''}{boosterPoints}
          </div>
          <div className="text-[10px] text-gray-500">Booster Points</div>
          <div className="text-[9px] text-gray-400 mt-0.5">Knockout only</div>
        </div>
      </div>

      {/* Grand Total */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-wc-gold/30 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>📊</span>
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total Points</span>
        </div>
        <span className="text-2xl font-black text-wc-navy dark:text-wc-gold">{data.grandTotal}</span>
      </div>

      {/* Point Rules Legend */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Point Rules</h3>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span>🏆</span>
            <span className="text-gray-600 dark:text-gray-400">Group +1 / Knockout +2</span>
          </div>
          <div className="flex items-center gap-2">
            <span>📊</span>
            <span className="text-gray-600 dark:text-gray-400">Score +3 / Wrong -1</span>
          </div>
          <div className="flex items-center gap-2">
            <span>📐</span>
            <span className="text-gray-600 dark:text-gray-400">Corner +2 / Wrong -1</span>
          </div>
          <div className="flex items-center gap-2">
            <span>⚽</span>
            <span className="text-gray-600 dark:text-gray-400">Scorer +4/goal / Wrong -2</span>
          </div>
        </div>
      </div>

      {/* Match Audit List */}
      {data.matches.length > 0 ? (
        <div className="space-y-3">
          {data.matches.map((m) => {
            const isExpanded = expandedMatch === m.matchId
            return (
              <div
                key={m.matchId}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedMatch(isExpanded ? null : m.matchId)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-lg">{getFlag(m.match.teamA)}</span>
                    <span className="text-xs font-bold text-gray-900 dark:text-white truncate">{m.match.teamA}</span>
                    <span className="text-[10px] text-gray-400">vs</span>
                    <span className="text-xs font-bold text-gray-900 dark:text-white truncate">{m.match.teamB}</span>
                    <span className="text-lg">{getFlag(m.match.teamB)}</span>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${getRoundColor(m.match.round)}`}>
                    {getRoundIcon(m.match.round)} {m.match.stage}
                  </span>
                  <span className={`text-sm font-black ${
                    m.totalPoints > 0 ? 'text-emerald-600 dark:text-emerald-400' : m.totalPoints < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'
                  }`}>
                    {m.totalPoints > 0 ? '+' : ''}{m.totalPoints}
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {m.logs.map((log) => {
                      const meta = CATEGORY_META[log.category] ?? { label: log.category, icon: '❓', color: 'text-gray-600' }
                      return (
                        <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                          <span className="text-lg mt-0.5">{meta.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={`text-xs font-bold ${meta.color}`}>{meta.label}</span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">{log.detail}</p>
                          </div>
                          <span className={`text-sm font-black shrink-0 ${
                            log.points > 0 ? 'text-emerald-600 dark:text-emerald-400' : log.points < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'
                          }`}>
                            {log.points > 0 ? '+' : ''}{log.points}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No audit logs yet</p>
          <p className="text-sm text-gray-400 mt-1">Points will appear after matches finish</p>
        </div>
      )}
    </div>
  )
}
