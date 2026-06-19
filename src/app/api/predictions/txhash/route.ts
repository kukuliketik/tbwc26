import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { matchId, storeTxHash, settleTxHash } = await request.json()

  const prediction = await prisma.prediction.findUnique({
    where: { userId_matchId: { userId: session.user.id, matchId } },
  })

  if (!prediction) {
    return NextResponse.json({ error: 'Prediction not found' }, { status: 404 })
  }

  await prisma.prediction.update({
    where: { userId_matchId: { userId: session.user.id, matchId } },
    data: {
      ...(storeTxHash && { storeTxHash }),
      ...(settleTxHash && { settleTxHash }),
    },
  })

  return NextResponse.json({ ok: true })
}
