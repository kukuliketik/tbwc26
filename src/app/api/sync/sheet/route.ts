import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchSheetCSV, parseCSV } from '@/lib/sheets'

export async function POST(request: Request) {
  const apiKey = request.headers.get('x-api-key')
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const csv = await fetchSheetCSV()
    const rows = parseCSV(csv)

    let matchesUpdated = 0

    for (const row of rows) {
      if (!row.result) continue

      const existing = await prisma.match.findUnique({ where: { id: row.matchId } })
      if (existing && existing.result !== row.result) {
        await prisma.match.update({
          where: { id: row.matchId },
          data: { result: row.result },
        })
        matchesUpdated++
      } else if (!existing) {
        await prisma.match.create({
          data: {
            id: row.matchId,
            date: new Date(row.date),
            round: row.round,
            group: row.group || null,
            stage: row.stage,
            teamA: row.teamA,
            teamB: row.teamB,
            result: row.result,
          },
        })
        matchesUpdated++
      }
    }

    return NextResponse.json({ synced: true, matchesUpdated })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
