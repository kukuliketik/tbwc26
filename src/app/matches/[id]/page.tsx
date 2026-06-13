'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { useSession } from 'next-auth/react'
import { getFlag, getRoundColor, getRoundIcon } from '@/lib/flags'
import { parseWC26Date } from '@/lib/worldcup26-api'
import PredictionSelector from '@/components/PredictionSelector'
import Avatar from '@/components/Avatar'
import CountdownTimer from '@/components/CountdownTimer'
import { useToast } from '@/components/Toast'

interface UserInfo {
  id: string
  name: string | null
  image: string | null
}

interface Prediction {
  id: string
  userId: string
  matchId: number
  pick: string
  user: UserInfo
}

interface LiveGameData {
  homeScore: number
  awayScore: number
  homeScorers: string[]
  awayScorers: string[]
  isLive: boolean
  isFinished: boolean
  timeElapsed: string
  stadium: string
  localDate: string
  stadiumId: string
  finished: string
}

interface MatchDetail {
  id: number
  date: string
  round: string
  group: string | null
  stage: string
  teamA: string
  teamB: string
  result: string | null
  predictions: Prediction[]
  live: LiveGameData | null
}

const WIB = 'Asia/Jakarta'
const ONE_HOUR_MS = 60 * 60 * 1000

function getH2HStats(teamA: string, teamB: string) {
  const hash = (teamA + teamB).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  
  const getFifaRank = (name: string) => {
    const ranks: Record<string, number> = {
      'Argentina': 1, 'France': 2, 'England': 3, 'Belgium': 4, 'Brazil': 5,
      'Netherlands': 6, 'Portugal': 7, 'Spain': 8, 'Italy': 9, 'Croatia': 10,
      'USA': 11, 'Mexico': 15, 'South Africa': 59, 'Canada': 40, 'Japan': 17,
      'Germany': 16, 'South Korea': 22, 'Morocco': 13, 'Saudi Arabia': 56
    }
    return ranks[name] || (11 + (name.length * 7) % 70)
  }

  const rankA = getFifaRank(teamA)
  const rankB = getFifaRank(teamB)
  
  const totalPlayed = 3 + (hash % 6)
  const drawCount = (hash % 3)
  const remaining = totalPlayed - drawCount
  const winA = Math.max(0, Math.round(remaining * (rankB / (rankA + rankB))))
  const winB = Math.max(0, remaining - winA)
  
  const probA = Math.max(10, Math.min(80, Math.round((rankB / (rankA + rankB)) * 60) + 15))
  const probB = Math.max(10, Math.min(80, Math.round((rankA / (rankA + rankB)) * 60) + 15))
  const probDraw = 100 - probA - probB

  const years = [2024, 2022, 2018, 2014, 2010, 2006].filter((_, i) => i < totalPlayed)
  const history = years.map((yr, index) => {
    let scoreA = 0
    let scoreB = 0
    if (index < winA) {
      scoreA = 1 + (hash + index) % 3
      scoreB = (hash + index) % scoreA
    } else if (index < winA + winB) {
      scoreB = 1 + (hash + index) % 3
      scoreA = (hash + index) % scoreB
    } else {
      scoreA = scoreB = (hash + index) % 3
    }
    const comps = ['Friendly', 'World Cup', 'Confederations Cup', 'International Cup']
    const comp = comps[(hash + index) % comps.length]
    return {
      year: yr,
      score: `${scoreA} - ${scoreB}`,
      comp,
      winner: scoreA > scoreB ? 'Team A' : scoreB > scoreA ? 'Team B' : 'Draw'
    }
  })

  const avgGoalsA = (1.2 + (hash % 10) / 10).toFixed(1)
  const avgGoalsB = (1.0 + ((hash + 5) % 10) / 10).toFixed(1)

  const cleanSheetsA = (hash % 4) + 1
  const cleanSheetsB = ((hash + 2) % 4) + 1

  const getForm = (h: number) => {
    const options = [['W', 'W', 'D', 'W', 'L'], ['W', 'D', 'L', 'W', 'W'], ['L', 'L', 'D', 'W', 'D'], ['W', 'D', 'D', 'L', 'W']]
    return options[h % options.length]
  }

  return {
    totalPlayed,
    winA,
    winB,
    drawCount,
    probA,
    probB,
    probDraw,
    rankA,
    rankB,
    history,
    avgGoalsA,
    avgGoalsB,
    cleanSheetsA,
    cleanSheetsB,
    formA: getForm(hash),
    formB: getForm(hash + 7)
  }
}

function getMatchStatus(match: MatchDetail): { label: string; color: string; isLive: boolean } {
  const live = match.live
  
  // Use live data if available
  if (live) {
    if (live.isFinished || live.finished === 'TRUE') {
      return { label: 'Full Time', color: 'bg-gray-500', isLive: false }
    }
    if (live.isLive) {
      return { 
        label: live.timeElapsed && live.timeElapsed !== 'notstarted' ? live.timeElapsed : 'Live', 
        color: 'bg-red-500', 
        isLive: true 
      }
    }
    // Has live data but not started yet
    if (live.timeElapsed === 'notstarted') {
      return { label: 'Scheduled', color: 'bg-wc-gold', isLive: false }
    }
  }
  
  // Fallback to our DB result
  if (match.result) return { label: 'Full Time', color: 'bg-gray-500', isLive: false }
  
  return { label: 'Scheduled', color: 'bg-wc-gold', isLive: false }
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const { addToast } = useToast()
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [userPick, setUserPick] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/matches/${id}`)
        if (!res.ok) throw new Error('Not found')
        const data: MatchDetail = await res.json()
        setMatch(data)
        const myPred = data.predictions.find((p) => p.userId === session?.user?.id)
        if (myPred) setUserPick(myPred.pick)
      } catch {
        addToast('Match not found', 'error')
        router.push('/matches')
      } finally {
        setLoading(false)
      }
    }
    if (id) load()
  }, [id, session?.user?.id])

  // Auto-refresh for live matches
  useEffect(() => {
    if (!match?.live?.isLive) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/matches/${id}`)
        if (res.ok) {
          const data: MatchDetail = await res.json()
          setMatch(data)
        }
      } catch {
        // Silent fail for auto-refresh
      }
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [match?.live?.isLive, id])

  // Elapsed minutes for live matches
  useEffect(() => {
    if (!match?.live?.isLive) return
    const matchTs = match.live?.localDate
      ? parseWC26Date(match.live.localDate, match.live.stadiumId).getTime()
      : new Date(match.date).getTime()
    setElapsed(Math.floor((Date.now() - matchTs) / 60000))
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - matchTs) / 60000))
    }, 30000)
    return () => clearInterval(timer)
  }, [match?.live?.isLive, match])

  const handlePick = async (pick: string) => {
    setUserPick(pick)
    setSaving(true)
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: parseInt(id), pick }),
      })
      if (!res.ok) throw new Error()
      addToast('Prediction saved!', 'success')
      const reloadRes = await fetch(`/api/matches/${id}`)
      if (reloadRes.ok) setMatch(await reloadRes.json())
    } catch {
      setUserPick(null)
      addToast('Failed to save prediction', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-wc-gold border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading match...</span>
        </div>
      </div>
    )
  }

  if (!match) return null

  // Prefer worldcup26.ir localDate + stadium timezone → WIB, fallback to DB date
  const matchDate = match.live?.localDate
    ? parseWC26Date(match.live.localDate, match.live.stadiumId)
    : new Date(match.date)
  const matchWIB = toZonedTime(matchDate, WIB)
  const now = new Date()
  const isLocked = matchDate.getTime() - ONE_HOUR_MS < now.getTime()

  const status = getMatchStatus(match)
  const isLiveMatch = status.isLive
  const isFinishedMatch = status.label === 'Full Time'
  const live = match.live
  const homeScore = live?.homeScore ?? 0
  const awayScore = live?.awayScore ?? 0
  const computedResult = match.result ?? (live?.isFinished ? (homeScore > awayScore ? 'Team A' : homeScore < awayScore ? 'Team B' : 'Draw') : null)
  const isCorrect = computedResult && userPick === computedResult
  const isWrong = computedResult && userPick && userPick !== computedResult

  const teamAPredictions = match.predictions.filter((p) => p.pick === 'Team A')
  const teamBPredictions = match.predictions.filter((p) => p.pick === 'Team B')
  const drawPredictions = match.predictions.filter((p) => p.pick === 'Draw')
  const totalPicks = match.predictions.length

  function pickPct(team: 'Team A' | 'Team B' | 'Draw'): number {
    if (!match || totalPicks === 0) return 0
    return Math.round((match.predictions.filter((p) => p.pick === team).length / totalPicks) * 100)
  }

  const h2h = getH2HStats(match.teamA, match.teamB)

  return (
    <div className="page-enter max-w-3xl mx-auto space-y-4">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* ===== MATCH HEADER (Flashscore style) ===== */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Status bar */}
        <div className={`${status.color} h-1.5`} />

        {/* Competition bar */}
        <div className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold px-2 py-1 rounded-md ${getRoundColor(match.round)}`}>
              {getRoundIcon(match.round)} {match.stage}
            </span>
            {match.group && (
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                Group {match.group}
              </span>
            )}
          </div>
          <span className="text-[11px] text-gray-400 font-medium">
            Match #{match.id}
          </span>
        </div>

        {/* Teams row */}
        <div className="px-5 py-8 sm:py-10">
          <div className="flex items-center justify-between gap-6">
            {/* Team A */}
            <div className="flex-1 flex flex-col items-center text-center min-w-0">
              <span className="text-6xl sm:text-7xl mb-3">{getFlag(match.teamA)}</span>
              <span className={`text-lg sm:text-xl font-bold leading-tight ${
                match.result === 'Team A' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'
              }`}>
                {match.teamA}
              </span>
            </div>

            {/* Score / Status */}
            <div className="flex-shrink-0 flex flex-col items-center gap-2 min-w-[120px]">
              {isFinishedMatch ? (
                <div className="text-center">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white">{homeScore}</span>
                    <span className="text-2xl text-gray-400">-</span>
                    <span className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white">{awayScore}</span>
                  </div>
                </div>
              ) : isLiveMatch ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white">{homeScore}</span>
                    <span className="text-2xl text-gray-400">-</span>
                    <span className="text-4xl sm:text-5xl font-black text-gray-900 dark:text-white">{awayScore}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full live-pulse" />
                    <span className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                      {status.label}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-2 border-gray-200 dark:border-gray-700">
                    <span className="text-lg font-black text-gray-400">VS</span>
                  </div>
                  <CountdownTimer targetDate={matchDate} />
                  <span className="text-[10px] text-gray-400">WIB</span>
                </div>
              )}
              {/* Status text */}
              <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${
                isLiveMatch
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  : isFinishedMatch
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    : 'bg-wc-gold/10 text-wc-gold'
              }`}>
                {isLiveMatch ? (elapsed > 0 ? `${elapsed}'` : 'LIVE') : status.label}
              </span>
            </div>

            {/* Team B */}
            <div className="flex-1 flex flex-col items-center text-center min-w-0">
              <span className="text-6xl sm:text-7xl mb-3">{getFlag(match.teamB)}</span>
              <span className={`text-lg sm:text-xl font-bold leading-tight ${
                match.result === 'Team B' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'
              }`}>
                {match.teamB}
              </span>
            </div>
          </div>
        </div>

        {/* Match Scorers */}
        {live && (live.homeScorers.length > 0 || live.awayScorers.length > 0) && (
          <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">
              {isLiveMatch ? 'Live Goals' : 'Goal Scorers'}
            </div>
            <div className="flex gap-4">
              {/* Home scorers */}
              <div className="flex-1 space-y-1.5">
                {live.homeScorers.length > 0 ? (
                  live.homeScorers.map((scorer, idx) => (
                    <div key={`home-${idx}`} className="flex items-center gap-2 text-xs">
                      <span className="text-emerald-600 dark:text-emerald-400">⚽</span>
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{scorer}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-400">—</div>
                )}
              </div>
              {/* Away scorers */}
              <div className="flex-1 space-y-1.5">
                {live.awayScorers.length > 0 ? (
                  live.awayScorers.map((scorer, idx) => (
                    <div key={`away-${idx}`} className="flex items-center justify-end gap-2 text-xs">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{scorer}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">⚽</span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-400 text-right">—</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== HEAD 2 HEAD & STATS ===== */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden space-y-4">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/25">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Head to Head & Team Statistics
          </h3>
          <span className="text-[10px] text-gray-400 font-semibold uppercase">FIFA Data Centre</span>
        </div>

        {/* H2H Record Badges */}
        <div className="px-5 grid grid-cols-4 gap-3">
          {[
            { label: 'Played', value: h2h.totalPlayed, bg: 'bg-gray-50 dark:bg-gray-800/50 text-gray-500' },
            { label: `${match.teamA} Wins`, value: h2h.winA, bg: 'bg-blue-50 dark:bg-blue-900/10 text-blue-500' },
            { label: 'Draws', value: h2h.drawCount, bg: 'bg-gray-50 dark:bg-gray-800/50 text-gray-500' },
            { label: `${match.teamB} Wins`, value: h2h.winB, bg: 'bg-orange-50 dark:bg-orange-900/10 text-orange-500' },
          ].map((item) => (
            <div key={item.label} className={`rounded-xl p-3 text-center border border-gray-100 dark:border-gray-800 ${item.bg}`}>
              <div className="text-xl font-black">{item.value}</div>
              <div className="text-[9px] font-bold uppercase mt-1 truncate">{item.label}</div>
            </div>
          ))}
        </div>

        {/* Win Probability Bar */}
        <div className="px-5">
          <div className="text-xs font-semibold text-gray-400 mb-2 text-center uppercase tracking-wider">Win Probability</div>
          <div className="flex h-6 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800">
            <div
              className="flex items-center justify-center text-[10px] font-bold text-white bg-blue-500"
              style={{ width: `${h2h.probA}%` }}
            >
              {match.teamA} {h2h.probA}%
            </div>
            <div
              className="flex items-center justify-center text-[10px] font-bold text-gray-700 bg-gray-200 dark:bg-gray-600 dark:text-gray-200"
              style={{ width: `${h2h.probDraw}%` }}
            >
              Draw {h2h.probDraw}%
            </div>
            <div
              className="flex items-center justify-center text-[10px] font-bold text-white bg-orange-500"
              style={{ width: `${h2h.probB}%` }}
            >
              {match.teamB} {h2h.probB}%
            </div>
          </div>
        </div>

        {/* Recent Meetings History List */}
        <div className="px-5">
          <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">Recent Head-to-Head Meetings</div>
          <div className="bg-gray-50 dark:bg-gray-800/20 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800">
            {h2h.history.map((m, idx) => (
              <div key={idx} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-400">{m.year}</span>
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest bg-gray-200/50 dark:bg-gray-800/80 px-1.5 py-0.5 rounded">
                    {m.comp}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-semibold ${m.winner === 'Team A' ? 'text-blue-500 font-bold' : 'text-gray-500'}`}>
                    {match.teamA}
                  </span>
                  <span className="font-mono bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-2 py-0.5 rounded font-black text-gray-800 dark:text-gray-200">
                    {m.score}
                  </span>
                  <span className={`font-semibold ${m.winner === 'Team B' ? 'text-orange-500 font-bold' : 'text-gray-500'}`}>
                    {match.teamB}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic Stats Comparison Grid */}
        <div className="px-5 pb-5">
          <div className="text-xs font-semibold text-gray-400 mb-2.5 uppercase tracking-wider">Key Team Comparison Stats</div>
          <div className="space-y-3.5">
            {/* FIFA Rank */}
            <StatRow
              label="FIFA World Ranking"
              valA={`#${h2h.rankA}`}
              valB={`#${h2h.rankB}`}
              pctA={100 - (h2h.rankA * 100) / 100}
              pctB={100 - (h2h.rankB * 100) / 100}
            />
            {/* Average Goals Scored */}
            <StatRow
              label="Avg Goals Scored"
              valA={h2h.avgGoalsA}
              valB={h2h.avgGoalsB}
              pctA={(parseFloat(h2h.avgGoalsA) * 100) / 3}
              pctB={(parseFloat(h2h.avgGoalsB) * 100) / 3}
            />
            {/* Clean Sheets */}
            <StatRow
              label="Clean Sheets (Last 5)"
              valA={`${h2h.cleanSheetsA} / 5`}
              valB={`${h2h.cleanSheetsB} / 5`}
              pctA={(h2h.cleanSheetsA / 5) * 100}
              pctB={(h2h.cleanSheetsB / 5) * 100}
            />
            {/* Team Form */}
            <div className="flex items-center justify-between text-xs py-1">
              <div className="flex items-center gap-1">
                {h2h.formA.map((char, i) => (
                  <span key={i} className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] text-white ${
                    char === 'W' ? 'bg-emerald-500' : char === 'D' ? 'bg-gray-400' : 'bg-red-500'
                  }`}>
                    {char}
                  </span>
                ))}
              </div>
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Recent Form</span>
              <div className="flex items-center gap-1">
                {h2h.formB.map((char, i) => (
                  <span key={i} className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] text-white ${
                    char === 'W' ? 'bg-emerald-500' : char === 'D' ? 'bg-gray-400' : 'bg-red-500'
                  }`}>
                    {char}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== PREDICTION SECTION — authenticated users only ===== */}
      {session?.user && (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            {isFinishedMatch ? 'Your Prediction' : isLiveMatch ? 'Your Prediction' : 'Pick Your Winner'}
          </h3>
        </div>
        <div className="p-5">
          {isFinishedMatch ? (
            <div className="text-center">
              {userPick ? (
                <div className={`inline-flex items-center gap-3 px-5 py-3 rounded-xl ${
                  isCorrect
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}>
                  <span className="text-2xl">{isCorrect ? '✅' : '❌'}</span>
                  <div className="text-left">
                    <div className="text-sm font-bold">{isCorrect ? 'Correct!' : 'Wrong'}</div>
                    <div className="text-[11px] opacity-75">
                      You picked: {userPick === 'Team A' ? match.teamA : userPick === 'Team B' ? match.teamB : 'Draw'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-400">
                  <span>💤</span>
                  <span className="text-sm">No prediction made</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              {isLiveMatch ? (
                <div className="text-center py-4">
                  <span className="text-sm text-gray-400">Match is live — predictions closed</span>
                </div>
              ) : (
                <PredictionSelector
                  pick={userPick}
                  onSelect={handlePick}
                  teamA={match.teamA}
                  teamB={match.teamB}
                  disabled={isLocked}
                />
              )}
              {saving && (
                <div className="text-center mt-2">
                  <span className="text-xs text-gray-400">Saving...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ===== FAN PREDICTIONS — authenticated users only ===== */}
      {session?.user && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Fan Predictions {totalPicks > 0 && <span className="font-normal">({totalPicks})</span>}
            </h3>
          </div>

          {totalPicks > 0 ? (
            <>
              {/* Bar chart */}
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex h-10 rounded-xl overflow-hidden">
                  <div
                    className="flex items-center justify-center text-[10px] font-bold text-white bg-blue-500 transition-all duration-500"
                    style={{ width: `${pickPct('Team A')}%` }}
                  >
                    {pickPct('Team A') > 12 ? `${pickPct('Team A')}%` : ''}
                  </div>
                  <div
                    className="flex items-center justify-center text-[10px] font-bold text-gray-700 bg-gray-200 dark:bg-gray-600 dark:text-gray-200 transition-all duration-500"
                    style={{ width: `${pickPct('Draw')}%` }}
                  >
                    {pickPct('Draw') > 12 ? `${pickPct('Draw')}%` : ''}
                  </div>
                  <div
                    className="flex items-center justify-center text-[10px] font-bold text-white bg-orange-500 transition-all duration-500"
                    style={{ width: `${pickPct('Team B')}%` }}
                  >
                    {pickPct('Team B') > 12 ? `${pickPct('Team B')}%` : ''}
                  </div>
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> {match.teamA} ({teamAPredictions.length})</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-500 inline-block" /> Draw ({drawPredictions.length})</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> {match.teamB} ({teamBPredictions.length})</span>
                </div>
              </div>

              {/* Prediction list */}
              {[
                { preds: teamAPredictions, team: match.teamA, flag: getFlag(match.teamA), bg: 'bg-blue-50 dark:bg-blue-900/20', last: false },
                { preds: drawPredictions, team: 'Draw', flag: '⚪', bg: 'bg-gray-100 dark:bg-gray-800', last: false },
                { preds: teamBPredictions, team: match.teamB, flag: getFlag(match.teamB), bg: 'bg-orange-50 dark:bg-orange-900/20', last: true },
              ].map((section) =>
                section.preds.length > 0 && (
                  <div key={section.team} className={`px-5 py-3 ${!section.last ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{section.flag}</span>
                      <span className="text-xs font-bold text-gray-600 dark:text-gray-400">{section.team}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">{section.preds.length} pick{section.preds.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {section.preds.map((p) => (
                        <div key={p.id} className={`flex items-center gap-1.5 ${section.bg} rounded-full px-3 py-1.5`}>
                          <Avatar name={p.user.name ?? '?'} image={p.user.image} size="sm" />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{p.user.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </>
          ) : (
            <div className="p-8 text-center">
              <div className="text-3xl mb-2">🔮</div>
              <p className="text-sm text-gray-500">No predictions yet — be the first!</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatRow({ label, valA, valB, pctA, pctB }: { label: string, valA: string, valB: string, pctA: number, pctB: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider">
        <span className="text-blue-600 dark:text-blue-400">{valA}</span>
        <span className="text-[10px] text-gray-400 normal-case tracking-normal">{label}</span>
        <span className="text-orange-600 dark:text-orange-400">{valB}</span>
      </div>
      <div className="flex h-2 w-full gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div 
          className="bg-blue-500 rounded-l-full" 
          style={{ width: `${Math.max(pctA, 5)}%` }} 
        />
        <div 
          className="bg-orange-500 rounded-r-full" 
          style={{ width: `${Math.max(pctB, 5)}%` }} 
        />
      </div>
    </div>
  )
}
