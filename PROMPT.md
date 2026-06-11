# World Cup 2026 — AI Build Prompts

Copy and paste these prompts sequentially into your AI coding assistant to build the entire app phase by phase.

---

## Phase 1: Project Scaffold & Dependencies

```
Create a Next.js 14 project with App Router, TypeScript, and Tailwind CSS.

1. Run: npx create-next-app@latest tbwc26 --typescript --tailwind --eslint --app --src-dir
2. cd tbwc26
3. Install these dependencies:
   - next-auth@beta
   - @prisma/client prisma
   - @auth/prisma-adapter
   - googleapis
   - date-fns
4. Run: npx prisma init (this creates prisma/schema.prisma and .env)

Set the .env file with placeholder values for:
- DATABASE_URL (Supabase PostgreSQL connection string)
- AUTH_GOOGLE_ID
- AUTH_GOOGLE_SECRET
- AUTH_SECRET
- GOOGLE_SHEETS_PRIVATE_KEY
- GOOGLE_SHEETS_CLIENT_EMAIL
- SPREADSHEET_ID=1KosZcPH039-hy02w4ai5b7dwNokar6r8q6Vgj4AVT0Y
- SHEET_GID=76719191
- FOOTBALL_DATA_API_KEY

Create .env.example with the same variables (empty values).

Also create src/lib/prisma.ts with the Prisma client singleton pattern.
```

---

## Phase 2: Prisma Schema & Database

```
Add the following models to prisma/schema.prisma using the Prisma PostgreSQL provider and @auth/prisma-adapter Account/Session/VerificationToken models:

1. User model (extends the default NextAuth models):
   - id String @id @default(cuid())
   - email String @unique
   - name String?
   - image String?
   - predictions Prediction[]
   - createdAt DateTime @default(now())
   - updatedAt DateTime @updatedAt
   - accounts Account[]
   - sessions Session[]

2. Match model:
   - id Int @id
   - date DateTime
   - round String
   - group String?
   - stage String
   - teamA String
   - teamB String
   - result String?
   - predictions Prediction[]

3. Prediction model:
   - id String @id @default(cuid())
   - userId String
   - matchId Int
   - pick String
   - user User @relation(fields: [userId], references: [id])
   - match Match @relation(fields: [matchId], references: [id])
   - @@unique([userId, matchId])

4. Also include the Account, Session, VerificationToken models from @auth/prisma-adapter (Account needs userId relation to User, Session needs userId relation to User).

Run: npx prisma migrate dev --name init
```

---

## Phase 3: Authentication Setup

```
Set up NextAuth v5 with Google OAuth provider in the project.

1. Create src/lib/auth.ts:
   - Import NextAuth from next-auth
   - Import Google from next-auth/providers/google
   - Import PrismaAdapter from @auth/prisma-adapter
   - Import prisma from ./prisma
   - Export auth, handlers, signIn, signOut from NextAuth({
       adapter: PrismaAdapter(prisma),
       providers: [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })],
       pages: { signIn: '/' },
       callbacks: { session: async ({ session, user }) => { ...session.user.id = user.id; return session } }
     })

2. Create src/app/api/auth/[...nextauth]/route.ts:
   - Import { handlers } from '@/lib/auth'
   - Export GET and POST from handlers

3. Create src/components/AuthButtons.tsx:
   - "Sign in with Google" button using signIn('google')
   - "Sign out" button using signOut()
   - Show user avatar + name when signed in

4. Create src/components/Navbar.tsx:
   - Links: Home, Picks, Leaderboard, Matches
   - AuthButtons component
   - Responsive hamburger menu on mobile

5. Create src/middleware.ts:
   - Export default authMiddleware from next-auth/middleware
   - Protect /picks, /leaderboard routes (require auth)
   - Allow /, /matches, /api/* publicly

6. Update src/app/layout.tsx:
   - Wrap children with SessionProvider (create a provider component)
   - Include Navbar
   - Add basic global styles

7. Update src/app/page.tsx (Home page):
   - Hero section: "World Cup 2026 Predictions"
   - Brief description
   - Call-to-action button: "Make Your Picks" (if signed in) or "Sign In" (if not)
   - Show next 3 upcoming matches (placeholder for now)
   - Show top 3 leaderboard (placeholder for now)
```

---

## Phase 4: Seed Match Data from Google Sheet

```
1. Create src/types/index.ts:
   - MatchRound type: 'Group Stage' | 'Round of 32' | 'Round of 16' | 'Quarterfinal' | 'Semifinal' | 'Third Place' | 'Final'
   - MatchStage type: 'Matchday 1' | 'Matchday 2' | 'Matchday 3' | 'R32' | 'R16' | 'QF' | 'SF' | '3P' | 'Final'
   - Pick type: 'Team A' | 'Team B' | 'Draw'
   - MatchData interface
   - PredictionData interface
   - LeaderboardEntry interface

2. Create src/lib/sheets.ts:
   - Function fetchSheetCSV(): fetches https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid={SHEET_GID}
   - Function parseMatchData(csvText): parses CSV rows into Match objects
   - Mapping logic: column A→id, B→date, C→round, D→group, E→stage, F→teamA, G→teamB, H→result
   - Skip header row
   - Parse date using date-fns parse('MMM dd, yyyy')
   - Only import group stage matches for now (skip KO rounds with placeholder team names)

3. Create scripts/seed-from-sheets.ts:
   - Import prisma client
   - Fetch CSV, parse matches, upsert into Match table
   - Handle duplicates via match.id match
   - Run with: npx tsx scripts/seed-from-sheets.ts
   - Add to package.json scripts: "seed": "tsx scripts/seed-from-sheets.ts"

4. Create src/app/api/sync/sheet/route.ts:
   - POST endpoint
   - Protected by secret header (verify x-sync-secret === env var)
   - Fetches sheet, updates match results, recalculates points
   - Returns { synced: true, matchesUpdated: number }
```

---

## Phase 5: Matches API & Predictions API

```
1. Create src/app/api/matches/route.ts:
   - GET: Returns all matches from DB
   - Support query params: ?round=Group+Stage&group=A
   - Support ?upcoming=true (only matches where date > now)
   - Support ?result=true (only matches with results filled)
   - Order by: date ascending, match id ascending
   - Include prediction count but not user picks

2. Create src/app/api/matches/[id]/route.ts:
   - GET: Returns single match with all predictions (for admin)

3. Create src/app/api/predictions/route.ts:
   - GET: Returns current user's predictions (requires auth)
   - Join with match data
   - POST: Create or update prediction
   - Body: { matchId: number, pick: 'Team A' | 'Team B' | 'Draw' }
   - Validation: match must exist, match must not have started (date > now), pick must be valid
   - Use upsert on userId+matchId
   - Return the prediction

4. Create src/app/api/leaderboard/route.ts:
   - GET: Returns all users with their total points
   - For each user, count predictions where prediction.pick === match.result
   - Include total predictions count
   - Include accuracy percentage
   - Order by points descending
   - Cache for 30 seconds
```

---

## Phase 6: Picks Page (Match Predictions)

```
Create src/app/picks/page.tsx:

1. Fetch matches from /api/matches (all group stage matches)
2. Fetch user's predictions from /api/predictions
3. Group matches by round, then by group
4. Display a tab/selector for: Groups A-L, then Round of 32, Round of 16, etc.

Match Card component (src/components/MatchCard.tsx):
- Date, time info
- Team A vs Team B with flags (use emoji flags or text)
- Group/Round badge
- If match has started AND has result: show result, highlight if user predicted correctly (green/red)
- If match has started AND no result yet: show "Live" or "Waiting for result"
- If match hasn't started:
  - Show 3 prediction buttons: Team A | Draw | Team B
  - Selected prediction is highlighted
  - Click to select/deselect
  - Save indicator (saved/unsaved)

Prediction Selector (src/components/PredictionSelector.tsx):
- Three toggle buttons: [Team A] [Draw] [Team B]
- Highlight selected
- Show loading state during save
- Disabled if match has started
- Auto-save on selection (debounced)
- Show checkmark when saved

Match date check:
- If match.date < new Date(), disable predictions
- Show "Match started" message

Features:
- Auto-save each prediction independently
- Show visual feedback (success/error toast)
- Loading skeleton while fetching
- Empty state: "No matches found for this filter"
```

---

## Phase 7: Leaderboard Page

```
Create src/app/leaderboard/page.tsx:

1. Fetch from /api/leaderboard
2. Auto-refresh every 30 seconds (optional)

Leaderboard Table component (src/components/LeaderboardTable.tsx):
Columns:
- Rank (#1, #2, #3 with trophy icons for top 3)
- Player (avatar + name)
- Points (highlight current user)
- Correct Predictions (count)
- Total Predictions (count)
- Accuracy (percentage)

Features:
- Highlight the current logged-in user's row with a different background
- Responsive: on mobile, show condensed view (rank, name, points)
- Loading skeleton
- Empty state: "No predictions yet"
- Show total participants count
- Animated score changes (optional CSS animation)

Stats cards above table:
- Total Participants
- Total Predictions Submitted
- Current Leader name + points
- Average Accuracy
```

---

## Phase 8: Live Matches Page

```
Create src/lib/football-api.ts:
- Helper functions for football-data.org API
- Function getLiveMatches(): GET /v4/matches?status=LIVE
- Function getScheduledMatches(date): GET /v4/matches?dateFrom=...&dateTo=...
- Function getStandings(competitionId): for World Cup 2026
- Note: World Cup 2026 competition ID may not exist yet on football-data.org
- Use competition ID 2000 (FIFA World Cup) or check their docs
- Handle rate limiting (10 req/min on free tier)
- Cache responses in memory for 60 seconds

Create src/components/LiveMatchBanner.tsx:
- Shows currently live matches with scores
- Auto-refreshes every 60 seconds
- If no live matches, show "No live matches currently"
- Green pulsing "LIVE" indicator

Create src/app/matches/page.tsx:
1. Fetch matches from our DB (full schedule)
2. Fetch live matches from football-data.org (if available)
3. Two sections:
   a. Live Now: LiveMatchBanner (if any live matches)
   b. Full Schedule: All matches from DB, grouped by date
4. Date navigation: scrollable date chips for quick filter
5. Each match card shows:
   - Date + time
   - Team A vs Team B
   - Score (if result exists, show it; otherwise "vs")
   - Round/Group badge
   - Click to view details
```

---

## Phase 9: Home Page Polish

```
Update src/app/page.tsx:

1. Hero section:
   - Background: World Cup themed gradient or pattern
   - Title: "World Cup 2026 Predictions"
   - Subtitle: "Predict matches, earn points, compete with friends"
   - CTA button: "Start Predicting" → /picks (or sign in)

2. Upcoming Matches section:
   - Next 5 matches from /api/matches?upcoming=true&limit=5
   - Compact cards: date, teams, countdown timer
   - "View All Schedule" link → /matches

3. Leaderboard Preview section:
   - Top 3 players from /api/leaderboard?limit=3
   - Podium style display (#1 gold, #2 silver, #3 bronze)
   - "View Full Leaderboard" link → /leaderboard

4. How It Works section:
   - 3 steps: Sign In → Make Predictions → Climb the Leaderboard
   - Simple icons/illustrations
```

---

## Phase 10: Final Polish & Deploy

```
1. Create .env.example with all variables documented

2. Update next.config.ts if needed for image domains (googleusercontent.com for avatars)

3. Create a proper layout with:
   - Responsive Navbar (collapses to hamburger on mobile)
   - Footer with credits
   - Consistent padding/margins
   - Dark/light mode support (optional)

4. Error handling:
   - Add error boundaries to each page
   - Show friendly error messages
   - Retry buttons on API failures

5. Loading states:
   - Skeleton loaders for all pages
   - Spinner for form submissions

6. SEO:
   - Proper title and meta tags per page
   - OpenGraph metadata

7. Prepare for Vercel deploy:
   - Ensure next.config.ts is Vercel-compatible
   - Set up vercel.json if needed
   - Document build command: next build
   - Document env variables needed in Vercel dashboard
   - Run seed script: npx prisma migrate deploy && npx tsx scripts/seed-from-sheets.ts
```

---

## Bonus: Sync Google Sheets Results (Admin)

```
Create src/app/api/sync/sheet/route.ts (if not already created):

POST /api/sync/sheet
- Requires x-api-key header matching ADMIN_API_KEY env var
- Fetches latest CSV from Google Sheets
- For each row:
  - If H column (result) is non-empty, update Match.result in DB
  - Calculate points: For each player column (I-AT), if prediction === result, increment points
  - Store points in memory or return in response (no need for points table, can compute on demand)
- Returns summary: { matchesUpdated: number, playersRecalculated: number }

This endpoint can be called manually or via Vercel Cron Jobs.
```

---

Use these prompts sequentially with any AI coding assistant. Each phase builds on the previous one. After completing all 10 phases, the app will be fully functional and ready to deploy.
