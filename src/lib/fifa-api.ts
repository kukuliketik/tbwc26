const BASE_URL = 'https://api.fifa.com/api/v3'
const SEASON_ID = '285023'
const COMPETITION_ID = '17'
const DATE_FROM = '2026-06-01T00:00:00Z'
const DATE_TO = '2026-08-01T00:00:00Z'
const CACHE_TTL = 30_000

let _allMatchesCache: { data: FifaMatch[]; expiry: number } | null = null
let _allMatchesPromise: Promise<FifaMatch[]> | null = null

export interface FifaTeam {
  Score: number
  IdTeam: string
  IdCountry: string
  TeamName: { Locale: string; Description: string }[]
  PictureUrl: string
  Abbreviation: string
}

export interface FifaStadium {
  Name: { Locale: string; Description: string }[]
  CityName: { Locale: string; Description: string }[]
  IdCountry: string
}

export interface FifaMatch {
  IdMatch: string
  IdCompetition: string
  IdSeason: string
  IdStage: string
  IdGroup: string
  Date: string
  LocalDate: string
  MatchStatus: number // 0=finished, 1=scheduled, 3=live
  MatchTime: string | null
  Winner: string | null
  Home: FifaTeam | null
  Away: FifaTeam | null
  StageName: { Locale: string; Description: string }[]
  GroupName: { Locale: string; Description: string }[]
  Stadium: FifaStadium
  PlaceHolderA: string | null
  PlaceHolderB: string | null
  MatchNumber: number
  Attendance: number | null
  Weather: Record<string, unknown>
  Officials: Record<string, unknown>[]
}

export function isFinished(match: FifaMatch): boolean {
  return match.MatchStatus === 0
}

export function isLive(match: FifaMatch): boolean {
  return match.MatchStatus === 3
}

export function getMatchTime(match: FifaMatch): string | null {
  return match.MatchTime
}

export function getHomeScore(match: FifaMatch): number {
  return match.Home?.Score ?? 0
}

export function getAwayScore(match: FifaMatch): number {
  return match.Away?.Score ?? 0
}

export function getHomeTeam(match: FifaMatch): string {
  return match.Home?.TeamName?.[0]?.Description ?? match.PlaceHolderA ?? 'TBD'
}

export function getAwayTeam(match: FifaMatch): string {
  return match.Away?.TeamName?.[0]?.Description ?? match.PlaceHolderB ?? 'TBD'
}

const STAGE_MAP: Record<string, string> = {
  'First Stage': 'Group Stage',
  'Round of 32': 'Round of 32',
  'Round of 16': 'Round of 16',
  'Quarter-final': 'Quarterfinal',
  'Semi-final': 'Semifinal',
  'Play-off for third place': 'Third Place',
  'Final': 'Final',
}

export function getRound(match: FifaMatch): string {
  const stage = match.StageName?.[0]?.Description ?? 'First Stage'
  return STAGE_MAP[stage] ?? stage
}

export function getGroup(match: FifaMatch): string | null {
  const name = match.GroupName?.[0]?.Description ?? ''
  const m = name.match(/Group (\w+)/)
  return m ? m[1] : null
}

export function getStadiumName(match: FifaMatch): string {
  return match.Stadium?.Name?.[0]?.Description ?? 'Unknown Stadium'
}

export function getStadiumCity(match: FifaMatch): string {
  return match.Stadium?.CityName?.[0]?.Description ?? ''
}

export async function getAllMatches(): Promise<FifaMatch[]> {
  const now = Date.now()
  if (_allMatchesCache && _allMatchesCache.expiry > now) {
    return _allMatchesCache.data
  }

  if (_allMatchesPromise) return _allMatchesPromise

  _allMatchesPromise = (async () => {
    try {
      const url = `${BASE_URL}/calendar/matches?count=104&idSeason=${SEASON_ID}&idCompetition=${COMPETITION_ID}&language=en&from=${DATE_FROM}&to=${DATE_TO}`
      const res = await fetch(url, { next: { revalidate: 0 } })
      if (!res.ok) throw new Error(`FIFA API returned ${res.status}`)
      const json = await res.json()
      const data: FifaMatch[] = json?.Results ?? []
      if (data.length > 0) {
        _allMatchesCache = { data, expiry: now + CACHE_TTL }
      }
      return data
    } catch (err) {
      console.error('FIFA API fetch failed:', err)
      return _allMatchesCache?.data ?? []
    } finally {
      _allMatchesPromise = null
    }
  })()

  return _allMatchesPromise
}

export async function getMatchById(idMatch: string): Promise<FifaMatch | null> {
  const matches = await getAllMatches()
  return matches.find(m => m.IdMatch === idMatch) ?? null
}

export interface FifaGoal {
  Type: number
  IdPlayer: string
  Minute: string
  IdAssistPlayer: string | null
  Period: number
  IdTeam: string
}

export interface FifaPlayer {
  IdPlayer: string
  ShirtNumber: number
  PlayerName: { Locale: string; Description: string }[]
  ShortName: { Locale: string; Description: string }[]
}

export interface FifaMatchDetail {
  HomeTeam: {
    Goals: FifaGoal[]
    Players: FifaPlayer[]
  }
  AwayTeam: {
    Goals: FifaGoal[]
    Players: FifaPlayer[]
  }
  MatchTime: string | null
  MatchStatus: number
}

export interface FifaTeamForm {
  MatchesPlayed: number
  Wins: number
  Losses: number
  Draws: number
  GoalsScored: number
  GoalsAgainst: number
  MatchesList?: FifaTeamMatch[]
}

export interface FifaTeamMatch {
  Date: string
  HomeTeamScore: number
  AwayTeamScore: number
  Winner: string | null
  Home: { TeamName: { Locale: string; Description: string }[] } | null
  Away: { TeamName: { Locale: string; Description: string }[] } | null
  StageName: { Locale: string; Description: string }[]
}

export async function getTeamForm(teamId: string): Promise<FifaTeamForm | null> {
  const now = Date.now()
  const cacheKey = `teamform_all_${teamId}`
  const cached = _detailCache[cacheKey] as { data: FifaTeamForm; expiry: number } | undefined
  if (cached && cached.expiry > now) return cached.data

  try {
    // Note: intentionally omit idCompetition so friendlies and qualifiers are included,
    // matching the recent form shown on fifa.com match centre pages.
    const url = `${BASE_URL}/teamform/${teamId}?count=5&language=en`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const json = await res.json()
    _detailCache[cacheKey] = { data: json as FifaTeamForm, expiry: now + CACHE_TTL }
    return json as FifaTeamForm
  } catch (err) {
    console.error('FIFA teamform fetch failed:', err)
    return cached?.data ?? null
  }
}

const _detailCache: Record<string, { data: unknown; expiry: number }> = {}

export function parseScorers(goals: FifaGoal[], players: FifaPlayer[]): string[] {
  const playerMap = new Map<string, string>()
  for (const p of players) {
    playerMap.set(p.IdPlayer, p.ShortName?.[0]?.Description || p.PlayerName?.[0]?.Description || '?')
  }
  return goals.map(g => {
    const name = playerMap.get(g.IdPlayer) || '?'
    return `${name} ${g.Minute}`
  })
}

export async function getMatchDetail(idMatch: string): Promise<FifaMatchDetail | null> {
  const now = Date.now()
  const cached = _detailCache[idMatch]
  if (cached && cached.expiry > now) return cached.data as FifaMatchDetail

  try {
    const url = `${BASE_URL}/live/football/${idMatch}?language=en`
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const json = await res.json()
    _detailCache[idMatch] = { data: json as FifaMatchDetail, expiry: now + CACHE_TTL }
    return json as FifaMatchDetail
  } catch (err) {
    console.error('FIFA match detail fetch failed:', err)
    return (cached?.data as FifaMatchDetail) ?? null
  }
}
