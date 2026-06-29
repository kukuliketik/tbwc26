import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAllMatches, isLive, isFinished, getHomeScore, getAwayScore, getHomeTeam, getAwayTeam, getRound, getGroup, getStadiumName, getStadiumCity, getMatchDetail, get90MinScore, FifaMatch } from '@/lib/fifa-api'

export const dynamic = 'force-dynamic'

const KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarterfinal',
  'Semifinal',
  'Third Place',
  'Final',
])

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

      const enrichedMatches = await Promise.all(
        matches.map(async (match) => {
          const fifa = fifaByMatchNum.get(match.id)
          if (fifa) {
            const roundStr = getRound(fifa)
            const isKnockout = KNOCKOUT_ROUNDS.has(roundStr)
            let homeScore = getHomeScore(fifa)
            let awayScore = getAwayScore(fifa)

            // For knockout matches, use 90-minute scores (exclude extra time)
            if (isKnockout && isFinished(fifa)) {
              try {
                const matchDetail = await getMatchDetail(fifa.IdMatch)
                if (matchDetail) {
                  const score90 = get90MinScore(matchDetail)
                  homeScore = score90.home
                  awayScore = score90.away
                }
              } catch {
                // Fall back to full-time scores if detail fetch fails
              }
            }

            return {
              id: match.id,
              date: match.date,
              round: roundStr,
              group: getGroup(fifa),
              stage: match.stage,
              teamA: getHomeTeam(fifa),
              teamB: getAwayTeam(fifa),
              result: match.result,
              live: {
                homeScore,
                awayScore,
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
      )

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
