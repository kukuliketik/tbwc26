import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pick = await prisma.winnerPick.findUnique({
      where: { userId: session.user.id },
    })

    return NextResponse.json(pick || null)
  } catch (error) {
    console.error('[winner-pick GET]', error)
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { team } = body

    if (!team) {
      return NextResponse.json({ error: 'team is required' }, { status: 400 })
    }

    const existing = await prisma.winnerPick.findUnique({
      where: { userId: session.user.id },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'You have already picked a winner. Editing is not allowed.' },
        { status: 403 }
      )
    }

    const pick = await prisma.winnerPick.create({
      data: {
        userId: session.user.id,
        team,
      },
    })

    return NextResponse.json(pick)
  } catch (error) {
    console.error('[winner-pick POST]', error)
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 })
  }
}
