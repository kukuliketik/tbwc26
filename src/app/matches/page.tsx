'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { getFlag, getRoundColor, getRoundIcon } from '@/lib/flags'
import { parseWC26Date } from '@/lib/worldcup26-api'
import CountdownTimer from '@/components/CountdownTimer'

interface LiveGameData {
  homeScore: number
  awayScore: number
  isLive: boolean
  isFinished: boolean
  timeElapsed: string
  finished: string
  localDate?: string
  stadiumId?: string
  stadium?: { name: string; city: string; country: string } | null
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

const ROUNDS = [
  { key: 'Group Stage', label: 'Group Stage', icon: '⚽' },
  { key: 'Round of 32', label: 'R32', icon: '🏟️' },
  { key: 'Round of 16', label: 'R16', icon: '🔥' },
  { key: 'Quarterfinal', label: 'QF', icon: '⚡' },
  { key: 'Semifinal', label: 'SF', icon: '🌟' },
  { key: 'Third Place', label: '3rd', icon: '🥉' },
  { key: 'Final', label: 'Final', icon: '🏆' },
]

const WIB = 'Asia/Jakarta'

function toWIB(date: Date): Date {
  return toZonedTime(date, WIB)
}

function parseMatchDate(dateVal: string | Date): Date {
  if (typeof dateVal === 'string') {
    const num = Number(dateVal)
    if (!isNaN(num) && num > 1e12) {
      return new Date(num)
    }
    return parseISO(dateVal)
  }
  return dateVal
}

function getMatchStatus(match: Match): { isLive: boolean; isFinished: boolean; label: string } {
  // Use live data if available
  if (match.live) {
    if (match.live.isFinished || match.live.finished === 'TRUE') {
      return { isLive: false, isFinished: true, label: 'Full Time' }
    }
    if (match.live.isLive) {
      return { 
        isLive: true, 
        isFinished: false, 
        label: match.live.timeElapsed && match.live.timeElapsed !== 'notstarted' ? match.live.timeElapsed : 'LIVE' 
      }
    }
    // Has live data but not started yet
    if (match.live.timeElapsed === 'notstarted') {
      return { isLive: false, isFinished: false, label: '' }
    }
  }
  
  // Fallback to our DB result
  if (match.result) return { isLive: false, isFinished: true, label: 'Full Time' }
  
  return { isLive: false, isFinished: false, label: '' }
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [activeRound, setActiveRound] = useState('Group Stage')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/matches?live=true')
        setMatches(await res.json())
      } catch { /* silent */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  // Auto-refresh for live matches
  useEffect(() => {
    const hasLiveMatches = matches.some(m => {
      const status = getMatchStatus(m)
      return status.isLive
    })
    
    if (!hasLiveMatches) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/matches?live=true')
        if (res.ok) {
          setMatches(await res.json())
        }
      } catch {
        // Silent fail for auto-refresh
      }
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [matches])

  const filtered = matches.filter((m) => m.round === activeRound)

  const groupedByDate = filtered.reduce<Record<string, Match[]>>((acc, m) => {
    const d = m.live?.localDate
      ? parseWC26Date(m.live.localDate, m.live.stadiumId)
      : parseMatchDate(m.date)
    const key = format(toWIB(d), 'yyyy-MM-dd')
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  const now = new Date()
  const nowWIB = toZonedTime(now, WIB)

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Schedule & Results</h1>
        <p className="text-sm text-white/60 mt-1">All 104 matches · Times in WIB (UTC+7)</p>
      </div>

      {/* Round filter */}
      <div className="flex gap-1.5 flex-wrap">
        {ROUNDS.map((r) => (
          <button
            key={r.key}
            onClick={() => setActiveRound(r.key)}
            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeRound === r.key
                ? 'bg-wc-navy text-white shadow-md'
                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-wc-navy/30'
            }`}
          >
            {r.icon} {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-48 mb-3 animate-pulse" />
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-24 bg-white dark:bg-gray-900 rounded-2xl mb-2 animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      ) : Object.keys(groupedByDate).length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-gray-500">No matches for {activeRound}</p>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedByDate).map(([dateKey, dateMatches]) => {
            const dateObj = parseISO(dateKey)
            return (
              <div key={dateKey}>
                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                    {format(dateObj, 'EEEE, MMMM d')}
                  </h3>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                  <span className="text-xs text-gray-400">{dateMatches.length} matches</span>
                </div>
                <div className="space-y-3">
                  {dateMatches.map((match) => {
                    // Prefer worldcup26.ir localDate + stadium timezone → WIB, fallback to DB date
                    const matchDate = match.live?.localDate
                      ? parseWC26Date(match.live.localDate, match.live.stadiumId)
                      : parseMatchDate(match.date)
                    const matchWIB = toZonedTime(matchDate, WIB)
                    const winner = match.result === 'Team A' ? match.teamA : match.result === 'Team B' ? match.teamB : null
                    const winnerFlag = match.result === 'Team A' ? getFlag(match.teamA) : match.result === 'Team B' ? getFlag(match.teamB) : null

                    const status = getMatchStatus(match)
                    const isLive = status.isLive
                    const isFinished = status.isFinished
                    const live = match.live
                    const homeScore = live?.homeScore ?? 0
                    const awayScore = live?.awayScore ?? 0
                    const isScheduled = !isLive && !isFinished && matchDate > now

                    return (
                      <Link
                        key={match.id}
                        href={`/matches/${match.id}`}
                        className={`block bg-white dark:bg-gray-900 rounded-2xl border overflow-hidden transition-all ${
                          isLive
                            ? 'border-red-400 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10 shadow-md shadow-red-100/50 dark:shadow-red-900/10'
                            : isFinished
                              ? 'border-gray-200 dark:border-gray-800'
                              : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md'
                        }`}
                      >
                        {/* Date header */}
                        <div className="bg-gradient-to-r from-wc-navy to-wc-navy-mid px-4 py-2 flex items-center justify-between">
                          <span className="text-xs font-bold text-white/80">
                            {format(matchWIB, 'EEE, MMM d')} · {format(matchWIB, 'HH:mm')} WIB
                          </span>
                          <div className="flex items-center gap-2">
                            {isScheduled && (
                              <CountdownTimer targetDate={matchDate} />
                            )}
                            {match.group && (
                              <span className="text-[10px] font-bold text-wc-gold bg-white/10 px-2 py-0.5 rounded-full">
                                Group {match.group}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Match body - stacked flag layout */}
                        <div className="p-4 sm:p-5">
                          <div className="flex items-stretch justify-between gap-4">
                            {/* Team A */}
                            <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0">
                              <span className="text-4xl sm:text-5xl mb-2">{getFlag(match.teamA)}</span>
                              <span className={`text-sm sm:text-base font-bold leading-tight ${
                                match.result === 'Team A'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-900 dark:text-white'
                              }`}>
                                {match.teamA}
                              </span>
                              {match.result === 'Team A' && (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">WINNER</span>
                              )}
                            </div>

                            {/* Center - Score/Status */}
                            <div className="flex-shrink-0 flex flex-col items-center justify-center gap-1.5 min-w-[80px]">
                              {isFinished ? (
                                <div className={`text-center px-3 py-2 rounded-xl ${
                                  match.result === 'Draw'
                                    ? 'bg-gray-100 dark:bg-gray-800'
                                    : 'bg-wc-gold/15 dark:bg-wc-gold/10'
                                }`}>
                                  {match.result === 'Draw' ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl font-black text-gray-500">{homeScore}</span>
                                      <span className="text-gray-400">-</span>
                                      <span className="text-2xl font-black text-gray-500">{awayScore}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="text-2xl font-black text-gray-900 dark:text-white">{homeScore}</span>
                                      <span className="text-gray-400">-</span>
                                      <span className="text-2xl font-black text-gray-900 dark:text-white">{awayScore}</span>
                                    </div>
                                  )}
                                </div>
                              ) : isLive ? (
                                <div className="flex flex-col items-center">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-2xl font-black text-gray-900 dark:text-white">{homeScore}</span>
                                    <span className="text-gray-400">-</span>
                                    <span className="text-2xl font-black text-gray-900 dark:text-white">{awayScore}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 bg-red-500 rounded-full live-pulse" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                                      Live {live?.timeElapsed && live.timeElapsed !== 'notstarted' ? `· ${live.timeElapsed}` : ''}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                  <span className="text-xs font-black text-gray-300 dark:text-gray-600">VS</span>
                                </div>
                              )}
                              {/* Round badge + Stadium */}
                              <div className="flex flex-col items-center gap-1 mt-2">
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${getRoundColor(match.round)}`}>
                                  {getRoundIcon(match.round)} {match.stage}
                                </span>
                                {live?.stadium && (
                                  <span className="text-[9px] text-gray-400 dark:text-gray-500 text-center leading-tight">
                                    {live.stadium.name}<br/>{live.stadium.city}, {live.stadium.country}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Team B */}
                            <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0">
                              <span className="text-4xl sm:text-5xl mb-2">{getFlag(match.teamB)}</span>
                              <span className={`text-sm sm:text-base font-bold leading-tight ${
                                match.result === 'Team B'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-900 dark:text-white'
                              }`}>
                                {match.teamB}
                              </span>
                              {match.result === 'Team B' && (
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">WINNER</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
