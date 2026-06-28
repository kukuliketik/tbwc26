import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BASE_URL = 'https://api.fifa.com/api/v3'
const SEASON_ID = '285023'
const COMPETITION_ID = '17'

interface FifaMatch {
  IdMatch: string
  MatchNumber: number
  MatchStatus: number
  Home: { Score: number; TeamName: { Description: string }[] } | null
  Away: { Score: number; TeamName: { Description: string }[] } | null
}

const KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarterfinal',
  'Semifinal',
  'Third Place',
  'Final',
])

async function getAllMatches(): Promise<FifaMatch[]> {
  const url = `${BASE_URL}/calendar/matches?count=104&idSeason=${SEASON_ID}&idCompetition=${COMPETITION_ID}&language=en&from=2026-06-01T00:00:00Z&to=2026-08-01T00:00:00Z`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FIFA API returned ${res.status}`)
  const json = await res.json()
  return json?.Results ?? []
}

async function checkUserPoints(userId: string) {
  console.log('Fetching FIFA match data...')
  const fifaByMatchNum = new Map<number, FifaMatch>()
  try {
    const fifaMatches = await getAllMatches()
    for (const m of fifaMatches) {
      fifaByMatchNum.set(m.MatchNumber, m)
    }
    console.log(`Loaded ${fifaMatches.length} matches from FIFA API\n`)
  } catch (err) {
    console.error('FIFA API fetch failed:', err)
    console.log('Proceeding with DB results only\n')
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      predictions: {
        include: { match: true },
        orderBy: { matchId: 'asc' },
      },
    },
  })

  if (!user) {
    console.log('User not found')
    return
  }

  console.log(`=== User: ${user.name} (${user.email}) ===`)
  console.log(`User ID: ${user.id}\n`)

  let correctCount = 0
  let totalFinished = 0
  const details: Array<{
    matchId: number
    teamA: string
    teamB: string
    result: string | null
    pick: string
    correct: boolean
    points: number
    source: string
  }> = []

  for (const pred of user.predictions) {
    let result = pred.match.result
    let source = 'DB'

    if (!result) {
      const fifa = fifaByMatchNum.get(pred.matchId)
      if (fifa && fifa.MatchStatus === 0) {
        const hs = fifa.Home?.Score ?? 0
        const as = fifa.Away?.Score ?? 0
        if (hs > as) result = 'Team A'
        else if (hs < as) result = 'Team B'
        else result = 'Draw'
        source = 'FIFA'
      }
    }

    if (result) {
      totalFinished++
      const correct = pred.pick === result
      if (correct) correctCount++

      const fifa = fifaByMatchNum.get(pred.matchId)
      const teamA = fifa?.Home?.TeamName?.[0]?.Description ?? pred.match.teamA
      const teamB = fifa?.Away?.TeamName?.[0]?.Description ?? pred.match.teamB

      const isKnockout = KNOCKOUT_ROUNDS.has(pred.match.round)

      details.push({
        matchId: pred.matchId,
        teamA,
        teamB,
        result,
        pick: pred.pick,
        correct,
        points: correct ? (isKnockout ? 2 : 1) : 0,
        source,
      })
    }
  }

  console.log('Match-by-Match Breakdown:')
  console.log('─'.repeat(100))
  console.log(
    'Match'.padEnd(8),
    'Team A'.padEnd(22),
    'Team B'.padEnd(22),
    'Result'.padEnd(10),
    'Pick'.padEnd(10),
    'Status'.padEnd(12),
    'Pts'
  )
  console.log('─'.repeat(100))

  for (const d of details) {
    const status = d.correct ? '✅ CORRECT' : '❌ WRONG'
    console.log(
      `#${d.matchId}`.padEnd(8),
      d.teamA.substring(0, 20).padEnd(22),
      d.teamB.substring(0, 20).padEnd(22),
      (d.result || 'N/A').padEnd(10),
      d.pick.padEnd(10),
      status.padEnd(12),
      d.points
    )
  }

  console.log('─'.repeat(100))
  console.log(`\n=== SUMMARY ===`)
  console.log(`Total Predictions: ${user.predictions.length}`)
  console.log(`Finished Matches: ${totalFinished}`)
  console.log(`Correct Picks: ${correctCount}`)
  console.log(`Points: ${details.reduce((sum, d) => sum + d.points, 0)}`)
  console.log(`Accuracy: ${totalFinished > 0 ? ((correctCount / totalFinished) * 100).toFixed(1) : 0}%`)
}

const userId = process.argv[2] || 'cmqam6jjn0000jr04hqsei8vw'
checkUserPoints(userId)
  .catch(console.error)
  .finally(() => prisma.$disconnect())
