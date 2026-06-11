import { parse, format } from 'date-fns'
import type { SheetRow } from '@/types'

const SPREADSHEET_ID = process.env.SPREADSHEET_ID!
const SHEET_GID = process.env.SHEET_GID!

export async function fetchSheetCSV(): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.statusText}`)
  return res.text()
}

export function parseCSV(csvText: string): SheetRow[] {
  const lines = csvText.split('\n').filter(Boolean)
  if (lines.length < 2) return []

  const players = [
    'Arif', 'Gilang', 'Iki', 'Raj', 'Derick', 'Michel', 'Edo', 'Onny',
    'Denny', 'Wayan', 'Ojan', 'Ajie', 'Hariman', 'Gery', 'Syukur', 'Prima',
    'Dimas', 'Bintoro', 'Leo', 'Amir', 'Alif', 'Satria',
  ]

  const rows: SheetRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])

    const matchId = parseInt(cols[0], 10)
    if (isNaN(matchId)) continue

    const dateStr = cols[1]?.trim()
    if (!dateStr) continue

    let isoDate = ''
    try {
      const parsed = parse(dateStr, 'MMM dd, yyyy', new Date())
      isoDate = format(parsed, 'yyyy-MM-dd')
    } catch {
      isoDate = dateStr
    }

    const teamA = cols[5]?.trim() ?? ''
    const teamB = cols[6]?.trim() ?? ''
    if (!teamA || !teamB) continue

    const predictions: Record<string, string> = {}
    for (let p = 0; p < players.length; p++) {
      const pick = cols[8 + p]?.trim() ?? ''
      if (pick) predictions[players[p]] = pick
    }

    rows.push({
      matchId,
      date: isoDate,
      round: cols[2]?.trim() ?? '',
      group: cols[3]?.trim() ?? '',
      stage: cols[4]?.trim() ?? '',
      teamA,
      teamB,
      result: cols[7]?.trim() ?? '',
      predictions,
    })
  }

  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)

  return result
}
