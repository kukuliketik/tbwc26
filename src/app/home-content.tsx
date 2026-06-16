'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { getFlag } from '@/lib/flags'
import { parseWC26Date } from '@/lib/worldcup26-api'

const WIB = 'Asia/Jakarta'

interface LiveGameData {
  homeScore: number
  awayScore: number
  isLive: boolean
  isFinished: boolean
  timeElapsed: string
  finished: string
  localDate?: string
  stadiumId?: string
  stadium?: { name: string; city: string; country: string } | null
}

interface Match {
  id: number
  date: string
  teamA: string
  teamB: string
  group: string | null
  round: string
  live?: LiveGameData | null
}

export default function HomeContent() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const authError = searchParams.get('error')
  const [upcoming, setUpcoming] = useState<Match[]>([])
  const [myPick, setMyPick] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const matchRes = await fetch('/api/matches?upcoming=true&limit=5')
        setUpcoming(await matchRes.json())
      } catch { /* silent */ }
    }
    load()
  }, [])

  useEffect(() => {
    if (!session?.user) return
    fetch('/api/winner-pick')
      .then((res) => res.json())
      .then((data) => { if (data?.team) setMyPick(data.team) })
      .catch(() => {})
  }, [session?.user])

  return (
    <div className="page-enter space-y-20">
      {/* Auth Error Banner */}
      {authError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">Sign In Error: {authError}</p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">
              {authError === 'OAuthAccountNotLinked'
                ? 'Your account was already found but not linked. This has been fixed — please try signing in again.'
                : authError === 'Configuration'
                  ? 'Authentication configuration issue. Try running: npx prisma db push && npm run dev'
                  : 'Authentication error. Please try again or contact support.'}
            </p>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="relative -mx-4 sm:-mx-6 lg:-mx-8 -mt-8 px-4 sm:px-6 lg:px-8 py-20 bg-hero overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://www.cityam.com/wp-content/uploads/2023/05/Screenshot-2023-05-18-at-08.52.55-Large.jpeg" 
            alt="" 
            className="w-full h-full object-cover object-center contrast-125 brightness-75"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-wc-navy/90 via-wc-navy/70 to-transparent" />
        </div>
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-wc-gold/20 backdrop-blur-sm text-wc-gold text-xs font-semibold px-4 py-1.5 rounded-full mb-6 border border-wc-gold/40">
            <span className="w-2 h-2 bg-wc-gold rounded-full live-pulse" />
            FIFA World Cup 2026 • June 11 – July 19
          </div>

          {/* Official WC Logo + TBWC26 branding */}
          <div className="flex items-center gap-4 mb-4">
            <img
              src="https://digitalhub.fifa.com/transform/157d23bf-7e13-4d7b-949e-5d27d340987e/WC26_Logo?&io=transform:fill&quality=75"
              alt="WC2026"
              className="h-16 sm:h-20 object-contain"
            />
            <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight leading-tight">
              <mark className="bg-wc-red text-white">TBWC26</mark>
            </h1>
          </div>
          <p className="text-lg text-white mb-8 max-w-xl leading-relaxed">
            <mark className="bg-yellow-400 text-black">
              Transaction Banking World Cup 2026 Predictions Challenge
            </mark>
          </p>
          <div className="flex items-center gap-3">
            {session?.user ? (
              <>
                <Link
                  href="/picks"
                  className="bg-wc-gold text-wc-navy px-6 py-3 rounded-xl font-bold text-sm hover:bg-wc-gold-light transition-all shadow-lg shadow-wc-gold/30 hover:scale-105"
                >
                  ⚽ Make Your Picks
                </Link>
                <Link
                  href="/leaderboard"
                  className="bg-white/20 backdrop-blur-sm text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-white/30 transition-all border border-white/30"
                >
                  🏆 Leaderboard
                </Link>
              </>
            ) : (
              <div className="text-white bg-wc-navy/80 px-4 py-2 rounded-xl text-sm">
                Sign in with Google to start predicting
              </div>
            )}
          </div>
        </div>
      </section>

      {/* World Cup Winner Pick */}
      {session?.user && (
        <section>
          {myPick ? (
            <Link
              href="/winner-pick"
              className="block bg-fifa-card rounded-2xl p-6 border border-wc-gold/20 hover:border-wc-gold/40 transition-all hover:shadow-fifa-gold group"
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl">{getFlag(myPick)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/50 mb-0.5">Your World Cup Champion pick</p>
                  <h2 className="text-lg font-bold text-wc-gold truncate">{myPick}</h2>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-semibold text-wc-red bg-wc-red/10 px-2.5 py-1 rounded-full border border-wc-red/30">
                    LOCKED
                  </span>
                  <span className="text-white/30 group-hover:text-wc-gold transition-colors text-xl">→</span>
                </div>
              </div>
            </Link>
          ) : (
            <Link
              href="/winner-pick"
              className="block bg-fifa-card rounded-2xl p-6 border border-wc-gold/20 hover:border-wc-gold/40 transition-all hover:shadow-fifa-gold group"
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl group-hover:scale-110 transition-transform">🏆</span>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-white group-hover:text-wc-gold transition-colors">
                    Pick Your World Cup Champion
                  </h2>
                  <p className="text-sm text-white/50">Choose the team you think will win it all</p>
                </div>
                <span className="text-white/30 group-hover:text-wc-gold transition-colors text-xl">→</span>
              </div>
            </Link>
          )}
        </section>
      )}

      {/* Upcoming Matches */}
      {upcoming.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Upcoming Matches</h2>
              <p className="text-sm text-gray-500 mt-1">Next matches to predict</p>
            </div>
            <Link href="/matches" className="text-sm font-medium text-white hover:text-white/80 transition-colors">
              Full Schedule →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {upcoming.map((m) => {
              const d = m.live?.localDate
                ? toZonedTime(parseWC26Date(m.live.localDate, m.live.stadiumId), WIB)
                : toZonedTime(new Date(m.date), WIB)
              return (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-lg transition-all hover:-translate-y-0.5 group"
                >
                  {/* Date header */}
                  <div className="bg-gradient-to-r from-wc-navy to-wc-navy-dark dark:from-gray-800 dark:to-gray-900 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-white/90">{format(d, 'EEE, MMM d')}</span>
                    {m.group && (
                      <span className="text-[10px] font-bold text-wc-gold bg-white/10 px-2 py-0.5 rounded-full">
                        Grp {m.group}
                      </span>
                    )}
                  </div>

                  {/* Match body - stacked team layout */}
                  <div className="p-5">
                    <div className="flex items-stretch justify-between gap-2">
                      {/* Team A */}
                      <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0">
                        <span className="text-4xl sm:text-5xl mb-2">{getFlag(m.teamA)}</span>
                        <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white leading-tight truncate w-full">{m.teamA}</span>
                      </div>

                      {/* VS badge */}
                      <div className="flex-shrink-0 flex flex-col items-center justify-center gap-1">
                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          <span className="text-[10px] font-black text-gray-400">VS</span>
                        </div>
                        <span className="text-xs font-medium text-gray-400">{format(d, 'HH:mm')}</span>
                      </div>

                      {/* Team B */}
                      <div className="flex-1 flex flex-col items-center justify-center text-center min-w-0">
                        <span className="text-4xl sm:text-5xl mb-2">{getFlag(m.teamB)}</span>
                        <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white leading-tight truncate w-full">{m.teamB}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      

      {/* How it works */}
      <section>
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-10">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: 'Sign In with Google', desc: 'Connect with your Google account to join TBWC26 instantly.', icon: '🔑', step: 1 },
            { title: 'Make Your Predictions', desc: 'Pick winners for all 104 matches from group stage to the final.', icon: '⚽', step: 2 },
            { title: 'Climb the Leaderboard', desc: '1 point per correct pick. The highest score at the end wins the trophy!', icon: '🏆', step: 3 },
          ].map((item) => (
            <div key={item.step} className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 text-center hover:shadow-md transition-all">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-wc-navy dark:bg-wc-gold rounded-full flex items-center justify-center text-xs font-bold text-white dark:text-wc-navy">
                {item.step}
              </div>
              <div className="text-4xl mb-3 mt-2">{item.icon}</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{item.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 pt-8 pb-12 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <img
            src="https://digitalhub.fifa.com/transform/157d23bf-7e13-4d7b-949e-5d27d340987e/WC26_Logo?&io=transform:fill&quality=75"
            alt="WC2026"
            className="h-6 object-contain opacity-50"
          />
        </div>
        <p className="text-sm text-gray-400">
          TBWC26 — Transaction Banking World Cup 2026 Predictions Challenge
        </p>
      </footer>
    </div>
  )
}
