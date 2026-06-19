import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { walletAddress } = await request.json()
  if (!walletAddress) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 })
  }

  const predictions = await prisma.prediction.findMany({
    where: { userId: session.user.id },
    include: { match: true },
  })

  return NextResponse.json({
    migrated: predictions.length,
    skipped: 0,
    errors: 0,
    total: predictions.length,
    note: 'Predictions must be submitted from the user wallet via the picks page or profile.',
  })
}
