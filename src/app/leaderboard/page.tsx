'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/Toast'
import Avatar from '@/components/Avatar'

interface Entry {
  userId: string
  name: string
  email: string
  image: string | null
  points: number
  correctPredictions: number
  totalPredictions: number
  totalFinished: number
  accuracy: number
}

export default function LeaderboardPage() {
  const { data: session, status } = useSession()
  const { addToast } = useToast()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/leaderboard', { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load leaderboard')
        setEntries(await res.json())
      } catch {
        addToast('Failed to load leaderboard', 'error')
      } finally {
        setLoading(false)
      }
    }
    if (status === 'authenticated') {
      load()
      const interval = setInterval(load, 30000)
      return () => clearInterval(interval)
    }
  }, [status])

  if (status === 'unauthenticated') redirect('/')
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-wc-gold border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading leaderboard...</span>
        </div>
      </div>
    )
  }

  const totalPredictions = entries.reduce((s, e) => s + e.totalPredictions, 0)
  const avgAccuracy = entries.length > 0
    ? Math.round(entries.reduce((s, e) => s + e.accuracy, 0) / entries.length)
    : 0
  const currentUserId = session?.user?.id

  // Find current user's rank
  const myRank = entries.findIndex((e) => e.userId === currentUserId) + 1
  const myEntry = entries.find((e) => e.userId === currentUserId)

  const rankBadge = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return ''
  }

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <p className="text-sm text-white/60 mt-1">Real-time rankings · Updated every 30s</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Players', value: entries.length, icon: '👥', color: 'border-l-blue-500' },
          { label: 'Picks Made', value: totalPredictions, icon: '🎯', color: 'border-l-green-500' },
          { label: 'Avg Accuracy', value: `${avgAccuracy}%`, icon: '📊', color: 'border-l-purple-500' },
          { label: 'Your Rank', value: myRank ? `#${myRank}` : '—', icon: '🏅', color: 'border-l-wc-gold' },
        ].map((s) => (
          <div key={s.label} className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 border-l-4 ${s.color} p-4`}>
            <div className="text-lg mb-1">{s.icon}</div>
            <div className="text-xl font-black text-gray-900 dark:text-white">{s.value}</div>
            <div className="text-[11px] text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Current User Card */}
      {myEntry && myRank > 3 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-wc-gold/30 p-4 flex items-center gap-4">
          <div className="text-sm font-bold text-gray-500 w-8">#{myRank}</div>
          <Avatar name={myEntry.name} image={myEntry.image} size="md" />
          <div className="flex-1">
            <div className="font-semibold text-gray-900 dark:text-white">{myEntry.name} <span className="text-xs text-wc-gold">(you)</span></div>
              <div className="text-xs text-gray-500">{myEntry.correctPredictions}/{myEntry.totalFinished} correct</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-wc-navy dark:text-wc-gold">{myEntry.points}</div>
            <div className="text-[10px] text-gray-400">pts</div>
          </div>
        </div>
      )}

      {/* Points Audit Link */}
      <Link
        href="/points"
        className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-wc-gold/50 transition-colors"
      >
        <span>📊</span>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">View Your Points Audit Log</span>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Full Leaderboard Table */}
      {entries.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Rank</th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Player</th>
                  <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Predictions</th>
                  <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Correct</th>
                  <th className="text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Points</th>
                  <th className="text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {entries.map((entry, i) => {
                  const rank = i + 1
                  const isMe = entry.userId === currentUserId
                  const isTop3 = rank <= 3
                  return (
                    <tr
                      key={entry.userId}
                      className={`transition-colors ${
                        isMe 
                          ? 'bg-wc-gold/10 border-l-4 border-l-wc-gold' 
                          : isTop3 
                            ? 'bg-wc-navy/5' 
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{rankBadge(rank)}</span>
                          <span className={`text-sm font-bold ${isTop3 ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>#{rank}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={entry.name} image={entry.image} size={isTop3 ? 'md' : 'sm'} className={isTop3 ? 'ring-2 ring-wc-gold/50' : ''} />
                          <div className="min-w-0">
                            <div className={`text-sm font-semibold truncate ${isTop3 ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                              {entry.name}
                              {isMe && <span className="ml-1.5 text-[10px] text-wc-gold font-medium">(you)</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm ${isTop3 ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                          {entry.totalPredictions}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm ${isTop3 ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                          {entry.correctPredictions}/{entry.totalFinished}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-lg ${isTop3 ? 'font-black text-wc-navy dark:text-wc-gold' : 'font-bold text-gray-700 dark:text-gray-300'}`}>
                          {entry.points}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm ${isTop3 ? 'font-semibold text-gray-900 dark:text-white' : 'font-semibold text-gray-500'}`}>
                          {entry.accuracy}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-white dark:bg-gray-900 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🏆</div>
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No players yet</p>
          <p className="text-sm text-gray-400 mt-1">Be the first to make predictions!</p>
        </div>
      )}
    </div>
  )
}
