'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { getFlag } from '@/lib/flags'

interface RecentMatchData {
  Date: string
  HomeTeamScore: number
  AwayTeamScore: number
  Home: { TeamName: { Description: string }[] } | null
  Away: { TeamName: { Description: string }[] } | null
  StageName: { Description: string }[]
}

interface RecentMatchesProps {
  homeTeam: string
  awayTeam: string
  homeMatches: RecentMatchData[]
  awayMatches: RecentMatchData[]
}

type Result = 'W' | 'D' | 'L'

interface FormMatch {
  date: Date
  opponent: string
  isHome: boolean
  gf: number
  ga: number
  result: Result
  stage: string
}

function getTeamNameFromMatch(team: { TeamName: { Description: string }[] } | null): string {
  return team?.TeamName?.[0]?.Description ?? 'TBD'
}

function buildFormMatches(teamName: string, matches: RecentMatchData[]): FormMatch[] {
  return [...matches]
    .sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime())
    .map((m) => {
    const homeName = getTeamNameFromMatch(m.Home)
    const awayName = getTeamNameFromMatch(m.Away)
    const isHome = homeName === teamName
    const opponent = isHome ? awayName : homeName
    const gf = isHome ? m.HomeTeamScore : m.AwayTeamScore
    const ga = isHome ? m.AwayTeamScore : m.HomeTeamScore
    const result: Result = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
    const stage = m.StageName?.[0]?.Description ?? ''
    return {
      date: m.Date ? new Date(m.Date) : new Date(),
      opponent,
      isHome,
      gf,
      ga,
      result,
      stage,
    }
  })
}

function ResultBadge({ result }: { result: Result }) {
  const styles = {
    W: 'bg-emerald-500 text-white shadow-emerald-500/25',
    D: 'bg-gray-400 text-white shadow-gray-400/25',
    L: 'bg-red-500 text-white shadow-red-500/25',
  }
  return (
    <span
      className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shadow-lg ${styles[result]}`}
    >
      {result}
    </span>
  )
}

function MiniResultDot({ result }: { result: Result }) {
  const styles = {
    W: 'bg-emerald-500',
    D: 'bg-gray-400',
    L: 'bg-red-500',
  }
  return (
    <span
      className={`w-2 h-2 rounded-full ${styles[result]}`}
      title={result === 'W' ? 'Win' : result === 'D' ? 'Draw' : 'Loss'}
    />
  )
}

function MatchRow({ match }: { match: FormMatch }) {
  const oppFlag = getFlag(match.opponent)
  return (
    <div className="group flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 hover:bg-white dark:hover:bg-gray-800/60 hover:border-wc-gold/30 hover:shadow-md transition-all duration-200">
      {/* Result badge */}
      <ResultBadge result={match.result} />

      {/* Date */}
      <div className="flex flex-col items-center min-w-[42px]">
        <span className="text-[10px] font-bold text-wc-gold uppercase">
          {format(match.date, 'MMM')}
        </span>
        <span className="text-xs font-black text-gray-700 dark:text-gray-200">
          {format(match.date, 'd')}
        </span>
      </div>

      {/* Opponent */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{oppFlag}</span>
          <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
            {match.opponent}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-medium text-gray-400">
            {match.isHome ? 'Home' : 'Away'}
          </span>
          {match.stage && (
            <>
              <span className="text-[10px] text-gray-300 dark:text-gray-600">•</span>
              <span className="text-[10px] text-gray-400 truncate">{match.stage}</span>
            </>
          )}
        </div>
      </div>

      {/* Score */}
      <div className="flex flex-col items-end">
        <div className="flex items-center gap-1.5 text-lg font-black text-gray-900 dark:text-white">
          <span>{match.gf}</span>
          <span className="text-gray-300 dark:text-gray-600">-</span>
          <span>{match.ga}</span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <MiniResultDot result={match.result} />
          <span className="text-[9px] font-medium text-gray-400">
            {match.result === 'W' ? 'Win' : match.result === 'D' ? 'Draw' : 'Loss'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function RecentMatches({ homeTeam, awayTeam, homeMatches, awayMatches }: RecentMatchesProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'away'>('home')

  const homeForm = buildFormMatches(homeTeam, homeMatches)
  const awayForm = buildFormMatches(awayTeam, awayMatches)
  const activeForm = activeTab === 'home' ? homeForm : awayForm

  const record = {
    W: activeForm.filter((m) => m.result === 'W').length,
    D: activeForm.filter((m) => m.result === 'D').length,
    L: activeForm.filter((m) => m.result === 'L').length,
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/25">
        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Recent Matches
        </h3>
        <span className="text-[10px] text-gray-400 font-semibold uppercase">Last 5 Matches</span>
      </div>

      {/* Team tabs */}
      <div className="grid grid-cols-2 border-b border-gray-100 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold transition-all ${
            activeTab === 'home'
              ? 'bg-white dark:bg-gray-900 text-wc-gold border-b-2 border-wc-gold'
              : 'bg-gray-50/50 dark:bg-gray-800/30 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }`}
        >
          <span className="text-lg">{getFlag(homeTeam)}</span>
          <span className="truncate">{homeTeam}</span>
        </button>
        <button
          onClick={() => setActiveTab('away')}
          className={`flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold transition-all ${
            activeTab === 'away'
              ? 'bg-white dark:bg-gray-900 text-wc-gold border-b-2 border-wc-gold'
              : 'bg-gray-50/50 dark:bg-gray-800/30 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }`}
        >
          <span className="text-lg">{getFlag(awayTeam)}</span>
          <span className="truncate">{awayTeam}</span>
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Form summary */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            {activeForm.map((m, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black text-white shadow-sm ${
                  m.result === 'W'
                    ? 'bg-emerald-500'
                    : m.result === 'D'
                      ? 'bg-gray-400'
                      : 'bg-red-500'
                }`}
              >
                {m.result}
              </div>
            ))}
            {activeForm.length === 0 && (
              <span className="text-xs text-gray-400">No recent matches</span>
            )}
          </div>

          {activeForm.length > 0 && (
            <div className="flex items-center gap-3 text-[10px] font-bold text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {record.W}W
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                {record.D}D
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {record.L}L
              </span>
            </div>
          )}
        </div>

        {/* Match list */}
        <div className="space-y-2">
          {activeForm.map((match, i) => (
            <MatchRow key={i} match={match} />
          ))}
        </div>
      </div>
    </div>
  )
}
