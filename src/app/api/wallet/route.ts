import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const { walletAddress } = await req.json()
    const { auth } = await import('@/lib/auth')
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { walletAddress },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/wallet] save failed:', err)
    return NextResponse.json({ error: 'Failed to save wallet' }, { status: 500 })
  }
}
