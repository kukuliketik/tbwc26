'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import PredictionSelector from './PredictionSelector'
import { getFlag, getRoundColor, getRoundIcon } from '@/lib/flags'
import { parseWC26Date } from '@/lib/worldcup26-api'

const WIB = 'Asia/Jakarta'

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

interface Props {
  match: Match
  userPick: string | null
  saving?: boolean
  onPick: (matchId: number, pick: string) => void
}

export default function MatchCard({ match, userPick, saving, onPick }: Props) {
  const matchDate = match.live?.localDate
    ? parseWC26Date(match.live.localDate, match.live.stadiumId)
    : new Date(match.date)
  const matchWIB = toZonedTime(matchDate, WIB)
  const now = new Date()
  const ONE_HOUR_MS = 60 * 60 * 1000
  const isLocked = matchDate.getTime() - ONE_HOUR_MS < now.getTime()
  const homeScore = match.live?.homeScore ?? 0
  const awayScore = match.live?.awayScore ?? 0
  const computedResult = match.result ?? (match.live?.isFinished ? (homeScore > awayScore ? 'Team A' : homeScore < awayScore ? 'Team B' : 'Draw') : null)
  const isCorrect = computedResult && userPick === computedResult
  const isWrong = computedResult && userPick && userPick !== computedResult

  const [elapsed, setElapsed] = useState(() => {
    if (!match.live?.isLive) return 0
    return Math.floor((Date.now() - matchDate.getTime()) / 60000)
  })

  useEffect(() => {
    if (!match.live?.isLive) return
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - matchDate.getTime()) / 60000))
    }, 30000)
    return () => clearInterval(timer)
  }, [match.live?.isLive, matchDate.getTime()])

  const matchDay = format(matchWIB, 'EEE, MMM d')
  const matchTime = format(matchWIB, 'HH:mm')

  const flagA = getFlag(match.teamA)
  const flagB = getFlag(match.teamB)

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-all duration-300 bg-card-hover ${
        isCorrect
          ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 shadow-md shadow-emerald-100 dark:shadow-emerald-900/20'
          : isWrong
            ? 'bg-red-50/80 dark:bg-red-950/30 border-red-300 dark:border-red-700 shadow-md shadow-red-100 dark:shadow-red-900/20'
            : isLocked && !computedResult
              ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700'
              : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
      } ${saving ? 'opacity-70' : ''}`}
    >
      {/* Match Number Badge */}
      <Link href={`/matches/${match.id}`} className="absolute top-3 left-3 z-10">
        <span className="text-[10px] font-bold text-white bg-gray-800/80 dark:bg-gray-600/80 px-1.5 py-0.5 rounded-md hover:bg-wc-gold hover:text-wc-navy transition-colors">
          #{match.id}
        </span>
      </Link>

      {/* Correct indicator */}
      {isCorrect && (
        <div className="absolute top-3 right-3 z-10">
          <div className="flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
            <span>✓</span>
            <span>+1</span>
          </div>
        </div>
      )}
      {isWrong && (
        <div className="absolute top-3 right-3 z-10">
          <div className="flex items-center gap-1 bg-red-400 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm">
            <span>✗</span>
            <span>0</span>
          </div>
        </div>
      )}

      {/* Live indicator */}
      {isLocked && !computedResult && match.live?.isLive && (
        <div className="absolute top-3 right-3 z-10">
          <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded-full border border-red-200 dark:border-red-800">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full live-pulse" />
            {elapsed > 0 ? `${elapsed}'` : 'LIVE'}
          </span>
        </div>
      )}

      <div className="p-5 pt-10">
        {/* Header - Date & Meta */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {match.group && (
            <span className="text-[10px] font-bold tracking-wider text-wc-navy dark:text-wc-gold uppercase bg-wc-gold/15 dark:bg-wc-navy/50 px-2 py-1 rounded-md">
              Group {match.group}
            </span>
          )}
          <span className={`text-[10px] font-medium px-2 py-1 rounded-md ${getRoundColor(match.round)}`}>
            {getRoundIcon(match.round)} {match.stage}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">
            {matchDay} · {matchTime}
          </span>
        </div>

        {/* Teams Matchup */}
        <div className="flex items-stretch gap-3 mb-4">
          {/* Team A */}
          <div className={`flex-1 flex flex-col items-center justify-center text-center p-3 rounded-xl border transition-all ${
              computedResult === 'Team A'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
                : computedResult === 'Team B'
                  ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'
                  : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'
          }`}>
            <span className="text-3xl mb-2">{flagA}</span>
            <span className={`text-sm font-bold leading-tight ${
              computedResult === 'Team A'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-gray-900 dark:text-white'
            }`}>
              {match.teamA}
            </span>
            {computedResult === 'Team A' && (
              <span className="text-[10px] font-bold text-emerald-600 mt-1">WINNER</span>
            )}
          </div>

          {/* Center - Score/Status */}
          <div className="flex items-center justify-center w-20 flex-shrink-0">
            <div className="text-center">
              {computedResult ? (
                <div className="text-xl font-black text-white">
                  {homeScore} - {awayScore}
                </div>
              ) : isLocked && match.live?.isLive ? (
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-red-500 live-pulse">●</span>
                  <span className="text-[10px] font-bold text-red-500 mt-1">
                    {elapsed > 0 ? `${elapsed}'` : 'LIVE'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800">
                  <span className="text-xs font-bold text-gray-300 dark:text-gray-600">VS</span>
                </div>
              )}
            </div>
          </div>

          {/* Team B */}
          <div className={`flex-1 flex flex-col items-center justify-center text-center p-3 rounded-xl border transition-all ${
            computedResult === 'Team B'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
              : computedResult === 'Team A'
                ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'
                : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'
          }`}>
            <span className="text-3xl mb-2">{flagB}</span>
            <span className={`text-sm font-bold leading-tight ${
              computedResult === 'Team B'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-gray-900 dark:text-white'
            }`}>
              {match.teamB}
            </span>
            {computedResult === 'Team B' && (
              <span className="text-[10px] font-bold text-emerald-600 mt-1">WINNER</span>
            )}
          </div>
        </div>

        {/* Prediction Section */}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          {computedResult ? null : (
            <div>
              {isLocked ? (
                <div className="text-center py-2">
                  <span className="text-sm text-gray-400">Predictions closed — 1h before kickoff</span>
                </div>
              ) : (
                <PredictionSelector
                  pick={userPick}
                  disabled={isLocked}
                  onSelect={(pick) => onPick(match.id, pick)}
                  teamA={match.teamA}
                  teamB={match.teamB}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
