import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const predictions = await prisma.prediction.findMany({
    where: { userId: session.user.id },
    select: { matchId: true, storeTxHash: true, settleTxHash: true },
  })

  const txMap: Record<number, { storeTxHash?: string; settleTxHash?: string }> = {}
  for (const p of predictions) {
    txMap[p.matchId] = {
      storeTxHash: p.storeTxHash ?? undefined,
      settleTxHash: p.settleTxHash ?? undefined,
    }
  }

  return NextResponse.json(txMap)
}
