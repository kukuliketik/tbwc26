import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BASE_URL = 'https://api.fifa.com/api/v3'
const SEASON_ID = '285023'
const COMPETITION_ID = '17'

async function getRoundOf16Deadline(): Promise<Date> {
  try {
    const url = `${BASE_URL}/calendar/matches?count=104&idSeason=${SEASON_ID}&idCompetition=${COMPETITION_ID}&language=en&from=2026-06-01T00:00:00Z&to=2026-08-01T00:00:00Z`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return new Date('2026-06-28T23:59:59Z')
    const json = await res.json()
    const matches = json?.Results ?? []

    const r16Matches = matches.filter((m: { StageName?: { Description: string }[] }) => {
      const stage = m.StageName?.[0]?.Description ?? ''
      return stage === 'Round of 16'
    })

    if (r16Matches.length === 0) return new Date('2026-06-28T23:59:59Z')

    const dates = r16Matches.map((m: { Date: string }) => new Date(m.Date).getTime())
    return new Date(Math.min(...dates))
  } catch {
    return new Date('2026-06-28T23:59:59Z')
  }
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [pick, deadline] = await Promise.all([
      prisma.goldenBootPick.findUnique({ where: { userId: session.user.id } }),
      getRoundOf16Deadline(),
    ])

    return NextResponse.json({
      pick: pick || null,
      deadline: deadline.toISOString(),
    })
  } catch (error) {
    console.error('[golden-boot GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const deadline = await getRoundOf16Deadline()
    if (new Date() >= deadline) {
      return NextResponse.json(
        { error: 'Voting is closed. The Round of 16 has started.' },
        { status: 403 }
      )
    }

    const existing = await prisma.goldenBootPick.findUnique({
      where: { userId: session.user.id },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'You have already picked a Golden Boot winner. Editing is not allowed.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { playerId, playerName, team } = body

    if (!playerId || !playerName || !team) {
      return NextResponse.json(
        { error: 'playerId, playerName, and team are required' },
        { status: 400 }
      )
    }

    const pick = await prisma.goldenBootPick.create({
      data: {
        userId: session.user.id,
        playerId,
        playerName,
        team,
      },
    })

    return NextResponse.json(pick)
  } catch (error) {
    console.error('[golden-boot POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
