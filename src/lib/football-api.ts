const API_KEY = process.env.FOOTBALL_DATA_API_KEY
const BASE_URL = 'https://api.football-data.org/v4'

let cache: { data: unknown; expiry: number } | null = null

async function fetchFromAPI(endpoint: string) {
  if (!API_KEY) return null

  const now = Date.now()
  if (cache && cache.expiry > now) return cache.data

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { 'X-Auth-Token': API_KEY },
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('football-data.org rate limit hit')
        return cache?.data ?? null
      }
      return null
    }

    const data = await res.json()
    cache = { data, expiry: now + 60000 }
    return data
  } catch {
    return null
  }
}

export interface LiveMatch {
  id: number
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  status: string
  minute: string | null
}

export async function getLiveMatches(): Promise<LiveMatch[]> {
  const data = await fetchFromAPI('/matches?status=LIVE')
  if (!data?.matches) return []

  return data.matches.map((m: Record<string, unknown>) => {
    const score = m.score as Record<string, Record<string, number>> | undefined
    return {
      id: m.id as number,
      homeTeam: ((m.homeTeam as Record<string, string>)?.name) ?? '',
      awayTeam: ((m.awayTeam as Record<string, string>)?.name) ?? '',
      homeScore: score?.fullTime?.home ?? null,
      awayScore: score?.fullTime?.away ?? null,
      status: m.status as string,
      minute: (m as Record<string, unknown>).minute as string | null,
    }
  })
}

export async function getScheduledMatches(dateFrom: string, dateTo: string) {
  const data = await fetchFromAPI(`/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`)
  return data?.matches ?? []
}
