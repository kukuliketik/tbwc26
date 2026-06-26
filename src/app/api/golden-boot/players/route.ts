import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface FifaActor {
  _externalSportsPersonId: string
  name: { eng: string }
  number: number
  tags: { name: string; value: string | number | boolean }[]
}

interface FifaMatch {
  IdMatch: string
  MatchStatus: number
  Home: { IdTeam: string; IdCountry: string; TeamName: { Description: string }[]; Score: number } | null
  Away: { IdTeam: string; IdCountry: string; TeamName: { Description: string }[]; Score: number } | null
}

interface FifaMatchDetail {
  HomeTeam: { Goals: { IdPlayer: string; Type: number }[]; Players: { IdPlayer: string; PlayerName: { Description: string }[]; ShortName: { Description: string }[] }[] }
  AwayTeam: { Goals: { IdPlayer: string; Type: number }[]; Players: { IdPlayer: string; PlayerName: { Description: string }[]; ShortName: { Description: string }[] }[] }
}

interface TopScorer {
  playerId: string
  playerName: string
  team: string
  teamId: string
  goals: number
  assists: number
  minutesPlayed: number
  position: string
  image: string
  rank: number
}

let cachedPlayers: { data: TopScorer[]; expiry: number; source: string } | null = null
let cachedToken: { data: string; expiry: number } | null = null
let lastFetchTime = 0
const MIN_FETCH_INTERVAL = 30 * 1000

const TOKEN_TTL = 50 * 60 * 1000
const PLAYERS_TTL = 60 * 60 * 1000

const FIFA_BASE_URL = 'https://api.fifa.com/api/v3'
const SEASON_ID = '285023'
const COMPETITION_ID = '17'

async function loadStaticPhotoOverrides(): Promise<Record<string, string>> {
  try {
    const file = await import('fs/promises')
    const path = process.cwd() + '/public/golden-boot-photos.json'
    const data = JSON.parse(await file.readFile(path, 'utf-8'))
    const map: Record<string, string> = {}
    for (const p of data.players ?? []) {
      if (p.playerId && p.image) {
        map[p.playerId] = appendCropTransform(p.image)
      }
    }
    return map
  } catch {
    return {}
  }
}

function getTag(tags: FifaActor['tags'], tagName: string): string | number | boolean | null {
  const tag = tags.find(t => t.name === tagName)
  return tag?.value ?? null
}

function appendCropTransform(imageUrl: string): string {
  if (!imageUrl || imageUrl.includes('io=transform')) return imageUrl
  const separator = imageUrl.includes('?') ? '&' : '?'
  return `${imageUrl}${separator}&io=transform:crop,height:600,width:600&quality=75`
}

async function getGameDayToken(): Promise<string | null> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiry > now) return cachedToken.data

  try {
    const res = await fetch('https://cxm-api.fifa.com/fifaplusweb/api/external/gameDay/token', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.fifa.com/',
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    const token = data.token
    if (token) {
      cachedToken = { data: token, expiry: now + TOKEN_TTL }
    }
    return token
  } catch {
    return null
  }
}

async function fetchFromGameDay(): Promise<TopScorer[] | null> {
  const token = await getGameDayToken()
  if (!token) return null

  const query = encodeURIComponent(
    "(and resourceStatus==`urn:gd:resourceStatus:active` _externalId~`urn:gd:story:classification:gcp_top_scorer:competitionId:285023:(.*):rank_asc:page:1$`)"
  )
  const url = `https://gameday-prod.fifa.mangodev.co.uk/1-0/stories?query=${query}&skip=0&limit=50&sort=tags.name==urn:gd:tag:story:fifa:column_number:asc`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://www.fifa.com/',
    },
  })

  if (!res.ok) return null

  const data = await res.json()
  const players: TopScorer[] = []

  for (const item of data.items ?? []) {
    for (const actor of item.actors ?? []) {
      const goals = Number(getTag(actor.tags, 'urn:gd:tag:football:stats:goals') ?? 0)
      if (goals <= 0) continue

      players.push({
        playerId: actor._externalSportsPersonId,
        playerName: actor.name?.eng ?? 'Unknown',
        team: String(getTag(actor.tags, 'urn:gd:tag:story:team:name:eng') ?? 'Unknown'),
        teamId: actor.key?._externalTeamId?.replace('285023_', '') ?? '',
        goals,
        assists: Number(getTag(actor.tags, 'urn:gd:tag:football:stats:assists') ?? 0),
        minutesPlayed: Number(getTag(actor.tags, 'urn:gd:tag:football:stats:total_competition_minutes_played') ?? 0),
        position: String(getTag(actor.tags, 'urn:gd:tag:story:staff:position') ?? ''),
        image: appendCropTransform(String(getTag(actor.tags, 'urn:gd:tag:story:staff:image') ?? '')),
        rank: Number(getTag(actor.tags, 'urn:gd:tag:football:stats:fdcp_top_scorer_rank') ?? 0),
      })
    }
  }

  if (players.length === 0) return null
  return players.sort((a, b) => a.rank - b.rank || b.goals - a.goals)
}

function formatName(name: string): string {
  if (!name || name === 'Unknown') return name
  const lowercaseParticles = new Set(['van', 'de', 'di', 'dos', 'das', 'do', 'da', 'del', 'la', 'le', 'der', 'den', 'ten', 'ter'])
  return name
    .split(' ')
    .map((part, index) => {
      if (index > 0 && lowercaseParticles.has(part.toLowerCase())) return part.toLowerCase()
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

async function getAllMatches(): Promise<FifaMatch[]> {
  try {
    const url = `${FIFA_BASE_URL}/calendar/matches?count=104&idSeason=${SEASON_ID}&idCompetition=${COMPETITION_ID}&language=en&from=2026-06-01T00:00:00Z&to=2026-08-01T00:00:00Z`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return []
    const json = await res.json()
    return json?.Results ?? []
  } catch {
    return []
  }
}

async function getMatchDetail(idMatch: string): Promise<FifaMatchDetail | null> {
  try {
    const url = `${FIFA_BASE_URL}/live/football/${idMatch}?language=en`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

interface FifaSquadPlayer {
  IdPlayer: string
  ShortName: { Description: string }[]
  PlayerName: { Description: string }[]
  PlayerPicture: { PictureUrl: string } | null
  Position: number
  PositionLocalized: { Description: string }[]
}

const POSITION_MAP: Record<number, string> = {
  0: 'GK',
  1: 'DF',
  2: 'MF',
  3: 'FW',
}

async function getTeamSquad(teamId: string): Promise<FifaSquadPlayer[]> {
  if (!teamId) return []
  try {
    const url = `${FIFA_BASE_URL}/teams/${teamId}/squad?idSeason=${SEASON_ID}&idCompetition=${COMPETITION_ID}&language=en`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return []
    const json = await res.json()
    return json?.Players ?? []
  } catch {
    return []
  }
}

async function fetchFromFifaAPI(): Promise<TopScorer[]> {
  const matches = await getAllMatches()
  const finishedMatches = matches.filter(m => m.MatchStatus === 0)

  // Fetch match details in parallel
  const details = await Promise.all(finishedMatches.map(m => getMatchDetail(m.IdMatch)))

  const goalMap = new Map<string, TopScorer & { teamId: string }>()

  for (let i = 0; i < finishedMatches.length; i++) {
    const match = finishedMatches[i]
    const detail = details[i]

    if (!match.Home || !match.Away || match.Home.Score + match.Away.Score === 0) continue
    if (!detail) continue

    const playerNameMap = new Map<string, string>()
    const teamNameMap = new Map<string, string>()
    const teamIdMap = new Map<string, string>()

    for (const p of detail.HomeTeam?.Players ?? []) {
      const name = p.ShortName?.[0]?.Description || p.PlayerName?.[0]?.Description || 'Unknown'
      playerNameMap.set(p.IdPlayer, name)
      teamNameMap.set(p.IdPlayer, match.Home.TeamName?.[0]?.Description ?? 'Home')
      teamIdMap.set(p.IdPlayer, match.Home.IdTeam)
    }
    for (const p of detail.AwayTeam?.Players ?? []) {
      const name = p.ShortName?.[0]?.Description || p.PlayerName?.[0]?.Description || 'Unknown'
      playerNameMap.set(p.IdPlayer, name)
      teamNameMap.set(p.IdPlayer, match.Away.TeamName?.[0]?.Description ?? 'Away')
      teamIdMap.set(p.IdPlayer, match.Away.IdTeam)
    }

    const allGoals = [
      ...(detail.HomeTeam?.Goals ?? []),
      ...(detail.AwayTeam?.Goals ?? []),
    ]

    for (const goal of allGoals) {
      if (goal.Type === 1) continue
      const playerId = goal.IdPlayer
      const existing = goalMap.get(playerId)
      if (existing) {
        existing.goals += 1
      } else {
        goalMap.set(playerId, {
          playerId,
          playerName: formatName(playerNameMap.get(playerId) ?? 'Unknown'),
          team: teamNameMap.get(playerId) ?? 'Unknown',
          teamId: teamIdMap.get(playerId) ?? '',
          goals: 1,
          assists: 0,
          minutesPlayed: 0,
          position: '',
          image: '',
          rank: 0,
        })
      }
    }
  }

  const scorers = Array.from(goalMap.values())

  // Fetch squad photos for each unique team in parallel
  const uniqueTeamIds = Array.from(new Set(scorers.map(p => p.teamId).filter(Boolean)))
  const photoMap = new Map<string, string>()
  const positionMap = new Map<string, string>()

  const squadResults = await Promise.all(uniqueTeamIds.map(teamId => getTeamSquad(teamId)))
  for (const squad of squadResults) {
    for (const player of squad) {
      const photoUrl = player.PlayerPicture?.PictureUrl
      if (photoUrl) {
        photoMap.set(player.IdPlayer, appendCropTransform(photoUrl))
      }
      const pos = POSITION_MAP[player.Position]
      if (pos) positionMap.set(player.IdPlayer, pos)
    }
  }

  return scorers
    .sort((a, b) => b.goals - a.goals)
    .map((p, i) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      team: p.team,
      teamId: p.teamId,
      goals: p.goals,
      assists: p.assists,
      minutesPlayed: p.minutesPlayed,
      position: positionMap.get(p.playerId) ?? '',
      image: photoMap.get(p.playerId) ?? '',
      rank: i + 1,
    }))
}

export async function GET() {
  try {
    const now = Date.now()

    if (cachedPlayers && cachedPlayers.expiry > now) {
      return NextResponse.json({ players: cachedPlayers.data, source: cachedPlayers.source })
    }

    if (now - lastFetchTime < MIN_FETCH_INTERVAL && cachedPlayers) {
      return NextResponse.json({ players: cachedPlayers.data, source: cachedPlayers.source })
    }

    lastFetchTime = now

    let players = await fetchFromGameDay()
    let source = 'gameday'

    if (!players) {
      players = await fetchFromFifaAPI()
      source = 'fifa-api'
    }

    if (!players || players.length === 0) {
      return NextResponse.json({ players: cachedPlayers?.data ?? [], error: 'No player data available', source: cachedPlayers?.source })
    }

    const photoOverrides = source === 'fifa-api' ? await loadStaticPhotoOverrides() : {}

    const enrichedPlayers = players.map((p) => ({
      ...p,
      image: p.image || photoOverrides[p.playerId] || '',
    }))

    cachedPlayers = { data: enrichedPlayers, expiry: now + PLAYERS_TTL, source }

    return NextResponse.json({ players: enrichedPlayers, source })
  } catch (error) {
    console.error('[golden-boot players]', error)
    return NextResponse.json({ players: cachedPlayers?.data ?? [], error: 'Internal server error', source: cachedPlayers?.source })
  }
}
