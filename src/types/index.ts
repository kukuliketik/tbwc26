export type PickType = 'Team A' | 'Team B' | 'Draw'

export interface MatchData {
  id: number
  date: string
  round: string
  group: string | null
  stage: string
  teamA: string
  teamB: string
  result: string | null
}

export interface PredictionData {
  id: string
  matchId: number
  pick: PickType
}

export interface LeaderboardEntry {
  userId: string
  name: string
  email: string
  image: string | null
  points: number
  correctPredictions: number
  totalPredictions: number
  accuracy: number
}

export interface SheetRow {
  matchId: number
  date: string
  round: string
  group: string
  stage: string
  teamA: string
  teamB: string
  result: string
  predictions: Record<string, string>
}
