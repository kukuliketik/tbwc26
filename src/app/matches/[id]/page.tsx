'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getFlag, getRoundColor, getRoundIcon } from '@/lib/flags'
import { parseWC26Date } from '@/lib/worldcup26-api'
import PredictionSelector from '@/components/PredictionSelector'
import Avatar from '@/components/Avatar'
import CountdownTimer from '@/components/CountdownTimer'
import RecentMatches from '@/components/RecentMatches'
import MatchInsights from '@/components/MatchInsights'
import MatchStats from '@/components/MatchStats'
import SearchableSelect from '@/components/SearchableSelect'
import { useToast } from '@/components/Toast'

// AiScore match URLs — IDs are random hashes, must be manually mapped
const AISCORE_URLS: Record<number, string> = {
  75: 'https://www.aiscore.com/match-netherlands-morocco/ezk96i3gj3wa1kn',
  76: 'https://www.aiscore.com/match-brazil-japan/l6kegi86r80fv75',
}

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
  homeScore: number | null
  awayScore: number | null
  cornersPick: string | null
  goalScorer: string | null
  goalScorerId: string | null
  user: UserInfo
}

interface LiveGameData {
  homeScore: number
  awayScore: number
  homeScorers: string[]
  awayScorers: string[]
  homeScorerIds: string[]
  awayScorerIds: string[]
  isLive: boolean
  isFinished: boolean
  timeElapsed: string
  stadium: string
  localDate: string
  stadiumId: string
  finished: string
}

interface TeamStats {
  MatchesPlayed: number
  Wins: number
  Losses: number
  Draws: number
  GoalsScored: number
  GoalsAgainst: number
  MatchesList?: { Date: string; HomeTeamScore: number; AwayTeamScore: number; Winner: string | null; Home: { TeamName: { Description: string }[] } | null; Away: { TeamName: { Description: string }[] } | null; StageName: { Description: string }[] }[]
}

interface MatchStats {
  home: { teamId: string; corners: number; fouls: number; shots: number; offsides: number; yellowCards: number }
  away: { teamId: string; corners: number; fouls: number; shots: number; offsides: number; yellowCards: number }
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
  teamStats?: { home: TeamStats | null; away: TeamStats | null } | null
  matchStats?: MatchStats | null
  homePlayers: { id: string; name: string; shirtNumber: number }[]
  awayPlayers: { id: string; name: string; shirtNumber: number }[]
}

const ONE_HOUR_MS = 60 * 60 * 1000

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
  const [statsLoading, setStatsLoading] = useState(false)
  const [userPick, setUserPick] = useState<string | null>(null)
  const [scorePick, setScorePick] = useState<{ home: string; away: string }>({ home: '', away: '' })
  const [cornersPick, setCornersPick] = useState<string | null>(null)
  const [goalScorer, setGoalScorer] = useState<string | null>(null)
  const [goalScorerId, setGoalScorerId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingExtras, setSavingExtras] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const loadStats = useCallback(async (currentMatch: MatchDetail) => {
    if (!currentMatch.live) return
    setStatsLoading(true)
    try {
      const res = await fetch(`/api/matches/${id}/stats`)
      if (res.ok) {
        const data = await res.json()
        setMatch((prev) => (prev ? { ...prev, matchStats: data.matchStats } : prev))
      }
    } catch {
      // Silent fail — stats are supplementary
    } finally {
      setStatsLoading(false)
    }
  }, [id])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/matches/${id}`)
        if (!res.ok) throw new Error('Not found')
        const data: MatchDetail = await res.json()
        setMatch(data)
        const myPred = data.predictions.find((p) => p.userId === session?.user?.id)
        if (myPred) {
          setUserPick(myPred.pick)
          setScorePick({ home: myPred.homeScore?.toString() ?? '', away: myPred.awayScore?.toString() ?? '' })
          setCornersPick(myPred.cornersPick)
          setGoalScorer(myPred.goalScorer)
          if (myPred.goalScorerId) {
            setGoalScorerId(myPred.goalScorerId)
          } else if (myPred.goalScorer) {
            const allPlayers = [...data.homePlayers, ...data.awayPlayers]
            const predictedLast = myPred.goalScorer.toUpperCase().trim().split(' ').pop() ?? ''
            const found = allPlayers.find((p) => {
              const playerLast = p.name.toUpperCase().trim().split(' ').pop() ?? ''
              return playerLast === predictedLast && playerLast.length > 2
            })
            if (found) setGoalScorerId(found.id)
          }
        }
        // Load stats in parallel so the main page renders fast
        loadStats(data)
      } catch {
        addToast('Match not found', 'error')
        router.push('/matches')
      } finally {
        setLoading(false)
      }
    }
    if (id) load()
  }, [id, session?.user?.id, loadStats, addToast, router])

  // Auto-refresh for live matches
  useEffect(() => {
    if (!match?.live?.isLive) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/matches/${id}`)
        if (res.ok) {
          const data: MatchDetail = await res.json()
          setMatch(data)
          const refreshedPred = data.predictions.find((p) => p.userId === session?.user?.id)
          if (refreshedPred && !savingExtras) {
            setScorePick({ home: refreshedPred.homeScore?.toString() ?? '', away: refreshedPred.awayScore?.toString() ?? '' })
            setCornersPick(refreshedPred.cornersPick)
            setGoalScorer(refreshedPred.goalScorer)
            if (refreshedPred.goalScorerId) {
              setGoalScorerId(refreshedPred.goalScorerId)
            }
          }
        }
      } catch {
        // Silent fail for auto-refresh
      }
      // Refresh stats separately — they have their own caching rules
      if (match) loadStats(match)
    }, 10000) // Refresh every 10 seconds for near real-time score / goal scorer updates

    return () => clearInterval(interval)
  }, [match?.live?.isLive, id, match, loadStats, savingExtras, session?.user?.id])

  // Elapsed minutes for live matches
  useEffect(() => {
    if (!match?.live?.isLive) return
    const matchTs = match.live?.localDate
      ? parseWC26Date(match.live.localDate, match.live.stadiumId).getTime()
      : new Date(match.date).getTime()
    const update = () => setElapsed(Math.floor((Date.now() - matchTs) / 60000))
    const initial = setTimeout(update, 0)
    const timer = setInterval(update, 30000)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
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

  const handleSaveExtras = async () => {
    setSavingExtras(true)
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: parseInt(id),
          homeScore: scorePick.home,
          awayScore: scorePick.away,
          cornersPick,
          goalScorer,
          goalScorerId,
        }),
      })
      if (!res.ok) throw new Error()
      addToast('Score, corners & goal scorer predictions saved!', 'success')
      const reloadRes = await fetch(`/api/matches/${id}`)
      if (reloadRes.ok) setMatch(await reloadRes.json())
    } catch {
      addToast('Failed to save predictions', 'error')
    } finally {
      setSavingExtras(false)
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

  const teamAPredictions = match.predictions.filter((p) => p.pick === 'Team A')
  const teamBPredictions = match.predictions.filter((p) => p.pick === 'Team B')
  const drawPredictions = match.predictions.filter((p) => p.pick === 'Draw')
  const totalPicks = match.predictions.length
  const extrasPredictions = match.predictions.filter(
    (p) => p.homeScore != null || p.awayScore != null || p.cornersPick != null || p.goalScorer != null
  )
  const totalExtras = extrasPredictions.length
  const myExtras = match.predictions.find((p) => p.userId === session?.user?.id)

  function pickPct(team: 'Team A' | 'Team B' | 'Draw'): number {
    if (!match || totalPicks === 0) return 0
    return Math.round((match.predictions.filter((p) => p.pick === team).length / totalPicks) * 100)
  }

  const teamStats = match.teamStats

  // Actual corners result for finished matches
  const actualCornersResult: string | null = (() => {
    if (!isFinishedMatch || !match.matchStats) return null
    const { home, away } = match.matchStats
    if (home.corners > away.corners) return 'Team A'
    if (home.corners < away.corners) return 'Team B'
    return 'Draw'
  })()

  function isScoreCorrect(p: Prediction): boolean {
    if (!isFinishedMatch || p.homeScore === null || p.awayScore === null) return false
    return p.homeScore === homeScore && p.awayScore === awayScore
  }

  function isCornersCorrect(p: Prediction): boolean {
    if (!isFinishedMatch || !actualCornersResult || !p.cornersPick) return false
    return p.cornersPick === actualCornersResult
  }

  function countPlayerGoals(playerName: string, scorers: string[]): number {
    if (!playerName || !scorers.length) return 0
    const name = playerName.toUpperCase().replace(/\s+/g, ' ').trim()
    return scorers.filter((s) => {
      const scorerName = s.toUpperCase().replace(/ \(OG\)/, '').replace(/\s+\d+.*$/, '').replace(/\s+$/, '').trim()
      if (scorerName === name) return true
      const scorerParts = scorerName.split(' ')
      const scorerLast = scorerParts[scorerParts.length - 1]
      const nameParts = name.split(' ')
      const nameLast = nameParts[nameParts.length - 1]
      return scorerLast === nameLast && scorerLast.length > 2
    }).length
  }

  function countScorerGoalsById(scorerIds: string[], targetId: string | null): number {
    if (!targetId || !scorerIds.length) return 0
    return scorerIds.filter((id) => id === targetId).length
  }

  function isScorerCorrect(p: Prediction): boolean {
    if (!isFinishedMatch || !live) return false
    const allScorerIds = [...(live.homeScorerIds ?? []), ...(live.awayScorerIds ?? [])]
    if (p.goalScorerId) {
      return countScorerGoalsById(allScorerIds, p.goalScorerId) > 0
    }
    if (!p.goalScorer) return false
    return countPlayerGoals(p.goalScorer, [...live.homeScorers, ...live.awayScorers]) > 0
  }

  function scorerGoals(p: Prediction): number {
    if (!isFinishedMatch || !live) return 0
    const allScorerIds = [...(live.homeScorerIds ?? []), ...(live.awayScorerIds ?? [])]
    if (p.goalScorerId) {
      return countScorerGoalsById(allScorerIds, p.goalScorerId)
    }
    if (!p.goalScorer) return 0
    return countPlayerGoals(p.goalScorer, [...live.homeScorers, ...live.awayScorers])
  }

  function calcSimPoints(p: Prediction): number {
    if (!isFinishedMatch) return 0
    let pts = 0
    // Score: +3 correct, -1 wrong
    if (p.homeScore !== null && p.awayScore !== null) {
      pts += (p.homeScore === homeScore && p.awayScore === awayScore) ? 3 : -1
    }
    // Corners: +2 correct, -1 wrong
    if (p.cornersPick && actualCornersResult) {
      pts += (p.cornersPick === actualCornersResult) ? 2 : -1
    }
    // Goal scorer: +4 per goal, -2 wrong
    if (live && (p.goalScorerId || p.goalScorer)) {
      const allScorerIds = [...(live.homeScorerIds ?? []), ...(live.awayScorerIds ?? [])]
      const goals = p.goalScorerId
        ? countScorerGoalsById(allScorerIds, p.goalScorerId)
        : countPlayerGoals(p.goalScorer!, [...live.homeScorers, ...live.awayScorers])
      if (goals > 0) {
        pts += goals * 4
      } else {
        pts -= 2
      }
    }
    return pts
  }

  return (
    <div className="page-enter max-w-3xl mx-auto space-y-4 overflow-hidden">
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

      {/* ===== 3D MATCH VIEW (AiScore) ===== */}
      {AISCORE_URLS[match.id] && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              3D Match View
            </span>
            <a
              href={AISCORE_URLS[match.id]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-wc-gold hover:underline"
            >
              Open full page ↗
            </a>
          </div>
          <div className="relative overflow-hidden" style={{ height: 420 }}>
            <iframe
              src={AISCORE_URLS[match.id]}
              width="100%"
              height={1200}
              frameBorder="0"
              className="absolute"
              style={{ top: -500, left: -50, width: '100%', transform: 'scale(0.95)', transformOrigin: 'top left', pointerEvents: 'none' }}
              title="3D Match View"
            />
          </div>
        </div>
      )}

      {/* ===== MATCH STATS ===== */}
      {match.live && (
        <MatchStats
          teamA={match.teamA}
          teamB={match.teamB}
          home={match.matchStats?.home}
          away={match.matchStats?.away}
          isLoading={statsLoading}
        />
      )}

      {/* ===== PREDICTION SECTION — authenticated users only ===== */}
      {session?.user && (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            {isFinishedMatch ? 'Your Prediction' : isLiveMatch ? 'Your Prediction' : 'Pick Your Winner'}
          </h3>
        </div>
        <div className="p-5">
          {isFinishedMatch || isLiveMatch ? (
            <div className="space-y-3">
              {userPick ? (
                <div className={`inline-flex w-full items-center gap-3 px-5 py-3 rounded-xl ${
                  isCorrect
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : isLiveMatch
                      ? 'bg-wc-gold/10 text-wc-gold border border-wc-gold/30'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}>
                  <span className="text-2xl">{isLiveMatch ? '⏳' : isCorrect ? '✅' : '❌'}</span>
                  <div className="text-left">
                    <div className="text-sm font-bold">{isLiveMatch ? 'Locked In' : isCorrect ? 'Correct!' : 'Wrong'}</div>
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
              {((scorePick.home || scorePick.away || cornersPick || goalScorer) && myExtras) && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className={`rounded-xl px-3 py-2 ${
                      isFinishedMatch
                        ? isScoreCorrect(myExtras) ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'
                        : 'bg-gray-50 dark:bg-gray-800/50'
                    }`}>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Predicted Score</div>
                      <div className={`text-sm font-bold ${
                        isFinishedMatch
                          ? isScoreCorrect(myExtras) ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                          : 'text-gray-700 dark:text-gray-200'
                      }`}>{scorePick.home || '—'} - {scorePick.away || '—'}</div>
                    </div>
                    <div className={`rounded-xl px-3 py-2 ${
                      isFinishedMatch
                        ? isCornersCorrect(myExtras) ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'
                        : 'bg-gray-50 dark:bg-gray-800/50'
                    }`}>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Predicted Corners</div>
                      <div className={`text-sm font-bold ${
                        isFinishedMatch
                          ? isCornersCorrect(myExtras) ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                          : 'text-gray-700 dark:text-gray-200'
                      }`}>
                        {cornersPick === 'Team A' ? match.teamA : cornersPick === 'Team B' ? match.teamB : cornersPick === 'Draw' ? 'Draw' : '—'}
                      </div>
                    </div>
                    <div className={`rounded-xl px-3 py-2 ${
                      isFinishedMatch
                        ? isScorerCorrect(myExtras) ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'
                        : 'bg-gray-50 dark:bg-gray-800/50'
                    }`}>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Goal Scorer</div>
                      <div className={`text-sm font-bold truncate ${
                        isFinishedMatch
                          ? isScorerCorrect(myExtras) ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                          : 'text-gray-700 dark:text-gray-200'
                      }`}>
                        {goalScorer || '—'}
                        {isFinishedMatch && isScorerCorrect(myExtras) && scorerGoals(myExtras) > 1 && (
                          <span className="text-[10px] ml-0.5">×{scorerGoals(myExtras)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isFinishedMatch && myExtras && (
                    <div className={`text-center text-xs font-bold py-2 rounded-lg ${
                      calcSimPoints(myExtras) > 0
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                        : calcSimPoints(myExtras) < 0
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    }`}>
                      Sim Points: {calcSimPoints(myExtras) > 0 ? '+' : ''}{calcSimPoints(myExtras)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <PredictionSelector
                pick={userPick}
                onSelect={handlePick}
                teamA={match.teamA}
                teamB={match.teamB}
                disabled={isLocked}
              />
              {saving && (
                <div className="text-center">
                  <span className="text-xs text-gray-400">Saving...</span>
                </div>
              )}

              {/* ===== SCORE & CORNERS PREDICTION (slim) ===== */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Predict Score & Corners</div>
                  <div className="relative group">
                    <button className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center text-[10px] font-bold hover:bg-wc-gold/20 hover:text-wc-gold focus:bg-wc-gold/20 focus:text-wc-gold transition-colors">
                      ?
                    </button>
                    <div className="invisible group-hover:visible group-focus-within:visible absolute left-0 top-full mt-1 z-50 w-64 p-3 rounded-xl bg-gray-900 dark:bg-gray-800 text-white text-[11px] leading-relaxed shadow-xl border border-gray-700">
                      <div className="font-bold text-wc-gold mb-1.5">Booster Points (Simulated)</div>
                      <div className="space-y-1 text-gray-300">
                        <div className="flex justify-between"><span>Correct Score</span><span className="text-emerald-400 font-semibold">+3</span></div>
                        <div className="flex justify-between"><span>Wrong Score</span><span className="text-red-400 font-semibold">-1</span></div>
                        <div className="flex justify-between"><span>Correct Corner</span><span className="text-emerald-400 font-semibold">+2</span></div>
                        <div className="flex justify-between"><span>Wrong Corner</span><span className="text-red-400 font-semibold">-1</span></div>
                        <div className="flex justify-between"><span>Correct Scorer</span><span className="text-emerald-400 font-semibold">+4/goal</span></div>
                        <div className="flex justify-between"><span>Wrong Scorer</span><span className="text-red-400 font-semibold">-2</span></div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-700 text-yellow-300/80 text-[10px]">
                        ⚠️ Wrong predictions reduce your leaderboard total.
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Full-time score</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={scorePick.home}
                        onChange={(e) => setScorePick((prev) => ({ ...prev, home: e.target.value }))}
                        disabled={isLocked}
                        className="w-full min-w-0 text-center text-sm font-semibold px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-wc-gold/50 disabled:opacity-50"
                      />
                      <span className="text-xs text-gray-400">-</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={scorePick.away}
                        onChange={(e) => setScorePick((prev) => ({ ...prev, away: e.target.value }))}
                        disabled={isLocked}
                        className="w-full min-w-0 text-center text-sm font-semibold px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-wc-gold/50 disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">More corners</span>
                    <PredictionSelector
                      pick={cornersPick}
                      onSelect={setCornersPick}
                      teamA={match.teamA}
                      teamB={match.teamB}
                      disabled={isLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">First/Any goal scorer (pick 1 player)</span>
                    {(() => {
                      const excludedPlayers = ['mbappe', 'haaland', 'halland', 'messi', 'ronaldo', 'vini', 'vinicius']
                      const filterPlayers = (players: { id: string; name: string; shirtNumber: number }[]) =>
                        players.filter((p) => {
                          const nameLower = p.name.toLowerCase()
                          return !excludedPlayers.some((ex) => nameLower.includes(ex))
                        })
                      return (
                        <SearchableSelect
                          groups={[
                            { label: match.teamA, items: filterPlayers(match.homePlayers) },
                            { label: match.teamB, items: filterPlayers(match.awayPlayers) },
                          ]}
                          value={goalScorer}
                          onChange={setGoalScorer}
                          onSelect={(player) => setGoalScorerId(player?.id ?? null)}
                          disabled={isLocked}
                          placeholder="Search player by name or number..."
                        />
                      )
                    })()}
                  </div>
                </div>
                <button
                  onClick={handleSaveExtras}
                  disabled={isLocked || savingExtras}
                  className="mt-4 w-full py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {savingExtras ? 'Saving...' : 'Save Score, Corners & Goal Scorer'}
                </button>
              </div>
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

      {/* ===== SCORE & CORNER PREDICTIONS — authenticated users only ===== */}
      {session?.user && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden relative">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Score, Corner & Goal Scorer Predictions {totalExtras > 0 && <span className="font-normal">({totalExtras})</span>}
            </h3>
            <div className="relative group">
              <button className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center text-[10px] font-bold hover:bg-wc-gold/20 hover:text-wc-gold focus:bg-wc-gold/20 focus:text-wc-gold transition-colors">
                ?
              </button>
              <div className="invisible group-hover:visible group-focus-within:visible absolute left-0 top-full mt-1 z-50 w-64 p-3 rounded-xl bg-gray-900 dark:bg-gray-800 text-white text-[11px] leading-relaxed shadow-xl border border-gray-700">
                <div className="font-bold text-wc-gold mb-1.5">Booster Points (Simulated)</div>
                <div className="space-y-1 text-gray-300">
                  <div className="flex justify-between"><span>Correct Score</span><span className="text-emerald-400 font-semibold">+3</span></div>
                  <div className="flex justify-between"><span>Wrong Score</span><span className="text-red-400 font-semibold">-1</span></div>
                  <div className="flex justify-between"><span>Correct Corner</span><span className="text-emerald-400 font-semibold">+2</span></div>
                  <div className="flex justify-between"><span>Wrong Corner</span><span className="text-red-400 font-semibold">-1</span></div>
                  <div className="flex justify-between"><span>Correct Scorer</span><span className="text-emerald-400 font-semibold">+4/goal</span></div>
                  <div className="flex justify-between"><span>Wrong Scorer</span><span className="text-red-400 font-semibold">-2</span></div>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-700 text-yellow-300/80 text-[10px]">
                  ⚠️ Wrong predictions reduce your leaderboard total.
                </div>
              </div>
            </div>
          </div>

          {totalExtras > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {(isFinishedMatch
                ? [...extrasPredictions].sort((a, b) => calcSimPoints(b) - calcSimPoints(a))
                : extrasPredictions
              ).map((p) => {
                const scoreOk = isScoreCorrect(p)
                const cornersOk = isCornersCorrect(p)
                const scorerOk = isScorerCorrect(p)
                const pts = calcSimPoints(p)
                return (
                  <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                    <Avatar name={p.user.name ?? '?'} image={p.user.image} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{p.user.name}</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] flex-wrap justify-end">
                      <span className={`px-2 py-1 rounded-md font-semibold ${
                        isFinishedMatch
                          ? scoreOk ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}>
                        {p.homeScore ?? '—'} - {p.awayScore ?? '—'}
                      </span>
                      <span className={`px-2 py-1 rounded-md font-semibold ${
                        isFinishedMatch
                          ? cornersOk ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : 'bg-wc-gold/10 text-wc-gold'
                      }`}>
                        {p.cornersPick === 'Team A' ? match.teamA : p.cornersPick === 'Team B' ? match.teamB : p.cornersPick === 'Draw' ? 'Draw' : '—'}
                      </span>
                      {p.goalScorer && (
                        <span className={`px-2 py-1 rounded-md font-semibold ${
                          isFinishedMatch
                            ? scorerOk ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          ⚽ {p.goalScorer}{scorerOk && scorerGoals(p) > 1 ? ` ×${scorerGoals(p)}` : ''}
                        </span>
                      )}
                      {isFinishedMatch && (
                        <span className={`px-2 py-1 rounded-md font-bold text-[10px] ${
                          pts > 0 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : pts < 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                        }`}>
                          {pts > 0 ? '+' : ''}{pts}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="text-3xl mb-2">🎯</div>
              <p className="text-sm text-gray-500">No score, corner or goal scorer predictions yet.</p>
            </div>
          )}
        </div>
      )}

      {/* ===== MATCH INSIGHTS ===== */}
      {teamStats && (teamStats.home || teamStats.away) && (
        <MatchInsights
          teamA={match.teamA}
          teamB={match.teamB}
          homeStats={teamStats.home}
          awayStats={teamStats.away}
        />
      )}

      {/* ===== RECENT FORM ===== */}
      {teamStats && (teamStats.home?.MatchesList || teamStats.away?.MatchesList) && (
        <RecentMatches
          homeTeam={match.teamA}
          awayTeam={match.teamB}
          homeMatches={teamStats.home?.MatchesList ?? []}
          awayMatches={teamStats.away?.MatchesList ?? []}
        />
      )}

    </div>
  )
}

