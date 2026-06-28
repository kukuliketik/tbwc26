'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { useWeb3Auth } from '@/components/Web3AuthProvider'
import {
  getUserTokenBalance,
  getUserPOLBalance,
  getSwapRate,
  swapPREDForPOL,
  getContractPOLBalance,
} from '@/lib/blockchain'

interface LiveGameData {
  homeScore: number
  awayScore: number
  isLive: boolean
  isFinished: boolean
  timeElapsed: string
}

interface Match {
  id: number
  date: string
  round: string
  group: string | null
  stage: string
  teamA: string
  teamB: string
  result: string | null
  live?: LiveGameData | null
}

interface DbPrediction {
  id: string
  userId: string
  matchId: number
  pick: string
  homeScore: number | null
  awayScore: number | null
  cornersPick: string | null
  match: { teamA: string; teamB: string; result: string | null; date: string }
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const { wallet, address, connecting, connect } = useWeb3Auth()
  const [dbPredictions, setDbPredictions] = useState<DbPrediction[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tokenBalance, setTokenBalance] = useState<string>('0')
  const [polBalance, setPolBalance] = useState<string>('0')
  const [swapRate, setSwapRate] = useState<string>('0')
  const [contractPolBalance, setContractPolBalance] = useState<string>('0')
  const [swapAmount, setSwapAmount] = useState<string>('')
  const [swapping, setSwapping] = useState(false)
  const [fauceting, setFauceting] = useState(false)
  const [predFauceting, setPredFauceting] = useState(false)

  const walletAddress = address

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [dbRes, matchesRes] = await Promise.all([
        fetch('/api/predictions').then((r) => r.json()) as Promise<DbPrediction[]>,
        fetch('/api/matches').then((r) => r.json()) as Promise<Match[]>,
      ])
      setMatches(matchesRes)

      const matchesMap = new Map(matchesRes.map((m) => [m.id, m]))

      const enriched = dbRes.map((p) => {
        const match = matchesMap.get(p.matchId)
        if (match) {
          return { ...p, match: { ...p.match, teamA: match.teamA, teamB: match.teamB, date: match.date, result: match.result } }
        }
        return p
      })
      setDbPredictions(enriched)

      if (walletAddress) {
        try {
          const bal = await getUserTokenBalance(walletAddress)
          setTokenBalance(bal)
        } catch {
          setTokenBalance('0')
        }

        try {
          const pol = await getUserPOLBalance(walletAddress)
          setPolBalance(pol)
        } catch {
          setPolBalance('0')
        }

        try {
          const rate = await getSwapRate()
          setSwapRate(rate)
        } catch {
          setSwapRate('0')
        }

        try {
          const contractPol = await getContractPOLBalance()
          setContractPolBalance(contractPol)
        } catch {
          setContractPolBalance('0')
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [walletAddress])

  useEffect(() => {
    // loadData is async and only updates state after data fetching; suppress strict rule
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  const handleSwap = async () => {
    if (!wallet || !swapAmount || swapping) return
    setSwapping(true)
    try {
      await swapPREDForPOL(swapAmount, wallet as unknown as import('ethers').Eip1193Provider)
      setSwapAmount('')
      await loadData()
    } catch (err) {
      console.error('Swap failed:', err)
    } finally {
      setSwapping(false)
    }
  }

  const requestFaucet = async () => {
    if (fauceting) return
    setFauceting(true)
    try {
      const res = await fetch('/api/wallet/faucet', { method: 'POST' })
      const data = await res.json()
      if (data.funded) {
        await loadData()
      }
    } catch (err) {
      console.error('Faucet failed:', err)
    } finally {
      setFauceting(false)
    }
  }

  const requestPredFaucet = async () => {
    if (predFauceting) return
    setPredFauceting(true)
    try {
      const res = await fetch('/api/wallet/pred-faucet', { method: 'POST' })
      const data = await res.json()
      if (data.funded) {
        await loadData()
      }
    } catch (err) {
      console.error('PRED faucet failed:', err)
    } finally {
      setPredFauceting(false)
    }
  }

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (status === 'unauthenticated') redirect('/')
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-wc-navy border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const finishedPredictions = dbPredictions.filter((p) => p.match.result)
  const correctCount = finishedPredictions.filter((p) => {
    if (p.match.result) return p.pick === p.match.result
    return false
  }).length
  const wrongCount = finishedPredictions.filter((p) => {
    if (p.match.result) return p.pick !== p.match.result
    return false
  }).length
  const pendingCount = dbPredictions.length - finishedPredictions.length

  return (
    <div className="page-enter space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white">Profile</h1>

      {/* Wallet Card */}
      <div className="bg-fifa-card rounded-2xl p-6 border border-wc-gold/20">
        <h2 className="text-sm font-semibold text-wc-gold mb-3">Web3Auth Wallet</h2>
        {walletAddress ? (
          <div className="space-y-3">
            <p className="text-xs text-white/60 font-mono break-all">{walletAddress}</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={copyAddress}
                className="px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Address'}
              </button>
              <a
                href={`https://amoy.polygonscan.com/address/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs font-semibold bg-wc-gold/20 hover:bg-wc-gold/30 text-wc-gold rounded-lg transition-colors"
              >
                View on Polygonscan
              </a>
            </div>
          </div>
        ) : (
          <>
          <p className="text-sm text-white/40 mb-3">Wallet not connected.</p>
          <button
            onClick={connect}
            disabled={connecting}
            className="px-4 py-2 text-sm font-semibold bg-wc-gold hover:bg-wc-gold/90 text-wc-navy rounded-lg transition-colors disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : 'Connect Wallet with Google'}
          </button>
          </>
        )}
      </div>

      {/* Balances */}
      {walletAddress && (
        <div className="bg-fifa-card rounded-2xl p-6 border border-wc-gold/20">
          <h2 className="text-sm font-semibold text-wc-gold mb-4">Balances</h2>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-wc-gold">{dbPredictions.length}</p>
              <p className="text-[10px] text-white/40">Total Picks</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-green-400">{correctCount}</p>
              <p className="text-[10px] text-white/40">Correct</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-red-400">{wrongCount}</p>
              <p className="text-[10px] text-white/40">Wrong</p>
            </div>
          </div>

          {/* Points Audit Link */}
          <Link
            href="/points"
            className="flex items-center justify-between w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span>📊</span>
              <span className="text-xs font-semibold text-white/80">View Points Audit Log</span>
            </div>
            <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          {/* PRED Balance */}
          <div className="flex items-center justify-between bg-white/5 rounded-xl p-4 mb-4">
            <div>
              <p className="text-xs text-white/40">PRED Token Balance</p>
              <p className="text-xl font-bold text-white">{tokenBalance} <span className="text-sm text-white/40">PRED</span></p>
            </div>
            {Number(tokenBalance) < 10 && (
              <button
                onClick={requestPredFaucet}
                disabled={predFauceting}
                className="px-4 py-2 text-xs font-semibold bg-wc-teal hover:bg-wc-teal/80 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {predFauceting ? 'Minting...' : 'Get 10 PRED'}
              </button>
            )}
          </div>

          {/* POL Balance */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[10px] text-white/40">Wallet POL</p>
              <p className="text-sm font-bold text-white">{Number(polBalance).toFixed(4)} <span className="text-[10px] text-white/40">POL</span></p>
              {Number(polBalance) < 0.02 && (
                <button
                  onClick={requestFaucet}
                  disabled={fauceting}
                  className="mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-wc-teal hover:bg-wc-teal/80 text-white transition-colors disabled:opacity-50"
                >
                  {fauceting ? 'Requesting...' : 'Get 0.02 POL'}
                </button>
              )}
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[10px] text-white/40">Contract POL</p>
              <p className="text-sm font-bold text-wc-teal">{Number(contractPolBalance).toFixed(4)} <span className="text-[10px] text-white/40">POL</span></p>
            </div>
          </div>

          {/* Swap PRED → POL */}
          {Number(tokenBalance) > 0 && (
            <div className="bg-white/5 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-white/40">Swap PRED → POL</p>
                <p className="text-[10px] text-white/30">Rate: 1 PRED = {swapRate} POL</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max={tokenBalance}
                  step="0.1"
                  value={swapAmount}
                  onChange={(e) => setSwapAmount(e.target.value)}
                  placeholder="Amount PRED"
                  className="flex-1 bg-white/10 text-white text-sm rounded-lg px-3 py-2 placeholder:text-white/30 outline-none focus:ring-1 focus:ring-wc-gold/50"
                />
                <button
                  onClick={handleSwap}
                  disabled={swapping || !swapAmount || Number(swapAmount) <= 0}
                  className="px-4 py-2 text-xs font-semibold bg-wc-teal hover:bg-wc-teal/80 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {swapping ? 'Swapping...' : 'Swap'}
                </button>
              </div>
              {swapAmount && Number(swapAmount) > 0 && (
                <p className="text-[10px] text-white/30 mt-1">
                  You receive: {(Number(swapAmount) * Number(swapRate)).toFixed(4)} POL
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Predictions */}
      {walletAddress && (
        <div className="bg-fifa-card rounded-2xl p-6 border border-wc-gold/20">
          <h2 className="text-sm font-semibold text-wc-gold mb-4">My Predictions</h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : dbPredictions.length === 0 ? (
            <p className="text-sm text-white/40">No predictions yet. Make a pick to see them here.</p>
          ) : (
            <div className="space-y-2">
              {dbPredictions.map((p) => {
                const match = matches.find((m) => m.id === p.matchId)
                const matchName = match ? `${match.teamA} vs ${match.teamB}` : `Match #${p.matchId}`
                const isFinished = !!p.match.result
                const isCorrect = isFinished && p.pick === p.match.result

                return (
                  <div key={p.id} className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{matchName}</p>
                        <p className="text-[10px] text-wc-gold">Pick: {p.pick}</p>
                        {isFinished && (
                          <p className="text-[10px] text-white/40">Result: {p.match.result}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isFinished ? (
                          isCorrect ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                              Correct
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                              Wrong
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
