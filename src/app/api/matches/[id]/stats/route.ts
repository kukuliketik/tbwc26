import { NextResponse } from 'next/server'
import { getAllMatches, getMatchTimeline, deriveStatsFromTimeline, isFinished, isLive, FifaMatch } from '@/lib/fifa-api'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = parseInt(id)

  let fifaMatch: FifaMatch | null = null

  try {
    const allMatches = await getAllMatches()
    fifaMatch = allMatches.find((m) => m.MatchNumber === matchId) ?? null
  } catch {
    return NextResponse.json({ error: 'Failed to load matches' }, { status: 502 })
  }

  if (!fifaMatch) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  const homeTeamId = fifaMatch.Home?.IdTeam ?? ''
  const awayTeamId = fifaMatch.Away?.IdTeam ?? ''

  if (!homeTeamId || !awayTeamId) {
    return NextResponse.json({ error: 'Teams not available' }, { status: 404 })
  }

  const timeline = await getMatchTimeline(fifaMatch.IdMatch, isLive(fifaMatch), isFinished(fifaMatch))
  const matchStats = deriveStatsFromTimeline(timeline, homeTeamId, awayTeamId)

  return NextResponse.json({ matchStats })
}
