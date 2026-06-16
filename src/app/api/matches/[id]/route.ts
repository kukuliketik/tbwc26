import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAllMatches, getMatchDetail, getTeamForm, parseScorers, isLive, isFinished, getHomeScore, getAwayScore, getHomeTeam, getAwayTeam, getRound, getGroup, getStadiumName, getStadiumCity, FifaMatch } from '@/lib/fifa-api'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = parseInt(id)

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      predictions: {
        where: { user: { accounts: { some: {} } } },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
  })

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  let fifaMatch: FifaMatch | null = null
  let homeScorers: string[] = []
  let awayScorers: string[] = []
  let homeForm = null
  let awayForm = null

  try {
    const allMatches = await getAllMatches()
    fifaMatch = allMatches.find(m => m.MatchNumber === matchId) ?? null

    if (fifaMatch) {
      const detail = await getMatchDetail(fifaMatch.IdMatch)
      if (detail) {
        homeScorers = parseScorers(detail.HomeTeam?.Goals ?? [], detail.HomeTeam?.Players ?? [])
        awayScorers = parseScorers(detail.AwayTeam?.Goals ?? [], detail.AwayTeam?.Players ?? [])
      }
      const [hf, af] = await Promise.all([
        getTeamForm(fifaMatch.Home?.IdTeam ?? ''),
        getTeamForm(fifaMatch.Away?.IdTeam ?? ''),
      ])
      homeForm = hf
      awayForm = af
    }
  } catch {}

  const homeTeam = fifaMatch ? getHomeTeam(fifaMatch) : match.teamA
  const awayTeam = fifaMatch ? getAwayTeam(fifaMatch) : match.teamB
  const homeScore = fifaMatch ? getHomeScore(fifaMatch) : 0
  const awayScore = fifaMatch ? getAwayScore(fifaMatch) : 0

  const response = {
    id: match.id,
    date: match.date,
    round: fifaMatch ? getRound(fifaMatch) : match.round,
    group: fifaMatch ? getGroup(fifaMatch) : match.group,
    stage: match.stage,
    teamA: homeTeam,
    teamB: awayTeam,
    result: match.result,
    predictions: match.predictions,
    teamStats: {
      home: homeForm,
      away: awayForm,
    },
    live: fifaMatch ? {
      homeScore,
      awayScore,
      homeScorers,
      awayScorers,
      isLive: isLive(fifaMatch),
      isFinished: isFinished(fifaMatch),
      timeElapsed: fifaMatch.MatchTime ?? 'notstarted',
      stadium: fifaMatch.IdMatch,
      localDate: fifaMatch.Date,
      stadiumId: '1',
      stadiumInfo: {
        name: getStadiumName(fifaMatch),
        city: getStadiumCity(fifaMatch),
        country: fifaMatch.Stadium?.IdCountry ?? '',
      },
      finished: isFinished(fifaMatch) ? 'TRUE' : 'FALSE',
    } : null,
  }

  return NextResponse.json(response)
}
