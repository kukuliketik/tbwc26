import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const picks = await prisma.goldenBootPick.findMany({
      include: { user: { select: { name: true, image: true } } },
      orderBy: { createdAt: 'desc' },
    })

    const grouped: Record<string, {
      playerId: string
      team: string
      count: number
      users: { name: string | null; image: string | null }[]
    }> = {}

    for (const pick of picks) {
      const key = pick.playerId
      if (!grouped[key]) {
        grouped[key] = {
          playerId: pick.playerId,
          team: pick.team,
          count: 0,
          users: [],
        }
      }
      grouped[key].count++
      grouped[key].users.push({ name: pick.user.name, image: pick.user.image })
    }

    const result = Object.entries(grouped)
      .map(([playerId, data]) => ({
        ...data,
        playerId,
        playerName: picks.find(p => p.playerId === playerId)?.playerName ?? 'Unknown',
      }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[golden-boot stats]', error)
    return NextResponse.json([])
  }
}
