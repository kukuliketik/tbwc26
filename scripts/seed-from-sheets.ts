import { parse } from 'date-fns'
import { prisma } from '../src/lib/prisma'
import { fetchSheetCSV, parseCSV } from '../src/lib/sheets'

async function main() {
  console.log('Fetching data from Google Sheets...')
  const csv = await fetchSheetCSV()
  const rows = parseCSV(csv)

  console.log(`Parsed ${rows.length} matches from sheet`)

  let created = 0
  let updated = 0

  for (const row of rows) {
    const parts = row.date.split('-')
    const year = parseInt(parts[0])
    const month = parseInt(parts[1]) - 1
    const day = parseInt(parts[2])

    const utcDate = new Date(Date.UTC(year, month, day, 19, 0, 0, 0))

    const data = {
      date: utcDate,
      round: row.round,
      group: row.group || null,
      stage: row.stage,
      teamA: row.teamA,
      teamB: row.teamB,
      result: row.result || null,
    }

    const existing = await prisma.match.findUnique({ where: { id: row.matchId } })

    if (existing) {
      await prisma.match.update({ where: { id: row.matchId }, data })
      updated++
    } else {
      await prisma.match.create({ data: { id: row.matchId, ...data } })
      created++
    }
  }

  console.log(`Done! Created: ${created}, Updated: ${updated}, Total: ${rows.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
