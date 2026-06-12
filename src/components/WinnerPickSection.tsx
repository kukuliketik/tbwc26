'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { getFlag } from '@/lib/flags'

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

export default function WinnerPickSection() {
  const { data: session } = useSession()
  const [myPick, setMyPick] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!session?.user) {
      setLoading(false)
      return
    }
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

  if (!session?.user) return null

  return (
    <section className="relative">
      <div className="bg-fifa-card rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-wc-navy to-wc-navy-dark px-6 py-5 flex items-center gap-3">
          <span className="text-3xl">🏆</span>
          <div>
            <h2 className="text-xl font-bold text-white">Pick Your World Cup Champion</h2>
            <p className="text-sm text-white/60 mt-0.5">
              {myPick
                ? 'Your pick is locked in. Good luck!'
                : 'Choose one team — your pick is final and cannot be changed.'}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-white/40">Loading...</div>
          ) : myPick ? (
            /* Locked state */
            <div className="text-center py-6">
              <div className="text-7xl mb-4">{getFlag(myPick)}</div>
              <p className="text-sm text-white/50 mb-1">Your World Cup Champion pick</p>
              <p className="text-2xl font-bold text-white">{myPick}</p>
              <div className="mt-4 inline-flex items-center gap-2 bg-wc-red/20 text-wc-red text-xs font-semibold px-4 py-2 rounded-full border border-wc-red/30">
                <span className="w-2 h-2 bg-wc-red rounded-full" />
                LOCKED — CANNOT BE CHANGED
              </div>
            </div>
          ) : (
            /* Selection state */
            <>
              {/* Search */}
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-wc-gold/50 transition-colors"
                />
              </div>

              {/* Team grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-[400px] overflow-y-auto pr-1">
                {filtered.map((team) => {
                  const isSelected = selected === team
                  return (
                    <button
                      key={team}
                      onClick={() => handlePick(team)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all hover:scale-105 ${
                        isSelected
                          ? 'bg-wc-gold/20 border-wc-gold text-white shadow-fifa-gold'
                          : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:border-white/30'
                      }`}
                    >
                      <span className="text-3xl">{getFlag(team)}</span>
                      <span className="text-[10px] font-medium text-center leading-tight truncate w-full">
                        {team}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Confirm button */}
              {selected && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="btn-fifa-gold px-8 py-3 rounded-xl font-bold text-white text-sm"
                  >
                    🔒 Confirm {selected}
                  </button>
                </div>
              )}
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
                  onClick={() => setShowConfirm(false)}
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
    </section>
  )
}
