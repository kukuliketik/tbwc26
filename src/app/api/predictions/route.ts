import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const predictions = await prisma.prediction.findMany({
    where: { userId: session.user.id },
  })

  return NextResponse.json(predictions)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { matchId, pick } = body

  if (!matchId || !pick) {
    return NextResponse.json({ error: 'matchId and pick are required' }, { status: 400 })
  }

  if (!['Team A', 'Team B', 'Draw'].includes(pick)) {
    return NextResponse.json({ error: 'pick must be "Team A", "Team B", or "Draw"' }, { status: 400 })
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } })
  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const ONE_HOUR_MS = 60 * 60 * 1000
  if (new Date(match.date).getTime() - ONE_HOUR_MS < Date.now()) {
    return NextResponse.json({ error: 'Predictions close 1 hour before kickoff' }, { status: 400 })
  }

  const prediction = await prisma.prediction.upsert({
    where: {
      userId_matchId: { userId: session.user.id, matchId },
    },
    update: { pick },
    create: {
      userId: session.user.id,
      matchId,
      pick,
    },
  })

  return NextResponse.json(prediction)
}
