import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  getAllMatches,
  isFinished,
  getHomeScore,
  getAwayScore,
  getHomeTeam,
  getAwayTeam,
  getRound,
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

  // Get all existing logs for this user in one query
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

  // Cleanup: remove stale scorer/score logs for finished knockout matches
  // so they get re-generated with current FIFA data (e.g. Period 3 goals fix)
  const finishedKnockoutMatchIds = user.predictions
    .filter((p) => {
      const fifa = fifaByMatchNum.get(p.matchId)
      return KNOCKOUT_ROUNDS.has(p.match.round) && fifa ? isFinished(fifa) : false
    })
    .map((p) => p.matchId)
  if (finishedKnockoutMatchIds.length > 0) {
    await prisma.pointAuditLog.deleteMany({
      where: {
        userId,
        matchId: { in: finishedKnockoutMatchIds },
        category: { in: ['score', 'scorer'] },
      },
    })
  }

  // Fetch FIFA matches first to check which matches are finished
  const fifaByMatchNum = new Map<number, FifaMatch>()
  try {
    const matches = await getAllMatches()
    for (const m of matches) {
      fifaByMatchNum.set(m.MatchNumber, m)
    }
  } catch {
    return
  }

  // Find predictions that need settling
  const needsSettling = user.predictions.filter((pred) => {
    const result = pred.match.result
    const fifa = fifaByMatchNum.get(pred.matchId)
    const isFinishedInFifa = fifa ? isFinished(fifa) : false
    
    // If no result in DB and not finished in FIFA, skip
    if (!result && !isFinishedInFifa) return false
    
    const existing = existingByMatch.get(pred.matchId)
    if (!existing) return true // No logs at all
    if (!existing.has('prediction')) return true
    const isKnockout = KNOCKOUT_ROUNDS.has(pred.match.round)
    if (!isKnockout) return false
    // Check if booster logs are missing
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

  // Group predictions by matchId to avoid duplicate FIFA calls
  const predsByMatch = new Map<number, typeof needsSettling>()
  for (const pred of needsSettling) {
    const arr = predsByMatch.get(pred.matchId) ?? []
    arr.push(pred)
    predsByMatch.set(pred.matchId, arr)
  }

  // Process each match
  for (const [matchId, preds] of predsByMatch) {
    const match = preds[0].match
    const fifa = fifaByMatchNum.get(matchId)
    if (!fifa || !isFinished(fifa)) continue

    const homeTeamId = fifa.Home?.IdTeam ?? ''
    const awayTeamId = fifa.Away?.IdTeam ?? ''
    const isKnockout = KNOCKOUT_ROUNDS.has(match.round)
    const teamAName = getHomeTeam(fifa)
    const teamBName = getAwayTeam(fifa)

    // For knockout matches, fetch detail for 90-min scores and scorers
    let matchDetail = null
    if (homeTeamId && awayTeamId) {
      try {
        matchDetail = await getMatchDetail(fifa.IdMatch)
      } catch {}
    }

    // Use 90-minute scores for result determination
    let effectiveHomeScore = getHomeScore(fifa)
    let effectiveAwayScore = getAwayScore(fifa)
    if (matchDetail) {
      const score90 = get90MinScore(matchDetail)
      effectiveHomeScore = score90.home
      effectiveAwayScore = score90.away
    }

    // Determine result based on 90-minute scores
    let result: string
    if (match.result) {
      result = match.result
    } else {
      if (effectiveHomeScore > effectiveAwayScore) result = 'Team A'
      else if (effectiveHomeScore < effectiveAwayScore) result = 'Team B'
      else result = 'Draw'
    }

    // Fetch timeline once for corner data
    let cornerStats: { home: { corners: number }; away: { corners: number } } | null = null
    if (isKnockout && preds.some((p) => p.cornersPick) && homeTeamId && awayTeamId) {
      try {
        const timeline = await getMatchTimeline(fifa.IdMatch, false, true)
        cornerStats = deriveStatsFromTimeline(timeline, homeTeamId, awayTeamId)
      } catch {}
    }

    const existing = existingByMatch.get(matchId) ?? new Set()

    for (const pred of preds) {
      // 1. Prediction
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

      // 2. Score
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

      // 3. Corners
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

      // 4. Scorer
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
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // Settle in background (don't await) so page loads fast
  settleAuditLogs(userId).catch(() => {})

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

  // Fetch FIFA matches to resolve actual team names
  const fifaByMatchNum = new Map<number, FifaMatch>()
  try {
    const fifaMatches = await getAllMatches()
    for (const m of fifaMatches) {
      fifaByMatchNum.set(m.MatchNumber, m)
    }
  } catch {}

  const result = [...byMatch.entries()].map(([matchId, matchLogs]) => {
    const match = matchLogs[0].match
    const totalPoints = matchLogs.reduce((sum, l) => sum + l.points, 0)
    const fifa = fifaByMatchNum.get(matchId)
    const enrichedMatch = {
      ...match,
      teamA: fifa ? getHomeTeam(fifa) : match.teamA,
      teamB: fifa ? getAwayTeam(fifa) : match.teamB,
      round: fifa ? getRound(fifa) : match.round,
    }
    return {
      matchId,
      match: enrichedMatch,
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
