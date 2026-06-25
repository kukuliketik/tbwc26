'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { getFlag } from '@/lib/flags'
import Avatar from '@/components/Avatar'

const PICK_DEADLINE = new Date('2026-06-28T23:59:59')

const ALL_TEAMS = [
  'Mexico', 'South Africa', 'South Korea', 'Czech Republic',
  'Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland',
  'Brazil', 'Morocco', 'Haiti', 'Scotland',
  'United States', 'Paraguay', 'Australia', 'Turkey',
  'Ivory Coast', 'Ecuador', 'Germany', 'Netherlands',
  'Japan', 'Sweden', 'Tunisia', 'Belgium',
  'Egypt', 'Iran', 'New Zealand', 'Spain',
  'Saudi Arabia', 'Cape Verde', 'Democratic Republic of the Congo', 'Uruguay',
  'France', 'Iraq', 'Senegal', 'Norway',
  'Argentina', 'Austria', 'Algeria', 'Jordan',
  'Portugal', 'Uzbekistan', 'Colombia', 'England',
  'Croatia', 'Ghana', 'Panama', 'Curaçao',
]

interface UserPick {
  name: string | null
  image: string | null
}

interface Stats {
  team: string
  count: number
  users: UserPick[]
}

export default function WinnerPickPage() {
  const { data: session } = useSession()
  const [myPick, setMyPick] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState<Stats[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [isLocked] = useState(() => new Date() >= PICK_DEADLINE)

  useEffect(() => {
    fetch('/api/winner-pick/stats')
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setStatsLoading(false))
  }, [])

  useEffect(() => {
    if (!session?.user) return
    fetch('/api/winner-pick')
      .then((res) => res.json())
      .then((data) => {
        if (data?.team) {
          setMyPick(data.team)
          setSelected(data.team)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session?.user])

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handlePick = (team: string) => {
    if (myPick) return
    setSelected(team)
    setShowConfirm(true)
  }

  const handleConfirm = async () => {
    if (!selected || myPick) return
    setSaving(true)
    try {
      const res = await fetch('/api/winner-pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: selected }),
      })
      if (res.ok) {
        setMyPick(selected)
        setShowConfirm(false)
        setStats((prev) => {
          const existing = prev.find((s) => s.team === selected)
          const userName = session?.user?.name ?? 'You'
          const userImage = session?.user?.image ?? null
          if (existing) {
            return prev.map((s) =>
              s.team === selected
                ? { ...s, count: s.count + 1, users: [{ name: userName, image: userImage }, ...s.users] }
                : s
            ).sort((a, b) => b.count - a.count)
          }
          return [{ team: selected, count: 1, users: [{ name: userName, image: userImage }] }, ...prev]
            .sort((a, b) => b.count - a.count)
        })
        showToast(`🎉 You picked ${selected} as World Cup 2026 champion!`)
      } else {
        const err = await res.json()
        showToast(err.error || 'Failed to save pick', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setSaving(false)
    }
  }

  const filtered = ALL_TEAMS.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase())
  )

  const totalPicks = stats.reduce((sum, s) => sum + s.count, 0)
  const maxCount = Math.max(...stats.map((s) => s.count), 1)

  const getStat = (team: string) => stats.find((s) => s.team === team)
  const getPercentage = (count: number) => totalPicks > 0 ? Math.round((count / totalPicks) * 100) : 0

  if (!session?.user) {
    return (
      <div className="page-enter space-y-8">
        <div className="text-center py-20">
          <span className="text-6xl mb-4 block">🏆</span>
          <h1 className="text-3xl font-bold text-white mb-2">Pick Your World Cup Champion</h1>
          <p className="text-white/60">Sign in with Google to make your champion pick.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">🏆 Pick Your World Cup Champion</h1>
        <p className="text-sm text-white/60">
          Choose one team to win it all — your pick is final and cannot be changed.
        </p>
        {!isLocked && (
          <p className="text-xs text-wc-gold mt-2">
            ⏰ Voting closes on June 28, 2026 at midnight
          </p>
        )}
        {isLocked && (
          <p className="text-xs text-wc-red mt-2">
            🔒 Voting has closed
          </p>
        )}
      </div>

      {/* Stats Section */}
      <div className="bg-fifa-card rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-wc-navy to-wc-navy-dark px-6 py-4">
          <h2 className="text-lg font-bold text-white">
            Champion Picks {totalPicks > 0 && <span className="font-normal text-white/60">({totalPicks})</span>}
          </h2>
        </div>

        <div className="p-6">
          {statsLoading ? (
            <div className="text-center py-8 text-white/40">Loading stats...</div>
          ) : stats.length === 0 ? (
            <div className="text-center py-8 text-white/40">No picks yet. Be the first!</div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {stats.map((s, i) => {
                const pct = getPercentage(s.count)
                const barWidth = (s.count / maxCount) * 100
                const isMyPick = myPick === s.team
                const isExpanded = expandedTeam === s.team
                return (
                  <div key={s.team}>
                    <button
                      onClick={() => setExpandedTeam(isExpanded ? null : s.team)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                        isMyPick ? 'bg-wc-gold/10 border border-wc-gold/30' : 'hover:bg-white/5'
                      }`}
                    >
                      <span className="text-sm font-bold text-white/40 w-6 text-right">
                        {i + 1}
                      </span>
                      <span className="text-2xl">{getFlag(s.team)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm font-semibold truncate ${isMyPick ? 'text-wc-gold' : 'text-white'}`}>
                            {s.team}
                          </span>
                          {isMyPick && (
                            <span className="text-[9px] font-bold text-wc-navy bg-wc-gold px-1.5 py-0.5 rounded-full">
                              YOUR PICK
                            </span>
                          )}
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${barWidth}%`,
                              background: isMyPick
                                ? 'linear-gradient(90deg, #BF9535, #FCF6BA)'
                                : 'linear-gradient(90deg, #00A99D, #00A99D)',
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-2">
                        <div>
                          <span className="text-sm font-bold text-white">{s.count}</span>
                          <span className="text-xs text-white/40 ml-1">({pct}%)</span>
                        </div>
                        <span className={`text-white/30 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          ▼
                        </span>
                      </div>
                    </button>

                    {/* Expanded user avatars */}
                    {isExpanded && s.users.length > 0 && (
                      <div className="ml-12 mr-3 mb-2 flex flex-wrap gap-2 p-3 bg-white/5 rounded-xl">
                        {s.users.map((u, j) => (
                          <div key={j} className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
                            <Avatar name={u.name} image={u.image} size="xs" />
                            <span className="text-xs text-white/80">{u.name || 'Anonymous'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pick Section */}
      <div className="bg-fifa-card rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-wc-navy to-wc-navy-dark px-6 py-4 flex items-center gap-3">
          <span className="text-2xl">⚽</span>
          <div>
            <h2 className="text-lg font-bold text-white">
              {myPick ? 'Your Pick' : 'Make Your Pick'}
            </h2>
            <p className="text-sm text-white/50">
              {myPick
                ? 'Your champion pick is locked in.'
                : 'Select a team below, then confirm.'}
            </p>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-white/40">Loading...</div>
          ) : myPick ? (
            /* Locked state */
            <div className="text-center py-8">
              <div className="text-8xl mb-4">{getFlag(myPick)}</div>
              <p className="text-sm text-white/50 mb-1">Your World Cup Champion pick</p>
              <p className="text-3xl font-bold text-white mb-3">{myPick}</p>
              <div className="inline-flex items-center gap-2 bg-wc-red/20 text-wc-red text-xs font-semibold px-4 py-2 rounded-full border border-wc-red/30">
                <span className="w-2 h-2 bg-wc-red rounded-full" />
                LOCKED — CANNOT BE CHANGED
              </div>
              {getStat(myPick) && getStat(myPick)!.count > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-white/50 mb-2">
                    {getStat(myPick)!.count} user{getStat(myPick)!.count !== 1 ? 's' : ''} picked {myPick}
                  </p>
                  <div className="flex justify-center flex-wrap gap-1.5">
                    {getStat(myPick)!.users.map((u, j) => (
                      <Avatar key={j} name={u.name} image={u.image} size="sm" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : isLocked ? (
            /* Locked state - voting closed */
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🔒</div>
              <h3 className="text-xl font-bold text-white mb-2">Voting is Closed</h3>
              <p className="text-sm text-white/60 mb-4">
                The deadline for champion picks has passed.
              </p>
              <div className="inline-flex items-center gap-2 bg-wc-red/20 text-wc-red text-xs font-semibold px-4 py-2 rounded-full border border-wc-red/30">
                <span className="w-2 h-2 bg-wc-red rounded-full" />
                DEADLINE PASSED
              </div>
            </div>
          ) : (
            /* Selection state */
            <>
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-wc-gold/50 transition-colors"
                />
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-[400px] overflow-y-auto pr-1">
                {filtered.map((team) => {
                  const isSelected = selected === team
                  const stat = getStat(team)
                  const count = stat?.count ?? 0
                  return (
                    <button
                      key={team}
                      onClick={() => handlePick(team)}
                      className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all hover:scale-105 ${
                        isSelected
                          ? 'bg-wc-gold/20 border-wc-gold text-white shadow-fifa-gold'
                          : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:border-white/30'
                      }`}
                    >
                      {count > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-wc-teal text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                          {count}
                        </span>
                      )}
                      <span className="text-3xl">{getFlag(team)}</span>
                      <span className="text-[10px] font-medium text-center leading-tight truncate w-full">
                        {team}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-wc-navy border border-wc-gold/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center">
              <div className="text-6xl mb-3">{getFlag(selected!)}</div>
              <h3 className="text-xl font-bold text-white mb-1">Confirm Your Pick</h3>
              <p className="text-sm text-white/60 mb-4">
                You are selecting <strong className="text-wc-gold">{selected}</strong> as the World Cup 2026 champion.
              </p>
              <div className="bg-wc-red/20 border border-wc-red/30 rounded-xl p-3 mb-5">
                <p className="text-sm text-wc-red font-semibold">
                  ⚠️ This action cannot be undone. You will not be able to change your pick after confirming.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowConfirm(false); setSelected(null) }}
                  className="flex-1 bg-white/10 text-white py-2.5 rounded-xl font-medium text-sm hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="flex-1 btn-fifa-gold text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : '✅ Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium toast-enter ${
            toast.type === 'success'
              ? 'bg-wc-teal text-white'
              : 'bg-wc-red text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
