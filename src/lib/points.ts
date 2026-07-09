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
  FifaMatchDetail,
} from '@/lib/fifa-api'

export const KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarterfinal',
  'Semifinal',
  'Third Place',
  'Final',
])

export type PointLogRow = {
  matchId: number
  category: string
  points: number
}

type PredictionWithMatch = {
  matchId: number
  pick: string
  homeScore: number | null
  awayScore: number | null
  cornersPick: string | null
  goalScorer: string | null
  goalScorerId: string | null
  match: {
    id: number
    round: string
    result: string | null
    teamA: string
    teamB: string
  }
}

type MatchSettlementContext = {
  result: string
  effectiveHomeScore: number
  effectiveAwayScore: number
  teamAName: string
  teamBName: string
  isKnockout: boolean
  matchDetail: FifaMatchDetail | null
  cornerStats: { home: { corners: number }; away: { corners: number } } | null
}

/**
 * Fetch FIFA matches map keyed by MatchNumber.
 * Uses existing fifa-api caching; never mutates DB.
 */
export async function loadFifaByMatchNum(): Promise<Map<number, FifaMatch>> {
  const map = new Map<number, FifaMatch>()
  try {
    const matches = await getAllMatches()
    for (const m of matches) {
      map.set(m.MatchNumber, m)
    }
  } catch {
    // empty map — callers fall back to DB match.result
  }
  return map
}

function resolveMatchResult(
  match: PredictionWithMatch['match'],
  fifa: FifaMatch | undefined,
  matchDetail: FifaMatchDetail | null
): { result: string | null; home: number; away: number } {
  let home = fifa ? getHomeScore(fifa) : 0
  let away = fifa ? getAwayScore(fifa) : 0
  if (matchDetail) {
    const score90 = get90MinScore(matchDetail)
    home = score90.home
    away = score90.away
  }

  // Prefer 90-min derived result for knockouts when detail is available;
  // otherwise use DB result, then FIFA full-time score.
  if (matchDetail && KNOCKOUT_ROUNDS.has(match.round)) {
    if (home > away) return { result: 'Team A', home, away }
    if (home < away) return { result: 'Team B', home, away }
    return { result: 'Draw', home, away }
  }

  if (match.result) {
    return { result: match.result, home, away }
  }

  if (fifa && isFinished(fifa)) {
    if (home > away) return { result: 'Team A', home, away }
    if (home < away) return { result: 'Team B', home, away }
    return { result: 'Draw', home, away }
  }

  return { result: null, home, away }
}

function isMatchFinished(
  match: PredictionWithMatch['match'],
  fifa: FifaMatch | undefined
): boolean {
  if (match.result) return true
  if (fifa && isFinished(fifa)) return true
  return false
}

function computePredictionPoints(
  pred: PredictionWithMatch,
  result: string,
  isKnockout: boolean
): { points: number; correct: boolean; detail: string } {
  const correct = pred.pick === result
  const points = correct ? (isKnockout ? 2 : 1) : 0
  return {
    points,
    correct,
    detail: correct
      ? `Correct pick (${isKnockout ? 'Knockout +2' : 'Group +1'})`
      : 'Wrong pick',
  }
}

function computeScorePoints(
  pred: PredictionWithMatch,
  home: number,
  away: number
): { points: number; detail: string } | null {
  if (pred.homeScore === null || pred.awayScore === null) return null
  const correct = pred.homeScore === home && pred.awayScore === away
  return {
    points: correct ? 3 : -1,
    detail: correct
      ? `Correct Score: predicted ${pred.homeScore}-${pred.awayScore}, actual ${home}-${away} (90min)`
      : `Wrong Score: predicted ${pred.homeScore}-${pred.awayScore}, actual ${home}-${away} (90min)`,
  }
}

function computeCornerPoints(
  pred: PredictionWithMatch,
  cornerStats: { home: { corners: number }; away: { corners: number } },
  teamAName: string,
  teamBName: string
): { points: number; detail: string } | null {
  if (!pred.cornersPick) return null
  let actualResult: string
  if (cornerStats.home.corners > cornerStats.away.corners) actualResult = 'Team A'
  else if (cornerStats.home.corners < cornerStats.away.corners) actualResult = 'Team B'
  else actualResult = 'Draw'

  const correct = pred.cornersPick === actualResult
  const pickLabel =
    pred.cornersPick === 'Team A' ? teamAName : pred.cornersPick === 'Team B' ? teamBName : 'Draw'
  const actualLabel =
    actualResult === 'Team A' ? teamAName : actualResult === 'Team B' ? teamBName : 'Draw'

  return {
    points: correct ? 2 : -1,
    detail: correct
      ? `Correct Corners: picked ${pickLabel} — Actual: ${actualLabel} (${cornerStats.home.corners}-${cornerStats.away.corners})`
      : `Wrong Corners: picked ${pickLabel} — Actual: ${actualLabel} (${cornerStats.home.corners}-${cornerStats.away.corners})`,
  }
}

function computeScorerPoints(
  pred: PredictionWithMatch,
  matchDetail: FifaMatchDetail,
  homeTeamId: string,
  awayTeamId: string
): { points: number; detail: string } | null {
  if (!pred.goalScorerId && !pred.goalScorer) return null

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
      const scorerName = s
        .toUpperCase()
        .replace(/ \(OG\)/, '')
        .replace(/\s+\d+.*$/, '')
        .replace(/\s+$/, '')
        .trim()
      if (scorerName === name) return true
      const scorerLast = scorerName.split(' ').pop() ?? ''
      const nameLast = name.split(' ').pop() ?? ''
      return scorerLast === nameLast && scorerLast.length > 2
    }).length
  }

  const correct = goals > 0
  return {
    points: correct ? goals * 4 : -2,
    detail: correct
      ? `Correct Scorer: ${pred.goalScorer} scored ${goals} goal${goals > 1 ? 's' : ''} in 90min (+${goals * 4})`
      : `Wrong Scorer: ${pred.goalScorer} did not score in 90min`,
  }
}

/**
 * Build per-match settlement context (FIFA detail, corners, 90-min scores).
 * Read-only — does not write to DB.
 */
async function buildMatchContext(
  match: PredictionWithMatch['match'],
  fifa: FifaMatch | undefined,
  needBoosters: boolean
): Promise<MatchSettlementContext | null> {
  if (!isMatchFinished(match, fifa)) return null

  const isKnockout = KNOCKOUT_ROUNDS.has(match.round)
  const teamAName = fifa ? getHomeTeam(fifa) : match.teamA
  const teamBName = fifa ? getAwayTeam(fifa) : match.teamB
  const homeTeamId = fifa?.Home?.IdTeam ?? ''
  const awayTeamId = fifa?.Away?.IdTeam ?? ''

  let matchDetail: FifaMatchDetail | null = null
  if (fifa && homeTeamId && awayTeamId && (isKnockout || needBoosters)) {
    try {
      matchDetail = await getMatchDetail(fifa.IdMatch)
    } catch {
      matchDetail = null
    }
  }

  const resolved = resolveMatchResult(match, fifa, matchDetail)
  if (!resolved.result) return null

  let cornerStats: MatchSettlementContext['cornerStats'] = null
  if (isKnockout && needBoosters && fifa && homeTeamId && awayTeamId) {
    try {
      const timeline = await getMatchTimeline(fifa.IdMatch, false, true)
      cornerStats = deriveStatsFromTimeline(timeline, homeTeamId, awayTeamId)
    } catch {
      cornerStats = null
    }
  }

  return {
    result: resolved.result,
    effectiveHomeScore: resolved.home,
    effectiveAwayScore: resolved.away,
    teamAName,
    teamBName,
    isKnockout,
    matchDetail,
    cornerStats,
  }
}

export type AggregatedUserPoints = {
  points: number
  correctPredictions: number
  totalFinished: number
  /** In-memory computed logs (not necessarily persisted) */
  logs: PointLogRow[]
}

/**
 * Compute final points for a user in memory from predictions + FIFA/DB results.
 * Prefer existing PointAuditLog rows when present (stable, no DB mutation).
 * For missing categories on finished matches, compute live so totals are final.
 *
 * Does NOT write or delete PointAuditLog rows.
 */
export async function aggregateUserPoints(
  predictions: PredictionWithMatch[],
  existingLogs: PointLogRow[],
  fifaByMatchNum: Map<number, FifaMatch>
): Promise<AggregatedUserPoints> {
  const logsByMatch = new Map<number, Map<string, number>>()
  for (const log of existingLogs) {
    // Ignore invalid group-stage booster logs if any remain in DB
    const pred = predictions.find((p) => p.matchId === log.matchId)
    if (pred && !KNOCKOUT_ROUNDS.has(pred.match.round) && log.category !== 'prediction') {
      continue
    }
    let cats = logsByMatch.get(log.matchId)
    if (!cats) {
      cats = new Map()
      logsByMatch.set(log.matchId, cats)
    }
    cats.set(log.category, log.points)
  }

  // Group predictions by match
  const byMatch = new Map<number, PredictionWithMatch>()
  for (const pred of predictions) {
    byMatch.set(pred.matchId, pred)
  }

  // Determine which finished matches need live computation (missing categories)
  const matchesNeedingContext: number[] = []
  for (const [matchId, pred] of byMatch) {
    const fifa = fifaByMatchNum.get(matchId)
    if (!isMatchFinished(pred.match, fifa)) continue
    const existing = logsByMatch.get(matchId) ?? new Map()
    const isKnockout = KNOCKOUT_ROUNDS.has(pred.match.round)
    if (!existing.has('prediction')) {
      matchesNeedingContext.push(matchId)
      continue
    }
    if (isKnockout) {
      if (pred.homeScore !== null && pred.awayScore !== null && !existing.has('score')) {
        matchesNeedingContext.push(matchId)
        continue
      }
      if (pred.cornersPick && !existing.has('corner')) {
        matchesNeedingContext.push(matchId)
        continue
      }
      if ((pred.goalScorerId || pred.goalScorer) && !existing.has('scorer')) {
        matchesNeedingContext.push(matchId)
      }
    }
  }

  // Cache match contexts to avoid duplicate FIFA detail calls
  const contextCache = new Map<number, MatchSettlementContext | null>()
  for (const matchId of matchesNeedingContext) {
    const pred = byMatch.get(matchId)!
    const fifa = fifaByMatchNum.get(matchId)
    const needBoosters =
      KNOCKOUT_ROUNDS.has(pred.match.round) &&
      (pred.homeScore !== null ||
        pred.awayScore !== null ||
        !!pred.cornersPick ||
        !!pred.goalScorer ||
        !!pred.goalScorerId)
    contextCache.set(matchId, await buildMatchContext(pred.match, fifa, needBoosters))
  }

  const finalLogs: PointLogRow[] = []
  let correctPredictions = 0
  const finishedMatchIds = new Set<number>()

  for (const [matchId, pred] of byMatch) {
    const fifa = fifaByMatchNum.get(matchId)
    if (!isMatchFinished(pred.match, fifa)) continue

    finishedMatchIds.add(matchId)
    const existing = logsByMatch.get(matchId) ?? new Map()
    const isKnockout = KNOCKOUT_ROUNDS.has(pred.match.round)
    const ctx = contextCache.get(matchId) ?? null

    // --- prediction ---
    if (existing.has('prediction')) {
      const pts = existing.get('prediction')!
      finalLogs.push({ matchId, category: 'prediction', points: pts })
      if (pts > 0) correctPredictions++
    } else {
      const result =
        ctx?.result ??
        resolveMatchResult(pred.match, fifa, null).result
      if (result) {
        const computed = computePredictionPoints(pred, result, isKnockout)
        finalLogs.push({ matchId, category: 'prediction', points: computed.points })
        if (computed.correct) correctPredictions++
      }
    }

    if (!isKnockout) continue

    // --- score ---
    if (existing.has('score')) {
      finalLogs.push({ matchId, category: 'score', points: existing.get('score')! })
    } else if (ctx && pred.homeScore !== null && pred.awayScore !== null) {
      const computed = computeScorePoints(pred, ctx.effectiveHomeScore, ctx.effectiveAwayScore)
      if (computed) finalLogs.push({ matchId, category: 'score', points: computed.points })
    }

    // --- corner ---
    if (existing.has('corner')) {
      finalLogs.push({ matchId, category: 'corner', points: existing.get('corner')! })
    } else if (ctx?.cornerStats && pred.cornersPick) {
      const computed = computeCornerPoints(pred, ctx.cornerStats, ctx.teamAName, ctx.teamBName)
      if (computed) finalLogs.push({ matchId, category: 'corner', points: computed.points })
    }

    // --- scorer ---
    if (existing.has('scorer')) {
      finalLogs.push({ matchId, category: 'scorer', points: existing.get('scorer')! })
    } else if (ctx?.matchDetail && (pred.goalScorerId || pred.goalScorer) && fifa) {
      const homeTeamId = fifa.Home?.IdTeam ?? ''
      const awayTeamId = fifa.Away?.IdTeam ?? ''
      const computed = computeScorerPoints(pred, ctx.matchDetail, homeTeamId, awayTeamId)
      if (computed) finalLogs.push({ matchId, category: 'scorer', points: computed.points })
    }
  }

  const points = finalLogs.reduce((sum, l) => sum + l.points, 0)

  return {
    points,
    correctPredictions,
    totalFinished: finishedMatchIds.size,
    logs: finalLogs,
  }
}

/**
 * Persist only *missing* audit log categories for a user.
 * Never deletes or overwrites existing PointAuditLog rows (no DB data mutation of existing rows).
 * Used to keep the audit trail in sync after live aggregation.
 */
export async function settleMissingAuditLogs(
  userId: string,
  fifaByMatchNum: Map<number, FifaMatch>
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      predictions: { include: { match: true } },
      pointLogs: { select: { matchId: true, category: true, points: true } },
    },
  })
  if (!user) return

  // Strip invalid group-stage booster logs only (they should never exist)
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

  const existingByMatch = new Map<number, Set<string>>()
  const remainingLogs = await prisma.pointAuditLog.findMany({
    where: { userId },
    select: { matchId: true, category: true },
  })
  for (const log of remainingLogs) {
    const cats = existingByMatch.get(log.matchId) ?? new Set()
    cats.add(log.category)
    existingByMatch.set(log.matchId, cats)
  }

  const logsToCreate: Array<{
    userId: string
    matchId: number
    category: string
    points: number
    detail: string
  }> = []

  // Collect matches that need missing categories
  const needsWork = user.predictions.filter((pred) => {
    const fifa = fifaByMatchNum.get(pred.matchId)
    if (!isMatchFinished(pred.match, fifa)) return false
    const existing = existingByMatch.get(pred.matchId)
    if (!existing || !existing.has('prediction')) return true
    if (!KNOCKOUT_ROUNDS.has(pred.match.round)) return false
    if (pred.homeScore !== null && pred.awayScore !== null && !existing.has('score')) return true
    if (pred.cornersPick && !existing.has('corner')) return true
    if ((pred.goalScorerId || pred.goalScorer) && !existing.has('scorer')) return true
    return false
  })

  if (needsWork.length === 0) return

  const byMatch = new Map<number, typeof needsWork>()
  for (const pred of needsWork) {
    const arr = byMatch.get(pred.matchId) ?? []
    arr.push(pred)
    byMatch.set(pred.matchId, arr)
  }

  for (const [matchId, preds] of byMatch) {
    const pred = preds[0]
    const fifa = fifaByMatchNum.get(matchId)
    const needBoosters =
      KNOCKOUT_ROUNDS.has(pred.match.round) &&
      preds.some(
        (p) =>
          (p.homeScore !== null && p.awayScore !== null) ||
          !!p.cornersPick ||
          !!p.goalScorer ||
          !!p.goalScorerId
      )
    const ctx = await buildMatchContext(pred.match, fifa, needBoosters)
    if (!ctx) continue

    const existing = existingByMatch.get(matchId) ?? new Set()
    const homeTeamId = fifa?.Home?.IdTeam ?? ''
    const awayTeamId = fifa?.Away?.IdTeam ?? ''

    for (const p of preds) {
      if (!existing.has('prediction')) {
        const computed = computePredictionPoints(p, ctx.result, ctx.isKnockout)
        const pickLabel =
          p.pick === 'Team A' ? ctx.teamAName : p.pick === 'Team B' ? ctx.teamBName : 'Draw'
        const resultLabel =
          ctx.result === 'Team A'
            ? ctx.teamAName
            : ctx.result === 'Team B'
              ? ctx.teamBName
              : 'Draw'
        logsToCreate.push({
          userId,
          matchId,
          category: 'prediction',
          points: computed.points,
          detail: computed.correct
            ? `Correct: picked ${pickLabel} — Result: ${resultLabel} (${ctx.isKnockout ? 'Knockout +2' : 'Group +1'})`
            : `Wrong: picked ${pickLabel} — Result: ${resultLabel}`,
        })
        existing.add('prediction')
      }

      if (!ctx.isKnockout) continue

      if (!existing.has('score') && p.homeScore !== null && p.awayScore !== null) {
        const computed = computeScorePoints(p, ctx.effectiveHomeScore, ctx.effectiveAwayScore)
        if (computed) {
          logsToCreate.push({
            userId,
            matchId,
            category: 'score',
            points: computed.points,
            detail: computed.detail,
          })
          existing.add('score')
        }
      }

      if (!existing.has('corner') && p.cornersPick && ctx.cornerStats) {
        const computed = computeCornerPoints(p, ctx.cornerStats, ctx.teamAName, ctx.teamBName)
        if (computed) {
          logsToCreate.push({
            userId,
            matchId,
            category: 'corner',
            points: computed.points,
            detail: computed.detail,
          })
          existing.add('corner')
        }
      }

      if (
        !existing.has('scorer') &&
        (p.goalScorerId || p.goalScorer) &&
        ctx.matchDetail &&
        fifa
      ) {
        const computed = computeScorerPoints(p, ctx.matchDetail, homeTeamId, awayTeamId)
        if (computed) {
          logsToCreate.push({
            userId,
            matchId,
            category: 'scorer',
            points: computed.points,
            detail: computed.detail,
          })
          existing.add('scorer')
        }
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

export type PointsBreakdownLog = {
  id: string
  category: string
  points: number
  detail: string
  createdAt: string
}

export type PointsBreakdownMatch = {
  matchId: number
  match: {
    id: number
    teamA: string
    teamB: string
    round: string
    stage: string
    date: string
    result: string | null
  }
  totalPoints: number
  logs: PointsBreakdownLog[]
}

export type UserPointsBreakdown = {
  userId: string
  name: string | null
  email: string | null
  image: string | null
  points: number
  correctPredictions: number
  totalPredictions: number
  totalFinished: number
  accuracy: number
  predictionPoints: number
  boosterPoints: number
  matches: PointsBreakdownMatch[]
}

/**
 * Single source of truth for a user's points.
 * Leaderboard and /points audit must both use this so totals always match.
 *
 * Flow:
 * 1. Optionally persist missing audit categories (create-only)
 * 2. Re-read logs + aggregate final points in memory
 * 3. Build per-match breakdown strictly from the same aggregated logs
 */
export async function getUserPointsBreakdown(
  userId: string,
  fifaByMatchNum: Map<number, FifaMatch>,
  options: { persistMissing?: boolean } = {}
): Promise<UserPointsBreakdown | null> {
  const { persistMissing = false } = options

  if (persistMissing) {
    try {
      await settleMissingAuditLogs(userId, fifaByMatchNum)
    } catch {
      // best-effort; aggregation still produces final points
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      predictions: {
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
      },
      pointLogs: {
        select: {
          id: true,
          matchId: true,
          category: true,
          points: true,
          detail: true,
          createdAt: true,
        },
      },
    },
  })

  if (!user) return null

  const aggregated = await aggregateUserPoints(
    user.predictions,
    user.pointLogs.map((l) => ({
      matchId: l.matchId,
      category: l.category,
      points: l.points,
    })),
    fifaByMatchNum
  )

  // DB detail lookup for display (points still come only from aggregation)
  const dbDetail = new Map<string, { id: string; detail: string; createdAt: Date }>()
  for (const log of user.pointLogs) {
    dbDetail.set(`${log.matchId}:${log.category}`, {
      id: log.id,
      detail: log.detail,
      createdAt: log.createdAt,
    })
  }

  const matchMeta = new Map(
    user.predictions.map((p) => [
      p.matchId,
      p.match as {
        id: number
        teamA: string
        teamB: string
        round: string
        stage: string
        date: Date
        result: string | null
      },
    ])
  )

  // Group aggregated logs by match — this is the ONLY points source for the breakdown
  const byMatch = new Map<number, PointsBreakdownLog[]>()
  for (const log of aggregated.logs) {
    const key = `${log.matchId}:${log.category}`
    const db = dbDetail.get(key)
    const arr = byMatch.get(log.matchId) ?? []
    arr.push({
      id: db?.id ?? `live-${log.matchId}-${log.category}`,
      category: log.category,
      points: log.points,
      detail: db?.detail ?? 'Settled',
      createdAt: (db?.createdAt ?? new Date()).toISOString(),
    })
    byMatch.set(log.matchId, arr)
  }

  const categoryOrder = ['prediction', 'score', 'corner', 'scorer']
  const matches: PointsBreakdownMatch[] = [...byMatch.entries()].map(([matchId, logs]) => {
    logs.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category))
    const meta = matchMeta.get(matchId)
    const fifa = fifaByMatchNum.get(matchId)
    return {
      matchId,
      match: {
        id: matchId,
        teamA: fifa ? getHomeTeam(fifa) : (meta?.teamA ?? 'TBD'),
        teamB: fifa ? getAwayTeam(fifa) : (meta?.teamB ?? 'TBD'),
        round: fifa ? getRound(fifa) : (meta?.round ?? ''),
        stage: meta?.stage ?? '',
        date: (meta?.date ?? new Date(0)).toISOString(),
        result: meta?.result ?? null,
      },
      totalPoints: logs.reduce((s, l) => s + l.points, 0),
      logs,
    }
  })

  matches.sort((a, b) => new Date(b.match.date).getTime() - new Date(a.match.date).getTime())

  // Sanity: sum of match totals must equal aggregated.points
  const predictionPoints = aggregated.logs
    .filter((l) => l.category === 'prediction')
    .reduce((s, l) => s + l.points, 0)
  const boosterPoints = aggregated.points - predictionPoints

  const accuracy =
    aggregated.totalFinished > 0
      ? Math.round((aggregated.correctPredictions / aggregated.totalFinished) * 10000) / 100
      : 0

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    points: aggregated.points,
    correctPredictions: aggregated.correctPredictions,
    totalPredictions: user.predictions.length,
    totalFinished: aggregated.totalFinished,
    accuracy,
    predictionPoints,
    boosterPoints,
    matches,
  }
}
