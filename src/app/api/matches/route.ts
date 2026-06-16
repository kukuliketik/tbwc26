import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAllMatches, isLive, isFinished, getHomeScore, getAwayScore, getHomeTeam, getAwayTeam, getRound, getGroup, getStadiumName, getStadiumCity, FifaMatch } from '@/lib/fifa-api'

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

    // Fetch FIFA API for live scores, dates, and teams
    try {
      const fifaMatches = await getAllMatches()
      const fifaByMatchNum = new Map<number, FifaMatch>()
      fifaMatches.forEach(m => fifaByMatchNum.set(m.MatchNumber, m))

      const enrichedMatches = matches.map(match => {
        const fifa = fifaByMatchNum.get(match.id)
        if (fifa) {
          return {
            id: match.id,
            date: match.date,
            round: getRound(fifa),
            group: getGroup(fifa),
            stage: match.stage,
            teamA: getHomeTeam(fifa),
            teamB: getAwayTeam(fifa),
            result: match.result,
            live: {
              homeScore: getHomeScore(fifa),
              awayScore: getAwayScore(fifa),
              isLive: isLive(fifa),
              isFinished: isFinished(fifa),
              timeElapsed: fifa.MatchTime,
              finished: isFinished(fifa) ? 'TRUE' : 'FALSE',
              localDate: fifa.Date,
              stadiumId: fifa.IdMatch,
              stadium: {
                name: getStadiumName(fifa),
                city: getStadiumCity(fifa),
                country: fifa.Stadium?.IdCountry ?? '',
              },
            }
          }
        }
        return match
      })

      return NextResponse.json(enrichedMatches)
    } catch {
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
