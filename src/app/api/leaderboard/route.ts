import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getAllMatches,
  isFinished,
  getHomeScore,
  getAwayScore,
  getHomeTeam,
  getAwayTeam,
  getMatchDetail,
  getMatchTimeline,
  deriveStatsFromTimeline,
  parseScorers,
  parseScorerIds,
  filterRegularTimeGoals,
  get90MinScore,
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

async function settleAuditLogsForUser(userId: string, fifaByMatchNum: Map<number, FifaMatch>) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      predictions: {
        include: { match: true },
      },
    },
  })

  if (!user) return

  const allExistingLogs = await prisma.pointAuditLog.findMany({
    where: { userId },
    select: { matchId: true, category: true },
  })
  const existingByMatch = new Map<number, Set<string>>()
  for (const log of allExistingLogs) {
    const cats = existingByMatch.get(log.matchId) ?? new Set()
    cats.add(log.category)
    existingByMatch.set(log.matchId, cats)
  }

  // Cleanup: remove booster logs for Group Stage
  const groupStageMatchIds = user.predictions
    .filter((p) => !KNOCKOUT_ROUNDS.has(p.match.round))
    .map((p) => p.matchId)
  if (groupStageMatchIds.length > 0) {
    await prisma.pointAuditLog.deleteMany({
      where: {
        userId,
        matchId: { in: groupStageMatchIds },
        category: { in: ['score', 'corner', 'scorer'] },
      },
    })
  }

  const needsSettling = user.predictions.filter((pred) => {
    const result = pred.match.result
    const fifa = fifaByMatchNum.get(pred.matchId)
    const isFinishedInFifa = fifa ? isFinished(fifa) : false
    if (!result && !isFinishedInFifa) return false
    const existing = existingByMatch.get(pred.matchId)
    if (!existing) return true
    if (!existing.has('prediction')) return true
    const isKnockout = KNOCKOUT_ROUNDS.has(pred.match.round)
    if (!isKnockout) return false
    if (pred.homeScore !== null && pred.awayScore !== null && !existing.has('score')) return true
    if (pred.cornersPick && !existing.has('corner')) return true
    if ((pred.goalScorerId || pred.goalScorer) && !existing.has('scorer')) return true
    return false
  })

  if (needsSettling.length === 0) return

  const logsToCreate: Array<{
    userId: string
    matchId: number
    category: string
    points: number
    detail: string
  }> = []

  const predsByMatch = new Map<number, typeof needsSettling>()
  for (const pred of needsSettling) {
    const arr = predsByMatch.get(pred.matchId) ?? []
    arr.push(pred)
    predsByMatch.set(pred.matchId, arr)
  }

  for (const [matchId, preds] of predsByMatch) {
    const match = preds[0].match
    const fifa = fifaByMatchNum.get(matchId)
    if (!fifa || !isFinished(fifa)) continue

    const homeTeamId = fifa.Home?.IdTeam ?? ''
    const awayTeamId = fifa.Away?.IdTeam ?? ''
    const isKnockout = KNOCKOUT_ROUNDS.has(match.round)
    const teamAName = getHomeTeam(fifa)
    const teamBName = getAwayTeam(fifa)

    let matchDetail = null
    if (homeTeamId && awayTeamId) {
      try {
        matchDetail = await getMatchDetail(fifa.IdMatch)
      } catch {}
    }

    let effectiveHomeScore = getHomeScore(fifa)
    let effectiveAwayScore = getAwayScore(fifa)
    if (matchDetail) {
      const score90 = get90MinScore(matchDetail)
      effectiveHomeScore = score90.home
      effectiveAwayScore = score90.away
    }

    let result: string
    if (match.result) {
      result = match.result
    } else {
      if (effectiveHomeScore > effectiveAwayScore) result = 'Team A'
      else if (effectiveHomeScore < effectiveAwayScore) result = 'Team B'
      else result = 'Draw'
    }

    let cornerStats: { home: { corners: number }; away: { corners: number } } | null = null
    if (isKnockout && preds.some((p) => p.cornersPick) && homeTeamId && awayTeamId) {
      try {
        const timeline = await getMatchTimeline(fifa.IdMatch, false, true)
        cornerStats = deriveStatsFromTimeline(timeline, homeTeamId, awayTeamId)
      } catch {}
    }

    const existing = existingByMatch.get(matchId) ?? new Set()

    for (const pred of preds) {
      if (!existing.has('prediction')) {
        const correct = pred.pick === result
        const pts = correct ? (isKnockout ? 2 : 1) : 0
        const pickLabel = pred.pick === 'Team A' ? teamAName : pred.pick === 'Team B' ? teamBName : 'Draw'
        const resultLabel = result === 'Team A' ? teamAName : result === 'Team B' ? teamBName : 'Draw'

        logsToCreate.push({
          userId,
          matchId,
          category: 'prediction',
          points: pts,
          detail: correct
            ? `Correct: picked ${pickLabel} — Result: ${resultLabel} (${isKnockout ? 'Knockout +2' : 'Group +1'})`
            : `Wrong: picked ${pickLabel} — Result: ${resultLabel}`,
        })
        existing.add('prediction')
      }

      if (!isKnockout) continue

      if (!existing.has('score') && pred.homeScore !== null && pred.awayScore !== null) {
        const correct = pred.homeScore === effectiveHomeScore && pred.awayScore === effectiveAwayScore
        logsToCreate.push({
          userId,
          matchId,
          category: 'score',
          points: correct ? 3 : -1,
          detail: correct
            ? `Correct Score: predicted ${pred.homeScore}-${pred.awayScore}, actual ${effectiveHomeScore}-${effectiveAwayScore} (90min)`
            : `Wrong Score: predicted ${pred.homeScore}-${pred.awayScore}, actual ${effectiveHomeScore}-${effectiveAwayScore} (90min)`,
        })
        existing.add('score')
      }

      if (!existing.has('corner') && pred.cornersPick && cornerStats) {
        let actualResult: string
        if (cornerStats.home.corners > cornerStats.away.corners) actualResult = 'Team A'
        else if (cornerStats.home.corners < cornerStats.away.corners) actualResult = 'Team B'
        else actualResult = 'Draw'

        const correct = pred.cornersPick === actualResult
        const pickLabel = pred.cornersPick === 'Team A' ? teamAName : pred.cornersPick === 'Team B' ? teamBName : 'Draw'
        const actualLabel = actualResult === 'Team A' ? teamAName : actualResult === 'Team B' ? teamBName : 'Draw'

        logsToCreate.push({
          userId,
          matchId,
          category: 'corner',
          points: correct ? 2 : -1,
          detail: correct
            ? `Correct Corners: picked ${pickLabel} — Actual: ${actualLabel} (${cornerStats.home.corners}-${cornerStats.away.corners})`
            : `Wrong Corners: picked ${pickLabel} — Actual: ${actualLabel} (${cornerStats.home.corners}-${cornerStats.away.corners})`,
        })
        existing.add('corner')
      }

      if (!existing.has('scorer') && (pred.goalScorerId || pred.goalScorer) && matchDetail) {
        const detailHomePlayers = matchDetail.HomeTeam?.Players ?? []
        const detailAwayPlayers = matchDetail.AwayTeam?.Players ?? []
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
            const scorerLast = scorerName.split(' ').pop() ?? ''
            const nameLast = name.split(' ').pop() ?? ''
            return scorerLast === nameLast && scorerLast.length > 2
          }).length
        }

        const correct = goals > 0
        logsToCreate.push({
          userId,
          matchId,
          category: 'scorer',
          points: correct ? goals * 4 : -2,
          detail: correct
            ? `Correct Scorer: ${pred.goalScorer} scored ${goals} goal${goals > 1 ? 's' : ''} in 90min (+${goals * 4})`
            : `Wrong Scorer: ${pred.goalScorer} did not score in 90min`,
        })
        existing.add('scorer')
      }
    }
  }

  if (logsToCreate.length > 0) {
    await prisma.pointAuditLog.createMany({
      data: logsToCreate,
      skipDuplicates: true,
    })
  }
}

export async function GET() {
  // Fetch FIFA matches once for all users
  const fifaByMatchNum = new Map<number, FifaMatch>()
  try {
    const matches = await getAllMatches()
    for (const m of matches) {
      fifaByMatchNum.set(m.MatchNumber, m)
    }
  } catch {}

  const users = await prisma.user.findMany({
    where: { accounts: { some: {} } },
    include: {
      predictions: true,
      pointLogs: {
        select: { matchId: true, category: true, points: true },
      },
    },
  })

  // Settle audit logs for users who have predictions but are missing logs
  const usersWithPredictions = users.filter((u) => u.predictions.length > 0)
  const settledUserIds = new Set(users.filter((u) => u.pointLogs.length > 0).map((u) => u.id))
  const needsSettlement = usersWithPredictions.filter((u) => !settledUserIds.has(u.id))

  if (needsSettlement.length > 0) {
    // Run settlements in background — don't block the response
    Promise.all(
      needsSettlement.map((u) => settleAuditLogsForUser(u.id, fifaByMatchNum).catch(() => {}))
    ).catch(() => {})
  }

  // Also settle for users who already have logs but might need new ones
  const existingUsers = usersWithPredictions.filter((u) => settledUserIds.has(u.id))
  if (existingUsers.length > 0) {
    Promise.all(
      existingUsers.map((u) => settleAuditLogsForUser(u.id, fifaByMatchNum).catch(() => {}))
    ).catch(() => {})
  }

  const leaderboard = users.map((user) => {
    const points = user.pointLogs.reduce((sum, l) => sum + l.points, 0)
    const matchIds = new Set(user.pointLogs.map((l) => l.matchId))
    const correctPredictions = user.pointLogs.filter(
      (l) => l.category === 'prediction' && l.points > 0
    ).length

    const totalFinished = matchIds.size
    const accuracy = totalFinished > 0 ? (correctPredictions / totalFinished) * 100 : 0

    return {
      userId: user.id,
      name: user.name ?? 'Anonymous',
      email: user.email,
      image: user.image,
      points,
      correctPredictions,
      totalPredictions: user.predictions.length,
      totalFinished,
      accuracy: Math.round(accuracy * 100) / 100,
    }
  })

  leaderboard.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return b.accuracy - a.accuracy
  })

  return NextResponse.json(leaderboard)
}
