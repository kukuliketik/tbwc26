import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAllMatches, isFinished, getHomeScore, getAwayScore, FifaMatch } from '@/lib/fifa-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Fetch live scores to compute results
  let fifaByMatchNum: Map<number, FifaMatch> = new Map()
  try {
    const matches = await getAllMatches()
    for (const m of matches) {
      fifaByMatchNum.set(m.MatchNumber, m)
    }
  } catch {
    // FIFA API down — fall back to DB results
  }

  function getResult(match: { id: number; result: string | null }): string | null {
    if (match.result) return match.result
    const fifa = fifaByMatchNum.get(match.id)
    if (!fifa || !isFinished(fifa)) return null
    const hs = getHomeScore(fifa)
    const as = getAwayScore(fifa)
    if (hs > as) return 'Team A'
    if (hs < as) return 'Team B'
    return 'Draw'
  }

  const users = await prisma.user.findMany({
    where: { accounts: { some: {} } },
    include: {
      predictions: {
        include: { match: true },
      },
    },
  })

  const leaderboard = users
    .map((user) => {
      const finishedPredictions = user.predictions.filter(
        (p) => getResult(p.match) !== null
      )
      const totalFinished = finishedPredictions.length
      const correctPredictions = finishedPredictions.filter(
        (p) => p.pick === getResult(p.match)
      ).length
      const points = correctPredictions
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
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return b.accuracy - a.accuracy
    })

  return NextResponse.json(leaderboard)
}
