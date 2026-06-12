import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const picks = await prisma.winnerPick.findMany({
      include: { user: { select: { name: true, image: true } } },
      orderBy: { createdAt: 'desc' },
    })

    const grouped: Record<string, { count: number; users: { name: string | null; image: string | null }[] }> = {}
    for (const pick of picks) {
      if (!grouped[pick.team]) {
        grouped[pick.team] = { count: 0, users: [] }
      }
      grouped[pick.team].count++
      grouped[pick.team].users.push({ name: pick.user.name, image: pick.user.image })
    }

    const result = Object.entries(grouped)
      .map(([team, data]) => ({ team, ...data }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[winner-pick stats]', error)
    return NextResponse.json([])
  }
}
