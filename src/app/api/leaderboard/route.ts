import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  loadFifaByMatchNum,
  getUserPointsBreakdown,
  settleMissingAuditLogs,
} from '@/lib/points'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const fifaByMatchNum = await loadFifaByMatchNum()

  const users = await prisma.user.findMany({
    where: { accounts: { some: {} } },
    select: { id: true },
  })

  // Same breakdown function as /api/points/audit so totals always match
  const leaderboard = (
    await Promise.all(
      users.map(async (user) => {
        const breakdown = await getUserPointsBreakdown(user.id, fifaByMatchNum, {
          persistMissing: false,
        })
        if (!breakdown) return null
        return {
          userId: breakdown.userId,
          name: breakdown.name ?? 'Anonymous',
          email: breakdown.email,
          image: breakdown.image,
          points: breakdown.points,
          correctPredictions: breakdown.correctPredictions,
          totalPredictions: breakdown.totalPredictions,
          totalFinished: breakdown.totalFinished,
          accuracy: breakdown.accuracy,
        }
      })
    )
  ).filter((e): e is NonNullable<typeof e> => e !== null)

  leaderboard.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return b.accuracy - a.accuracy
  })

  // Background: fill missing audit rows only (no overwrites) so /points detail stays filled in
  if (users.length > 0) {
    Promise.all(
      users.map((u) => settleMissingAuditLogs(u.id, fifaByMatchNum).catch(() => {}))
    ).catch(() => {})
  }

  return NextResponse.json(leaderboard, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  })
}
