import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
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
      const totalPredictions = user.predictions.length
      const correctPredictions = user.predictions.filter(
        (p) => p.match.result && p.pick === p.match.result
      ).length
      const points = correctPredictions
      const accuracy = totalPredictions > 0 ? (correctPredictions / totalPredictions) * 100 : 0

      return {
        userId: user.id,
        name: user.name ?? 'Anonymous',
        email: user.email,
        image: user.image,
        points,
        correctPredictions,
        totalPredictions,
        accuracy: Math.round(accuracy * 100) / 100,
      }
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return b.accuracy - a.accuracy
    })

  return NextResponse.json(leaderboard)
}
