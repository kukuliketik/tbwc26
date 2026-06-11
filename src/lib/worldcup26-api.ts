const BASE_URL = 'https://worldcup26.ir'

let cache: { data: unknown; expiry: number } | null = null
const CACHE_TTL = 30_000 // 30 seconds for live data

export interface WC26Game {
  _id: string
  id: string
  home_team_id: string
  away_team_id: string
  home_score: string
  away_score: string
  home_scorers: string
  away_scorers: string
  group: string
  matchday: string
  local_date: string
  persian_date: string
  stadium_id: string
  finished: string
  time_elapsed: string
  type: string
  home_team_name_en: string
  home_team_name_fa: string
  away_team_name_en: string
  away_team_name_fa: string
  home_team_label?: string
  away_team_label?: string
}

export interface WC26GamesResponse {
  games: WC26Game[]
}

export interface WC26Stadium {
  _id: string
  id: string
  name_en: string
  name_fa: string
  fifa_name: string
  city_en: string
  country_en: string
  capacity: number
}

async function fetchWC26<T>(endpoint: string): Promise<T | null> {
  const now = Date.now()
  if (cache && cache.expiry > now && cache.data) return cache.data as T

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      next: { revalidate: 30 },
    })

    if (!res.ok) {
      console.warn(`worldcup26.ir API error: ${res.status}`)
      return cache?.data as T ?? null
    }

    const data = await res.json()
    cache = { data, expiry: now + CACHE_TTL }
    return data
  } catch (err) {
    console.error('worldcup26.ir fetch failed:', err)
    return cache?.data as T ?? null
  }
}

export async function getAllGames(): Promise<WC26Game[]> {
  const data = await fetchWC26<WC26GamesResponse>('/get/games')
  return data?.games ?? []
}

export async function getGameById(matchId: number): Promise<WC26Game | null> {
  const data = await fetchWC26<{ game: WC26Game }>(`/get/game/${matchId}`)
  return data?.game ?? null
}

export async function getAllStadiums(): Promise<WC26Stadium[]> {
  const data = await fetchWC26<{ stadiums: WC26Stadium[] }>('/get/stadiums')
  return data?.stadiums ?? []
}

export function parseWC26Date(localDate: string): Date {
  // Format: "06/11/2026 13:00" (MM/DD/YYYY HH:mm) — this is local time at venue
  const [datePart, timePart] = localDate.split(' ')
  const [month, day, year] = datePart.split('/').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0))
}

export function isLive(game: WC26Game): boolean {
  return game.finished === 'FALSE' && game.time_elapsed !== 'notstarted'
}

export function isFinished(game: WC26Game): boolean {
  return game.finished === 'TRUE'
}

export function isScheduled(game: WC26Game): boolean {
  return game.finished === 'FALSE' && game.time_elapsed === 'notstarted'
}

export function getHomeScore(game: WC26Game): number {
  return parseInt(game.home_score) || 0
}

export function getAwayScore(game: WC26Game): number {
  return parseInt(game.away_score) || 0
}

export function parseScorers(scorersStr: string): string[] {
  if (!scorersStr || scorersStr === 'null' || scorersStr === '[]') return []
  try {
    const parsed = JSON.parse(scorersStr)
    if (Array.isArray(parsed)) return parsed
    return [scorersStr]
  } catch {
    if (scorersStr.includes("'")) {
      return scorersStr.replace(/[\[\]']/g, '').split(',').map(s => s.trim()).filter(Boolean)
    }
    return [scorersStr]
  }
}
