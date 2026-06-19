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

// Stadium ID → UTC offset in hours (venue local time during WC2026 June/July)
// Mexico: no DST (UTC-6), US/Canada: DST active
const STADIUM_UTC_OFFSET: Record<string, number> = {
  '1': -6,   // Mexico City (America/Mexico_City, no DST)
  '2': -6,   // Guadalajara (America/Mexico_City, no DST)
  '3': -6,   // Monterrey (America/Monterrey, no DST)
  '4': -5,   // Dallas (America/Chicago, CDT)
  '5': -5,   // Houston (America/Chicago, CDT)
  '6': -5,   // Kansas City (America/Chicago, CDT)
  '7': -4,   // Atlanta (America/New_York, EDT)
  '8': -4,   // Miami (America/New_York, EDT)
  '9': -4,   // Boston (America/New_York, EDT)
  '10': -4,  // Philadelphia (America/New_York, EDT)
  '11': -4,  // New York (America/New_York, EDT)
  '12': -4,  // Toronto (America/Toronto, EDT)
  '13': -7,  // Vancouver (America/Vancouver, PDT)
  '14': -7,  // Seattle (America/Los_Angeles, PDT)
  '15': -7,  // San Francisco (America/Los_Angeles, PDT)
  '16': -7,  // Los Angeles (America/Los_Angeles, PDT)
}

// Stadium ID → { name, city, country }
export const STADIUM_INFO: Record<string, { name: string; city: string; country: string }> = {
  '1': { name: 'Estadio Azteca', city: 'Mexico City', country: 'Mexico' },
  '2': { name: 'Estadio Akron', city: 'Guadalajara', country: 'Mexico' },
  '3': { name: 'Estadio BBVA', city: 'Monterrey', country: 'Mexico' },
  '4': { name: 'AT&T Stadium', city: 'Dallas', country: 'USA' },
  '5': { name: 'NRG Stadium', city: 'Houston', country: 'USA' },
  '6': { name: 'Arrowhead Stadium', city: 'Kansas City', country: 'USA' },
  '7': { name: 'Mercedes-Benz Stadium', city: 'Atlanta', country: 'USA' },
  '8': { name: 'Hard Rock Stadium', city: 'Miami', country: 'USA' },
  '9': { name: 'Gillette Stadium', city: 'Boston', country: 'USA' },
  '10': { name: 'Lincoln Financial Field', city: 'Philadelphia', country: 'USA' },
  '11': { name: 'MetLife Stadium', city: 'New York', country: 'USA' },
  '12': { name: 'BMO Field', city: 'Toronto', country: 'Canada' },
  '13': { name: 'BC Place', city: 'Vancouver', country: 'Canada' },
  '14': { name: 'Lumen Field', city: 'Seattle', country: 'USA' },
  '15': { name: 'Levi\'s Stadium', city: 'San Francisco', country: 'USA' },
  '16': { name: 'SoFi Stadium', city: 'Los Angeles', country: 'USA' },
}

const WIB_OFFSET = 7 // UTC+7

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

// Convert local_date to UTC Date (handles both worldcup26.ir MM/DD/YYYY HH:mm and FIFA ISO format)
export function parseWC26Date(localDate: string, stadiumId?: string): Date {
  // FIFA API provides ISO format (e.g., "2026-06-11T13:00:00Z")
  if (localDate.includes('T') || localDate.includes('Z')) {
    return new Date(localDate)
  }

  // worldcup26.ir format: MM/DD/YYYY HH:mm
  const [datePart, timePart] = localDate.split(' ')
  const [month, day, year] = datePart.split('/').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)

  // Get venue UTC offset, default to Iran time (UTC+4:30)
  const venueOffset = stadiumId ? (STADIUM_UTC_OFFSET[stadiumId] ?? 4.5) : 4.5

  // Convert: venue local → UTC (subtract venue offset)
  const totalMinutes = hours * 60 + minutes - venueOffset * 60
  const utcHours = Math.floor(totalMinutes / 60)
  const utcMinutes = totalMinutes % 60

  // Handle day overflow/underflow
  const dayOffset = Math.floor(utcHours / 24)
  const finalHours = ((utcHours % 24) + 24) % 24

  return new Date(Date.UTC(year, month - 1, day + dayOffset, finalHours, utcMinutes, 0))
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
    let entries: string[]
    if (Array.isArray(parsed)) {
      entries = parsed.map(String)
    } else if (typeof parsed === 'object' && parsed !== null) {
      entries = Object.values(parsed).map(String)
    } else {
      entries = [scorersStr]
    }
    return entries
      .map(s => s.replace(/[{}"]/g, '').replace(/\d+['′]?\s*$/, '').trim())
      .filter(Boolean)
  } catch {
    return scorersStr
      .replace(/[\[\]{}"']/g, '')
      .split(',')
      .map(s => s.replace(/\d+['′]?\s*$/, '').trim())
      .filter(Boolean)
  }
}

export function sortScorersByTeam(
  homeScorersRaw: string,
  awayScorersRaw: string,
  homeTeam: string,
  awayTeam: string,
): { homeScorers: string[]; awayScorers: string[] } {
  const allRaw = [...parseScorers(homeScorersRaw), ...parseScorers(awayScorersRaw)]
  if (allRaw.length === 0) return { homeScorers: [], awayScorers: [] }

  const sorted = { homeScorers: [] as string[], awayScorers: [] as string[] }

  for (const raw of allRaw) {
    const lowerRaw = raw.toLowerCase()
    const lowerHome = homeTeam.toLowerCase()
    const lowerAway = awayTeam.toLowerCase()

    const cleaned = raw
      .replace(/[{}"]/g, '')
      .replace(/\d+['′]?\s*$/, '')
      .replace(new RegExp(`\\b${homeTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '')
      .replace(new RegExp(`\\b${awayTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '')
      .trim()

    if (lowerRaw.includes(lowerAway)) {
      sorted.awayScorers.push(cleaned)
    } else {
      sorted.homeScorers.push(cleaned)
    }
  }

  return sorted
}
