import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGameById, parseScorers, isLive, isFinished, getHomeScore, getAwayScore, WC26Game } from '@/lib/worldcup26-api'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = parseInt(id)

  // Fetch from our DB (predictions, user picks) — only authenticated users (has Google Account)
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      predictions: {
        where: {
          user: {
            accounts: { some: {} },
          },
        },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
    },
  })

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  // Fetch live data from worldcup26.ir
  let liveGame: WC26Game | null = null
  try {
    liveGame = await getGameById(matchId)
  } catch {
    // If worldcup26.ir is down, just return our DB data
  }

  // Merge live data with our DB data
  const response = {
    id: match.id,
    date: match.date,
    round: match.round,
    group: match.group,
    stage: match.stage,
    teamA: match.teamA,
    teamB: match.teamB,
    result: match.result,
    predictions: match.predictions,
    // Live data from worldcup26.ir
    live: liveGame ? {
      homeScore: getHomeScore(liveGame),
      awayScore: getAwayScore(liveGame),
      homeScorers: parseScorers(liveGame.home_scorers),
      awayScorers: parseScorers(liveGame.away_scorers),
      isLive: isLive(liveGame),
      isFinished: isFinished(liveGame),
      timeElapsed: liveGame.time_elapsed,
      stadium: liveGame.stadium_id,
      localDate: liveGame.local_date,
      finished: liveGame.finished,
    } : null,
  }

  return NextResponse.json(response)
}
