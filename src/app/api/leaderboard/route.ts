import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAllGames, getHomeScore, getAwayScore, isFinished } from '@/lib/worldcup26-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Fetch live scores to compute results
  let liveGames: Record<string, { homeScore: number; awayScore: number; finished: boolean }> = {}
  try {
    const games = await getAllGames()
    for (const g of games) {
      liveGames[g.id] = {
        homeScore: getHomeScore(g),
        awayScore: getAwayScore(g),
        finished: isFinished(g),
      }
    }
  } catch {
    // If worldcup26.ir is down, fall back to DB results
  }

  function getResult(match: { id: number; result: string | null }): string | null {
    if (match.result) return match.result
    const live = liveGames[match.id.toString()]
    if (!live || !live.finished) return null
    if (live.homeScore > live.awayScore) return 'Team A'
    if (live.homeScore < live.awayScore) return 'Team B'
    return 'Draw'
  }

  // Only authenticated users (has Google Account)
  const users = await prisma.user.findMany({
    where: {
      accounts: { some: {} },
    },
    include: {
      predictions: {
        include: {
          match: true,
        },
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
