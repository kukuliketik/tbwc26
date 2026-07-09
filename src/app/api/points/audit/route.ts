import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadFifaByMatchNum, getUserPointsBreakdown } from '@/lib/points'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fifaByMatchNum = await loadFifaByMatchNum()

  // Same function as leaderboard — points are guaranteed to match
  const breakdown = await getUserPointsBreakdown(session.user.id, fifaByMatchNum, {
    persistMissing: true,
  })

  if (!breakdown) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json(
    {
      matches: breakdown.matches,
      grandTotal: breakdown.points,
      predictionPoints: breakdown.predictionPoints,
      boosterPoints: breakdown.boosterPoints,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    }
  )
}
