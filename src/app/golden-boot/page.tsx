'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { getFlag } from '@/lib/flags'
import Avatar from '@/components/Avatar'

interface Player {
  playerId: string
  playerName: string
  team: string
  teamId: string
  goals: number
  assists: number
  minutesPlayed: number
  position: string
  image: string
  rank: number
}

interface UserPick {
  name: string | null
  image: string | null
}

interface PlayerStat {
  playerId: string
  playerName: string
  team: string
  count: number
  users: UserPick[]
}

export default function GoldenBootPage() {
  const { data: session } = useSession()
  const [myPick, setMyPick] = useState<{ playerId: string; playerName: string; team: string } | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [playersLoading, setPlayersLoading] = useState(true)
  const [dataSource, setDataSource] = useState<string>('')
  const [selected, setSelected] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState<PlayerStat[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [deadline, setDeadline] = useState<string | null>(null)

  const isRichData = dataSource === 'gameday'

  const isLocked = useMemo(() => {
    if (!deadline) return false
    return new Date() >= new Date(deadline)
  }, [deadline])

  useEffect(() => {
    fetch('/api/golden-boot/players')
      .then((res) => res.json())
      .then((data) => {
        if (data.players) setPlayers(data.players)
        if (data.source) setDataSource(data.source)
      })
      .catch(() => {})
      .finally(() => setPlayersLoading(false))

    fetch('/api/golden-boot/stats')
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setStatsLoading(false))
  }, [])

  useEffect(() => {
    if (!session?.user) return
    fetch('/api/golden-boot')
      .then((res) => res.json())
      .then((data) => {
        if (data.deadline) setDeadline(data.deadline)
        if (data.pick?.playerId) {
          setMyPick({ playerId: data.pick.playerId, playerName: data.pick.playerName, team: data.pick.team })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session?.user])

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleRowClick = (player: Player) => {
    if (myPick || isLocked) return
    setSelected(player)
    setShowConfirm(true)
  }

  const handleConfirm = async () => {
    if (!selected || myPick) return
    setSaving(true)
    try {
      const res = await fetch('/api/golden-boot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: selected.playerId,
          playerName: selected.playerName,
          team: selected.team,
        }),
      })
      if (res.ok) {
        setMyPick({ playerId: selected.playerId, playerName: selected.playerName, team: selected.team })
        setShowConfirm(false)
        setStats((prev) => {
          const existing = prev.find((s) => s.playerId === selected.playerId)
          const userName = session?.user?.name ?? 'You'
          const userImage = session?.user?.image ?? null
          if (existing) {
            return prev.map((s) =>
              s.playerId === selected.playerId
                ? { ...s, count: s.count + 1, users: [{ name: userName, image: userImage }, ...s.users] }
                : s
            )
          }
          return [{
            playerId: selected.playerId,
            playerName: selected.playerName,
            team: selected.team,
            count: 1,
            users: [{ name: userName, image: userImage }],
          }, ...prev]
        })
        showToast(`⚽ You picked ${selected.playerName} as Golden Boot winner!`)
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

  const tableRows = useMemo(() => {
    const filtered = players.filter((p) =>
      p.playerName.toLowerCase().includes(search.toLowerCase()) ||
      p.team.toLowerCase().includes(search.toLowerCase())
    )
    return filtered.map((player) => ({
      ...player,
      stat: stats.find((s) => s.playerId === player.playerId),
    }))
  }, [players, search, stats])

  if (!session?.user) {
    return (
      <div className="page-enter space-y-8">
        <div className="text-center py-20">
          <span className="text-6xl mb-4 block">⚽</span>
          <h1 className="text-3xl font-bold text-white mb-2">Golden Boot Prediction</h1>
          <p className="text-white/60">Sign in with Google to pick your Golden Boot winner.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">⚽ Golden Boot Prediction</h1>
        <p className="text-sm text-white/60">
          Pick the player you think will score the most goals in World Cup 2026.
        </p>
        {!isLocked && (
          <p className="text-xs text-wc-gold mt-2">
            ⏰ Voting closes when the Round of 16 starts
          </p>
        )}
        {isLocked && (
          <p className="text-xs text-wc-red mt-2">
            🔒 Voting has closed
          </p>
        )}
      </div>

      {myPick && (
        <div className="bg-gradient-to-r from-wc-gold/20 to-wc-gold/5 border border-wc-gold/30 rounded-2xl p-4">
          <div className="flex items-center gap-4">
            <div className="text-4xl">{getFlag(myPick.team)}</div>
            <div className="flex-1">
              <p className="text-xs text-white/50 uppercase tracking-wider">Your Golden Boot Pick</p>
              <p className="text-xl font-bold text-white">{myPick.playerName}</p>
              <p className="text-sm text-white/60">{myPick.team}</p>
            </div>
            <div className="inline-flex items-center gap-2 bg-wc-red/20 text-wc-red text-xs font-semibold px-3 py-1.5 rounded-full border border-wc-red/30">
              <span className="w-2 h-2 bg-wc-red rounded-full" />
              LOCKED
            </div>
          </div>
        </div>
      )}

      <div className="bg-fifa-card rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-wc-navy to-wc-navy-dark px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              adidas Golden Boot
            </h2>
            {!isRichData && players.length > 0 && (
              <p className="text-[10px] text-white/40 mt-0.5">
                {players.length} goal scorers via FIFA API v3
              </p>
            )}
          </div>
          <div className="relative w-64">
            <input
              type="text"
              placeholder="Search players or teams..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-wc-gold/50 transition-colors"
            />
          </div>
        </div>

        {loading || playersLoading || statsLoading ? (
          <div className="text-center py-16 text-white/40">Loading...</div>
        ) : (
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full">
              <thead className="sticky top-0 bg-fifa-card z-10">
                <tr className="border-b border-white/10">
                  <th className="text-center px-3 py-3 text-xs font-bold text-white/40 uppercase tracking-wider w-12">#</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Player</th>
                  <th className="text-center px-3 py-3 text-xs font-bold text-white/40 uppercase tracking-wider w-16">Goals</th>
                  {isRichData && (
                    <th className="text-center px-3 py-3 text-xs font-bold text-white/40 uppercase tracking-wider w-16">Assists</th>
                  )}
                  {isRichData && (
                    <th className="text-center px-3 py-3 text-xs font-bold text-white/40 uppercase tracking-wider w-20 hidden sm:table-cell">Minutes</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-bold text-white/40 uppercase tracking-wider">Users Pick</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={isRichData ? 6 : 4} className="text-center py-16 text-white/40">
                      {players.length === 0
                        ? 'No goals scored yet. Players will appear after matches are played.'
                        : 'No players match your search.'}
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row) => {
                    const isMyPick = myPick?.playerId === row.playerId
                    const canPick = !myPick && !isLocked
                    const pickCount = row.stat?.count ?? 0
                    const users = row.stat?.users ?? []

                    return (
                      <tr
                        key={row.playerId}
                        onClick={() => canPick && handleRowClick(row)}
                        className={`border-b border-white/5 transition-colors ${
                          isMyPick
                            ? 'bg-wc-gold/10'
                            : canPick
                              ? 'cursor-pointer hover:bg-white/5'
                              : ''
                        }`}
                      >
                        <td className="px-3 py-3 text-center">
                          <span className="text-sm font-bold text-white/40">{row.rank}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg overflow-hidden">
                              {row.image ? (
                                <img
                                  src={row.image}
                                  alt={row.playerName}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none'
                                  }}
                                />
                              ) : (
                                getFlag(row.team)
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold ${isMyPick ? 'text-wc-gold' : 'text-white'}`}>
                                  {row.playerName}
                                </span>
                                {isMyPick && (
                                  <span className="text-[9px] font-bold text-wc-navy bg-wc-gold px-1.5 py-0.5 rounded-full">
                                    YOUR PICK
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs">{getFlag(row.team)}</span>
                                <span className="text-xs text-white/40">{row.team}</span>
                                {row.position && (
                                  <span className="text-[10px] text-white/30 bg-white/10 px-1.5 py-0.5 rounded">
                                    {row.position}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-lg font-bold text-wc-gold">{row.goals}</span>
                        </td>
                        {isRichData && (
                          <td className="px-3 py-3 text-center">
                            <span className="text-sm text-white/60">{row.assists}</span>
                          </td>
                        )}
                        {isRichData && (
                          <td className="px-3 py-3 text-center hidden sm:table-cell">
                            <span className="text-sm text-white/40">{row.minutesPlayed}</span>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          {pickCount > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-2">
                                {users.slice(0, 5).map((u, i) => (
                                  <Avatar key={i} name={u.name} image={u.image} size="xs" className="ring-2 ring-fifa-card" />
                                ))}
                                {users.length > 5 && (
                                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[8px] font-bold text-white ring-2 ring-fifa-card">
                                    +{users.length - 5}
                                  </div>
                                )}
                              </div>
                              <span className="text-xs text-white/40">
                                {pickCount}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-white/20">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showConfirm && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-wc-navy border border-wc-gold/30 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-5xl mx-auto mb-3 overflow-hidden">
                {selected.image ? (
                  <img src={selected.image} alt={selected.playerName} className="w-full h-full object-cover" />
                ) : (
                  getFlag(selected.team)
                )}
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Confirm Your Pick</h3>
              <p className="text-sm text-white/60 mb-4">
                You are selecting <strong className="text-wc-gold">{selected.playerName}</strong> ({selected.team}) as the Golden Boot winner.
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
