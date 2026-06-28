import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getAllMatches,
  isFinished,
  getHomeScore,
  getAwayScore,
  getMatchDetail,
  getMatchTimeline,
  deriveStatsFromTimeline,
  parseScorers,
  parseScorerIds,
  filterRegularTimeGoals,
  get90MinScore,
  get90MinResult,
  FifaMatch,
} from '@/lib/fifa-api'

export const dynamic = 'force-dynamic'

const KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarterfinal',
  'Semifinal',
  'Third Place',
  'Final',
])

async function settleAuditLogs(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      predictions: {
        include: { match: true },
      },
    },
  })

  if (!user) return

  // Cleanup: remove booster logs for Group Stage matches (they should not have booster points)
  const groupStageMatches = user.predictions
    .filter((p) => !KNOCKOUT_ROUNDS.has(p.match.round))
    .map((p) => p.matchId)
  if (groupStageMatches.length > 0) {
    await prisma.pointAuditLog.deleteMany({
      where: {
        userId,
        matchId: { in: groupStageMatches },
        category: { in: ['score', 'corner', 'scorer'] },
      },
    })
  }

  const fifaByMatchNum: Map<number, FifaMatch> = new Map()
  try {
    const matches = await getAllMatches()
    for (const m of matches) {
      fifaByMatchNum.set(m.MatchNumber, m)
    }
  } catch {
    // FIFA API down
  }

  function getMatchResult(match: { id: number; result: string | null }): string | null {
    if (match.result) return match.result
    const fifa = fifaByMatchNum.get(match.id)
    if (!fifa || !isFinished(fifa)) return null
    const hs = getHomeScore(fifa)
    const as = getAwayScore(fifa)
    if (hs > as) return 'Team A'
    if (hs < as) return 'Team B'
    return 'Draw'
  }

  const logsToCreate: Array<{
    userId: string
    matchId: number
    category: string
    points: number
    detail: string
  }> = []

  for (const pred of user.predictions) {
    const result = getMatchResult(pred.match)
    if (!result) continue

    const fifa = fifaByMatchNum.get(pred.matchId)
    if (!fifa) continue

    const homeScore = getHomeScore(fifa)
    const awayScore = getAwayScore(fifa)
    const homeTeamId = fifa.Home?.IdTeam ?? ''
    const awayTeamId = fifa.Away?.IdTeam ?? ''

    const isKnockout = KNOCKOUT_ROUNDS.has(pred.match.round)

    // For knockout matches, fetch match detail to get 90-minute scores
    let matchDetail = null
    if (isKnockout && homeTeamId && awayTeamId) {
      try {
        matchDetail = await getMatchDetail(fifa.IdMatch)
      } catch {
        // Fall back to final scores
      }
    }

    // Use 90-minute scores for knockout matches, final scores for group stage
    let effectiveHomeScore = homeScore
    let effectiveAwayScore = awayScore
    if (matchDetail) {
      const score90 = get90MinScore(matchDetail)
      effectiveHomeScore = score90.home
      effectiveAwayScore = score90.away
    }

    // Check existing logs for this user+match
    const existingLogs = await prisma.pointAuditLog.findMany({
      where: { userId, matchId: pred.matchId },
    })
    const existingCategories = new Set(existingLogs.map((l) => l.category))

    // 1. Prediction (Win/Draw/Lose)
    if (!existingCategories.has('prediction')) {
      const correct = pred.pick === result
      const pts = correct ? (isKnockout ? 2 : 1) : 0
      const teamA = pred.match.teamA
      const teamB = pred.match.teamB
      const pickLabel = pred.pick === 'Team A' ? teamA : pred.pick === 'Team B' ? teamB : 'Draw'
      const resultLabel = result === 'Team A' ? teamA : result === 'Team B' ? teamB : 'Draw'

      logsToCreate.push({
        userId,
        matchId: pred.matchId,
        category: 'prediction',
        points: pts,
        detail: correct
          ? `Correct: picked ${pickLabel} — Result: ${resultLabel} (${isKnockout ? 'Knockout +2' : 'Group +1'})`
          : `Wrong: picked ${pickLabel} — Result: ${resultLabel}`,
      })
    }

    // Booster points only apply to Knockout matches (R32+)
    if (!isKnockout) continue

    // 2. Score prediction (uses 90-minute scores)
    if (!existingCategories.has('score') && pred.homeScore !== null && pred.awayScore !== null) {
      const correct = pred.homeScore === effectiveHomeScore && pred.awayScore === effectiveAwayScore
      logsToCreate.push({
        userId,
        matchId: pred.matchId,
        category: 'score',
        points: correct ? 3 : -1,
        detail: correct
          ? `Correct Score: predicted ${pred.homeScore}-${pred.awayScore}, actual ${effectiveHomeScore}-${effectiveAwayScore} (90min)`
          : `Wrong Score: predicted ${pred.homeScore}-${pred.awayScore}, actual ${effectiveHomeScore}-${effectiveAwayScore} (90min)`,
      })
    }

    // 3. Corner prediction (requires timeline data)
    if (!existingCategories.has('corner') && pred.cornersPick && homeTeamId && awayTeamId) {
      try {
        const timeline = await getMatchTimeline(fifa.IdMatch, false, true)
        const stats = deriveStatsFromTimeline(timeline, homeTeamId, awayTeamId)

        if (stats) {
          let actualCornersResult: string
          if (stats.home.corners > stats.away.corners) actualCornersResult = 'Team A'
          else if (stats.home.corners < stats.away.corners) actualCornersResult = 'Team B'
          else actualCornersResult = 'Draw'

          const correct = pred.cornersPick === actualCornersResult
          const teamA = pred.match.teamA
          const teamB = pred.match.teamB
          const pickLabel = pred.cornersPick === 'Team A' ? teamA : pred.cornersPick === 'Team B' ? teamB : 'Draw'
          const actualLabel = actualCornersResult === 'Team A' ? teamA : actualCornersResult === 'Team B' ? teamB : 'Draw'

          logsToCreate.push({
            userId,
            matchId: pred.matchId,
            category: 'corner',
            points: correct ? 2 : -1,
            detail: correct
              ? `Correct Corners: picked ${pickLabel} — Actual: ${actualLabel} (${stats.home.corners}-${stats.away.corners})`
              : `Wrong Corners: picked ${pickLabel} — Actual: ${actualLabel} (${stats.home.corners}-${stats.away.corners})`,
          })
        }
      } catch {
        // Timeline fetch failed, skip corner audit
      }
    }

    // 4. Goal scorer prediction (uses regular time goals only - 90 minutes)
    if (!existingCategories.has('scorer') && (pred.goalScorerId || pred.goalScorer) && matchDetail) {
      const detailHomePlayers = matchDetail.HomeTeam?.Players ?? []
      const detailAwayPlayers = matchDetail.AwayTeam?.Players ?? []
      // Filter to regular time goals only (exclude extra time)
      const homeGoals = filterRegularTimeGoals(matchDetail.HomeTeam?.Goals ?? [])
      const awayGoals = filterRegularTimeGoals(matchDetail.AwayTeam?.Goals ?? [])
      const homeScorers = parseScorers(homeGoals, detailHomePlayers, detailAwayPlayers, homeTeamId, awayTeamId)
      const awayScorers = parseScorers(awayGoals, detailHomePlayers, detailAwayPlayers, homeTeamId, awayTeamId)
      const homeScorerIds = parseScorerIds(homeGoals)
      const awayScorerIds = parseScorerIds(awayGoals)
      const allScorerIds = [...homeScorerIds, ...awayScorerIds]
      const allScorers = [...homeScorers, ...awayScorers]

      let goals = 0
      if (pred.goalScorerId) {
        goals = allScorerIds.filter((id) => id === pred.goalScorerId).length
      } else if (pred.goalScorer) {
        const name = pred.goalScorer.toUpperCase().replace(/\s+/g, ' ').trim()
        goals = allScorers.filter((s) => {
          const scorerName = s.toUpperCase().replace(/ \(OG\)/, '').replace(/\s+\d+.*$/, '').replace(/\s+$/, '').trim()
          if (scorerName === name) return true
          const scorerParts = scorerName.split(' ')
          const scorerLast = scorerParts[scorerParts.length - 1]
          const nameParts = name.split(' ')
          const nameLast = nameParts[nameParts.length - 1]
          return scorerLast === nameLast && scorerLast.length > 2
        }).length
      }

      const correct = goals > 0
      logsToCreate.push({
        userId,
        matchId: pred.matchId,
        category: 'scorer',
        points: correct ? goals * 4 : -2,
        detail: correct
          ? `Correct Scorer: ${pred.goalScorer} scored ${goals} goal${goals > 1 ? 's' : ''} in 90min (+${goals * 4})`
          : `Wrong Scorer: ${pred.goalScorer} did not score in 90min`,
      })
    }
  }

  // Batch insert
  if (logsToCreate.length > 0) {
    await prisma.pointAuditLog.createMany({
      data: logsToCreate,
      skipDuplicates: true,
    })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // Settle any missing logs first
  await settleAuditLogs(userId)

  const logs = await prisma.pointAuditLog.findMany({
    where: { userId },
    include: {
      match: {
        select: {
          id: true,
          teamA: true,
          teamB: true,
          round: true,
          stage: true,
          date: true,
          result: true,
        },
      },
    },
    orderBy: [{ match: { date: 'desc' } }, { category: 'asc' }],
  })

  // Group by match
  const byMatch = new Map<number, typeof logs>()
  for (const log of logs) {
    const arr = byMatch.get(log.matchId) ?? []
    arr.push(log)
    byMatch.set(log.matchId, arr)
  }

  const result = [...byMatch.entries()].map(([matchId, matchLogs]) => {
    const match = matchLogs[0].match
    const totalPoints = matchLogs.reduce((sum, l) => sum + l.points, 0)
    return {
      matchId,
      match,
      totalPoints,
      logs: matchLogs.map((l) => ({
        id: l.id,
        category: l.category,
        points: l.points,
        detail: l.detail,
        createdAt: l.createdAt,
      })),
    }
  })

  const grandTotal = logs.reduce((sum, l) => sum + l.points, 0)

  return NextResponse.json({ matches: result, grandTotal })
}
