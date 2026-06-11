# World Cup 2026 Predictions Web App — Build Instruction

## Overview
A full-stack Next.js web app for the **FIFA World Cup 2026** tournament. Users register via Google OAuth, submit match predictions, track their scores on a live leaderboard, and view live match results. Data is sourced from a **Google Sheet** and stored in **Supabase PostgreSQL**.

## Tech Stack
| Component | Technology |
|-----------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Auth | NextAuth.js v5 + Google OAuth |
| Database | Supabase PostgreSQL + Prisma ORM |
| Styling | Tailwind CSS |
| Sheets API | Google Sheets API v4 (seed/sync) |
| Live Scores | football-data.org API |
| Deployment | Vercel |

## Data Source
**Google Sheet**: `1KosZcPH039-hy02w4ai5b7dwNokar6r8q6Vgj4AVT0Y`

### Sheet Structure ("World Cup Picks" tab, gid=76719191)

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Match # | Int | Primary key (1-104) |
| B | Date | Date | Format: "Mmm DD, YYYY" |
| C | Round | String | Group Stage / Round of 32 / Round of 16 / Quarterfinal / Semifinal / Third Place / Final |
| D | Group | String | A-L (nullable for KO rounds) |
| E | Stage/Matchday | String | Matchday 1-3 / R32 / R16 / QF / SF / 3P / Final |
| F | Team A | String | Home team |
| G | Team B | String | Away team |
| H | Result | String | Empty=upcoming; "Team A" / "Team B" / "Draw" |
| I–AT | Player predictions | String | 23 players, each cell = their pick ("Team A"/"Team B"/"Draw"/empty) |
| AU–BH | Player points | Int | Running point totals per player |

### Players (23 total)
Arif, Gilang, Iki, Raj, Derick, Michel, Edo, Onny, Denny, Wayan, Ojan, Ajie, Hariman, Gery, Syukur, Prima, Dimas, Bintoro, Leo, Amir, Alif, Satria

### Match Schedule
- **Group Stage**: 72 matches (Matchday 1-3, Groups A-L), rows 2-73
- **Round of 32**: 16 matches, rows 74-89
- **Round of 16**: 8 matches, rows 90-97
- **Quarterfinal**: 4 matches, rows 98-101
- **Semifinal**: 2 matches, rows 102-103
- **Third Place**: 1 match, row 104
- **Final**: 1 match, row 105

## Database Schema

### User
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| email | String | Unique, from Google |
| name | String? | From Google profile |
| image | String? | Avatar URL |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### Match
| Field | Type | Notes |
|-------|------|-------|
| id | Int | Match number (PK) |
| date | DateTime | Match kickoff |
| round | String | Group Stage / Round of 32 / etc. |
| group | String? | A-L or null |
| stage | String | Matchday 1 / R32 / R16 / etc. |
| teamA | String | Home team |
| teamB | String | Away team |
| result | String? | Null=upcoming; "Team A"/"Team B"/"Draw" |

### Prediction
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| userId | String | FK → User |
| matchId | Int | FK → Match |
| pick | String | "Team A" / "Team B" / "Draw" |
| *(unique)* | | userId + matchId |

## Scoring
- **1 point** per correct prediction
- Correct = `pick` === `match.result` (case-sensitive string match)
- Points calculated on-demand via aggregation query
- Zero points for missed predictions

## API Routes

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/auth/[...nextauth]` | Any | - | NextAuth handler |
| `/api/matches` | GET | Optional | All matches, optional group/round filter |
| `/api/matches/:id` | GET | Optional | Single match detail |
| `/api/predictions` | GET | Required | Current user's predictions |
| `/api/predictions` | POST | Required | Save/update prediction `{ matchId, pick }` |
| `/api/leaderboard` | GET | Optional | Ranked standings for all users |
| `/api/sync/sheet` | POST | Admin | Sync match data + results from Google Sheets |

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Hero + upcoming matches + top 5 leaderboard |
| `/picks` | World Cup Picks | Group/round filter + match cards with prediction selector |
| `/leaderboard` | Leaderboard | Full ranked table + stats cards |
| `/matches` | Live & Schedule | Live scores (API) + full tournament schedule |

## Environment Variables

```env
# NextAuth
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_SECRET=
AUTH_URL=

# Database (Supabase)
DATABASE_URL=

# Google Sheets API (service account)
GOOGLE_SHEETS_PRIVATE_KEY=
GOOGLE_SHEETS_CLIENT_EMAIL=
SPREADSHEET_ID=1KosZcPH039-hy02w4ai5b7dwNokar6r8q6Vgj4AVT0Y
SHEET_GID=76719191

# Football API
FOOTBALL_DATA_API_KEY=
```

## Build Steps

### Phase 1: Project Scaffold
```bash
npx create-next-app@latest tbwc26 --typescript --tailwind --eslint --app --src-dir
cd tbwc26
npm install next-auth@beta @prisma/client prisma @auth/prisma-adapter
npm install googleapis date-fns
npx prisma init
```

### Phase 2: Configure Auth
- Setup NextAuth route handler at `src/app/api/auth/[...nextauth]/route.ts`
- Configure Google OAuth provider
- Create auth config in `src/lib/auth.ts`
- Add middleware to protect `/picks`, `/leaderboard`

### Phase 3: Database Schema & Seed
- Define `User`, `Match`, `Prediction` models in `prisma/schema.prisma`
- Run `npx prisma migrate dev`
- Write seed script `scripts/seed-from-sheets.ts` to read CSV from Google Sheet and populate Matches table
- Create sync endpoint to pull results from sheet

### Phase 4: Match & Predictions UI
- Build API routes for matches and predictions
- Build `/picks` page with match cards grouped by round/group
- Implement prediction submission with lockout for started matches

### Phase 5: Leaderboard
- Build `/api/leaderboard` with computed scores
- Build `/leaderboard` page with ranking table + stats

### Phase 6: Live Matches
- Integrate football-data.org API via `src/lib/football-api.ts`
- Build `/matches` page with live scores + full schedule

### Phase 7: Deploy
- Push to GitHub
- Connect Vercel project
- Configure environment variables in Vercel dashboard
- Run seed script in Vercel post-deploy

## Data Flow Diagram

```
Google Sheets ──seed──▶ Supabase DB (Match table)
                              │
Google Sheets ──sync──▶ Match.result updated
                              │
User ──Google OAuth──▶ Logged in ──▶ /picks ──▶ POST /api/predictions ──▶ DB
                                                                        │
Match result entered ──▶ Leaderboard query ──▶ Points per user ──▶ Display
                                                                        │
football-data.org ──▶ /matches page ──▶ Live scores display
```

## Rules & Constraints
1. Users CANNOT predict matches that have already started (check `match.date` vs now)
2. Users CAN change predictions before match start (upsert)
3. Admin-only sync endpoint (protected by env secret)
4. Leaderboard auto-updates when results are synced (no manual trigger needed)
5. Response design: mobile-first, works on all screen sizes
6. Football-data.org API: cache results for 60s to stay within rate limits

## File Structure (Generated)

```
tbwc26/
├── prisma/
│   └── schema.prisma
├── scripts/
│   └── seed-from-sheets.ts
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/
│   │   │   │       └── route.ts
│   │   │   ├── leaderboard/
│   │   │   │   └── route.ts
│   │   │   ├── matches/
│   │   │   │   ├── [id]/
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   ├── predictions/
│   │   │   │   └── route.ts
│   │   │   └── sync/
│   │   │       └── sheet/
│   │   │           └── route.ts
│   │   ├── leaderboard/
│   │   │   └── page.tsx
│   │   ├── matches/
│   │   │   └── page.tsx
│   │   ├── picks/
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── AuthButtons.tsx
│   │   ├── LeaderboardTable.tsx
│   │   ├── LiveMatchBanner.tsx
│   │   ├── MatchCard.tsx
│   │   ├── Navbar.tsx
│   │   └── PredictionSelector.tsx
│   ├── lib/
│   │   ├── auth.ts
│   │   ├── football-api.ts
│   │   ├── prisma.ts
│   │   └── sheets.ts
│   └── types/
│       └── index.ts
├── .env.example
├── next.config.ts
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```
