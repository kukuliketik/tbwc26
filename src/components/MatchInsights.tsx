'use client'

interface TeamStats {
  MatchesPlayed: number
  Wins: number
  Losses: number
  Draws: number
  GoalsScored: number
  GoalsAgainst: number
  MatchesList?: {
    Date: string
    HomeTeamScore: number
    AwayTeamScore: number
    Home: { TeamName: { Description: string }[] } | null
    Away: { TeamName: { Description: string }[] } | null
  }[]
}

interface MatchInsightsProps {
  teamA: string
  teamB: string
  homeStats: TeamStats | null
  awayStats: TeamStats | null
}

function getOpponentAndResult(
  teamName: string,
  m: NonNullable<TeamStats['MatchesList']>[number]
) {
  const homeName = m.Home?.TeamName?.[0]?.Description ?? ''
  const isHome = homeName === teamName
  const gf = isHome ? m.HomeTeamScore : m.AwayTeamScore
  const ga = isHome ? m.AwayTeamScore : m.HomeTeamScore
  const result: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
  return { result }
}

function getFormFromMatches(teamName: string, matches: TeamStats['MatchesList']): ('W' | 'D' | 'L')[] {
  if (!matches) return []
  return [...matches]
    .sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime())
    .slice(0, 5)
    .map((m) => getOpponentAndResult(teamName, m).result)
}

function computeWinProbability(home: TeamStats | null, away: TeamStats | null) {
  if (!home || !away || home.MatchesPlayed === 0 || away.MatchesPlayed === 0) {
    return { probA: 33, probDraw: 34, probB: 33 }
  }

  const matchesA = home.MatchesPlayed
  const matchesB = away.MatchesPlayed

  // Win rate with draws weighted as half a win
  const winRateA = (home.Wins + home.Draws * 0.5) / matchesA
  const winRateB = (away.Wins + away.Draws * 0.5) / matchesB

  // Attack / defense efficiency
  const attackA = home.GoalsScored / matchesA
  const attackB = away.GoalsScored / matchesB
  const defenseA = 1 / (away.GoalsAgainst / matchesA + 1)
  const defenseB = 1 / (home.GoalsAgainst / matchesB + 1)

  const strengthA = winRateA * 0.5 + attackA * 0.25 + defenseA * 0.25
  const strengthB = winRateB * 0.5 + attackB * 0.25 + defenseB * 0.25

  // Draw probability based on historical draw rates, clamped
  const drawRateA = home.Draws / matchesA
  const drawRateB = away.Draws / matchesB
  const drawProb = Math.min(35, Math.round(((drawRateA + drawRateB) / 2) * 70 + 15))

  const remaining = 100 - drawProb
  const totalStrength = strengthA + strengthB || 1
  const probA = Math.max(10, Math.round((strengthA / totalStrength) * remaining))
  const probB = Math.max(10, 100 - probA - drawProb)

  return { probA, probDraw: 100 - probA - probB, probB }
}

function StatRow({
  label,
  valA,
  valB,
  pctA,
  pctB,
}: {
  label: string
  valA: string
  valB: string
  pctA: number
  pctB: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider">
        <span className="text-blue-600 dark:text-blue-400">{valA}</span>
        <span className="text-[10px] text-gray-400 normal-case tracking-normal">{label}</span>
        <span className="text-orange-600 dark:text-orange-400">{valB}</span>
      </div>
      <div className="flex h-2 w-full gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="bg-blue-500 rounded-l-full transition-all duration-500"
          style={{ width: `${Math.max(Math.min(pctA, 95), 5)}%` }}
        />
        <div
          className="bg-orange-500 rounded-r-full transition-all duration-500"
          style={{ width: `${Math.max(Math.min(pctB, 95), 5)}%` }}
        />
      </div>
    </div>
  )
}

function FormBadges({ results }: { results: ('W' | 'D' | 'L')[] }) {
  return (
    <div className="flex items-center gap-1">
      {results.map((char, i) => (
        <span
          key={i}
          className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] text-white ${
            char === 'W' ? 'bg-emerald-500' : char === 'D' ? 'bg-gray-400' : 'bg-red-500'
          }`}
        >
          {char}
        </span>
      ))}
      {results.length === 0 && <span className="text-[10px] text-gray-400">No data</span>}
    </div>
  )
}

export default function MatchInsights({ teamA, teamB, homeStats, awayStats }: MatchInsightsProps) {
  if (!homeStats && !awayStats) return null

  const { probA, probDraw, probB } = computeWinProbability(homeStats, awayStats)
  const homeForm = getFormFromMatches(teamA, homeStats?.MatchesList)
  const awayForm = getFormFromMatches(teamB, awayStats?.MatchesList)

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden space-y-4">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/25">
        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Match Insights
        </h3>
        <span className="text-[10px] text-gray-400 font-semibold uppercase">FIFA Data Centre</span>
      </div>

      {/* Record Badges */}
      <div className="px-5 grid grid-cols-2 gap-3">
        {[
          { label: teamA, stats: homeStats, color: 'blue' as const },
          { label: teamB, stats: awayStats, color: 'orange' as const },
        ].map((item) => (
          <div
            key={item.label}
            className={`rounded-xl p-3 text-center border border-gray-100 dark:border-gray-800 ${
              item.color === 'blue'
                ? 'bg-blue-50 dark:bg-blue-900/10 text-blue-500'
                : 'bg-orange-50 dark:bg-orange-900/10 text-orange-500'
            }`}
          >
            <div className="text-[10px] font-bold uppercase truncate mb-1">{item.label}</div>
            <div className="grid grid-cols-3 gap-1">
              <div>
                <div className="text-base font-black">{item.stats?.Wins ?? 0}</div>
                <div className="text-[8px] font-bold uppercase">W</div>
              </div>
              <div>
                <div className="text-base font-black">{item.stats?.Draws ?? 0}</div>
                <div className="text-[8px] font-bold uppercase">D</div>
              </div>
              <div>
                <div className="text-base font-black">{item.stats?.Losses ?? 0}</div>
                <div className="text-[8px] font-bold uppercase">L</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Win Probability Bar */}
      <div className="px-5">
        <div className="text-xs font-semibold text-gray-400 mb-2 text-center uppercase tracking-wider">
          Win Probability
        </div>
        <div className="flex h-8 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm">
          <div
            className="flex items-center justify-center text-[10px] font-bold text-white bg-blue-500 transition-all duration-500"
            style={{ width: `${probA}%` }}
          >
            {probA > 10 ? `${teamA} ${probA}%` : ''}
          </div>
          <div
            className="flex items-center justify-center text-[10px] font-bold text-gray-700 bg-gray-200 dark:bg-gray-600 dark:text-gray-200 transition-all duration-500"
            style={{ width: `${probDraw}%` }}
          >
            {probDraw > 10 ? `Draw ${probDraw}%` : ''}
          </div>
          <div
            className="flex items-center justify-center text-[10px] font-bold text-white bg-orange-500 transition-all duration-500"
            style={{ width: `${probB}%` }}
          >
            {probB > 10 ? `${teamB} ${probB}%` : ''}
          </div>
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> {teamA} {probA}%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-500 inline-block" /> Draw {probDraw}%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> {teamB} {probB}%
          </span>
        </div>
      </div>

      {/* Key Comparison Stats */}
      <div className="px-5 pb-5">
        <div className="text-xs font-semibold text-gray-400 mb-2.5 uppercase tracking-wider">
          Key Team Comparison Stats
        </div>
        <div className="space-y-3.5">
          <StatRow
            label="Win Rate"
            valA={`${homeStats ? Math.round((homeStats.Wins / Math.max(homeStats.MatchesPlayed, 1)) * 100) : 0}%`}
            valB={`${awayStats ? Math.round((awayStats.Wins / Math.max(awayStats.MatchesPlayed, 1)) * 100) : 0}%`}
            pctA={homeStats ? (homeStats.Wins / Math.max(homeStats.MatchesPlayed, 1)) * 100 : 0}
            pctB={awayStats ? (awayStats.Wins / Math.max(awayStats.MatchesPlayed, 1)) * 100 : 0}
          />
          <StatRow
            label="Goals Scored"
            valA={`${homeStats?.GoalsScored ?? 0}`}
            valB={`${awayStats?.GoalsScored ?? 0}`}
            pctA={
              homeStats
                ? (homeStats.GoalsScored / Math.max(homeStats.GoalsScored + (awayStats?.GoalsScored ?? 0), 1)) * 100
                : 0
            }
            pctB={
              awayStats
                ? (awayStats.GoalsScored / Math.max((homeStats?.GoalsScored ?? 0) + awayStats.GoalsScored, 1)) * 100
                : 0
            }
          />
          <StatRow
            label="Goal Difference"
            valA={`${(homeStats?.GoalsScored ?? 0) - (homeStats?.GoalsAgainst ?? 0)}`}
            valB={`${(awayStats?.GoalsScored ?? 0) - (awayStats?.GoalsAgainst ?? 0)}`}
            pctA={Math.max(
              5,
              Math.min(95, 50 + ((homeStats?.GoalsScored ?? 0) - (homeStats?.GoalsAgainst ?? 0)) * 5)
            )}
            pctB={Math.max(
              5,
              Math.min(95, 50 + ((awayStats?.GoalsScored ?? 0) - (awayStats?.GoalsAgainst ?? 0)) * 5)
            )}
          />

          {/* Team Form */}
          <div className="flex items-center justify-between text-xs py-1">
            <FormBadges results={homeForm} />
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Recent Form</span>
            <FormBadges results={awayForm} />
          </div>
        </div>
      </div>
    </div>
  )
}
