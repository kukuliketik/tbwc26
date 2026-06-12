import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAllGames, isLive, isFinished, getHomeScore, getAwayScore, STADIUM_INFO, WC26Game } from '@/lib/worldcup26-api'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const round = searchParams.get('round')
    const group = searchParams.get('group')
    const upcoming = searchParams.get('upcoming')
    const limit = searchParams.get('limit')

    const where: Record<string, unknown> = {}

    if (round) where.round = round
    if (group) where.group = group
    if (upcoming === 'true') {
      where.date = { gte: new Date() }
      where.result = null
    }

    const matches = await prisma.match.findMany({
      where,
      orderBy: { id: 'asc' },
      take: limit ? parseInt(limit) : undefined,
    })

    // Always fetch live data from worldcup26.ir for accurate dates, scores, and teams
    try {
      const wc26Games = await getAllGames()
      const wc26Map = new Map<string, WC26Game>()
      wc26Games.forEach(game => wc26Map.set(game.id, game))

      // Merge live data with our matches, override team names from worldcup26.ir
      const enrichedMatches = matches.map(match => {
        const wc26Game = wc26Map.get(match.id.toString())
        if (wc26Game) {
          return {
            id: match.id,
            date: match.date,
            round: match.round,
            group: wc26Game.group || match.group,
            stage: match.stage,
            teamA: wc26Game.home_team_name_en || match.teamA,
            teamB: wc26Game.away_team_name_en || match.teamB,
            result: match.result,
            live: {
              homeScore: getHomeScore(wc26Game),
              awayScore: getAwayScore(wc26Game),
              isLive: isLive(wc26Game),
              isFinished: isFinished(wc26Game),
              timeElapsed: wc26Game.time_elapsed,
              finished: wc26Game.finished,
              localDate: wc26Game.local_date,
              stadiumId: wc26Game.stadium_id,
              stadium: STADIUM_INFO[wc26Game.stadium_id] ?? null,
            }
          }
        }
        return match
      })

      return NextResponse.json(enrichedMatches)
    } catch {
      // If worldcup26.ir fails, return matches without live data
      return NextResponse.json(matches)
    }
  } catch (error) {
    console.error('[API /matches]', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
