import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAllMatches, getMatchDetail, getTeamForm, getTeamSquad, parseScorers, isLive, isFinished, getHomeScore, getAwayScore, getHomeTeam, getAwayTeam, getRound, getGroup, getStadiumName, getStadiumCity, FifaMatch } from '@/lib/fifa-api'

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
  let homePlayers: { id: string; name: string; shirtNumber: number }[] = []
  let awayPlayers: { id: string; name: string; shirtNumber: number }[] = []

  try {
    const allMatches = await getAllMatches()
    fifaMatch = allMatches.find(m => m.MatchNumber === matchId) ?? null

    if (fifaMatch) {
      const homeTeamId = fifaMatch.Home?.IdTeam ?? ''
      const awayTeamId = fifaMatch.Away?.IdTeam ?? ''

      const [detail, hf, af, homeSquad, awaySquad] = await Promise.all([
        getMatchDetail(fifaMatch.IdMatch),
        getTeamForm(homeTeamId),
        getTeamForm(awayTeamId),
        getTeamSquad(homeTeamId),
        getTeamSquad(awayTeamId),
      ])

      if (detail) {
        const detailHomePlayers = detail.HomeTeam?.Players ?? []
        const detailAwayPlayers = detail.AwayTeam?.Players ?? []
        homeScorers = parseScorers(detail.HomeTeam?.Goals ?? [], detailHomePlayers, detailAwayPlayers, homeTeamId, awayTeamId)
        awayScorers = parseScorers(detail.AwayTeam?.Goals ?? [], detailHomePlayers, detailAwayPlayers, homeTeamId, awayTeamId)
      }

      homePlayers = homeSquad
      awayPlayers = awaySquad
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
    homePlayers,
    awayPlayers,
  }

  return NextResponse.json(response)
}
