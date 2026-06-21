'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { useWeb3Auth } from '@/components/Web3AuthProvider'
import {
  getUserOnChainPredictions,
  getUnclaimedRewards,
  hashPrediction,
  submitStorePredictionTxWithWallet,
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

interface OnChainPrediction {
  predictionHash: string
  userId: string
  matchId: bigint
  matchName: string
  predictionSummary: string
  timestamp: bigint
  submitter: string
  isCorrect: boolean
  isSettled: boolean
  rewardTier: number
  rewardAmount: bigint
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
  const [predictions, setPredictions] = useState<OnChainPrediction[]>([])
  const [dbPredictions, setDbPredictions] = useState<DbPrediction[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tokenBalance, setTokenBalance] = useState<string>('0')
  const [unclaimedRewards, setUnclaimedRewards] = useState<string>('0')
  const [claiming, setClaiming] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [polBalance, setPolBalance] = useState<string>('0')
  const [swapRate, setSwapRate] = useState<string>('0')
  const [contractPolBalance, setContractPolBalance] = useState<string>('0')
  const [swapAmount, setSwapAmount] = useState<string>('')
  const [swapping, setSwapping] = useState(false)
  const [fauceting, setFauceting] = useState(false)
  const [txHashes, setTxHashes] = useState<Record<number, { storeTxHash?: string; settleTxHash?: string }>>({})

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
          return { ...p, match: { ...p.match, teamA: match.teamA, teamB: match.teamB, date: match.date } }
        }
        return p
      })
      setDbPredictions(enriched)

      if (walletAddress) {
        let onChainPredictions: OnChainPrediction[] = []
        try {
          const predictionsData = await getUserOnChainPredictions(walletAddress)
          onChainPredictions = predictionsData as OnChainPrediction[]
          setPredictions(onChainPredictions)
        } catch {
          setPredictions([])
        }

        try {
          const unclaimed = await getUnclaimedRewards(walletAddress)
          setUnclaimedRewards(unclaimed)
        } catch {
          setUnclaimedRewards('0')
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

        try {
          const earned = onChainPredictions.reduce(
            (sum, p) => sum + Number(p.rewardAmount), 0,
          )
          setTokenBalance(String(earned))
        } catch {
          setTokenBalance('0')
        }

        try {
          const txRes = await fetch('/api/predictions/txhashes', { method: 'POST' })
          const txData = await txRes.json()
          setTxHashes(txData)
        } catch {
          setTxHashes({})
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [walletAddress])

  useEffect(() => {
    if (!walletAddress) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [walletAddress, loadData])

  const getSyncableMatch = (): DbPrediction | null => {
    const liveMatch = matches.find((m) => m.live?.isLive && !m.live?.isFinished)
    if (liveMatch) {
      const dbPred = dbPredictions.find((p) => p.matchId === liveMatch.id)
      if (dbPred) return dbPred
    }

    const endedMatches = matches
      .filter((m) => m.live?.isFinished || m.result)
      .sort((a, b) => b.id - a.id)

    for (const ended of endedMatches) {
      const dbPred = dbPredictions.find((p) => p.matchId === ended.id)
      if (dbPred) return dbPred
    }

    return null
  }

  const isSynced = (matchId: number): boolean => {
    return predictions.some((p) => Number(p.matchId) === matchId)
  }

  const syncMatch = async (matchId: number) => {
    if (!wallet || syncing) return
    const userId = session?.user?.id
    if (!userId) return

    const dbPred = dbPredictions.find((p) => p.matchId === matchId)
    if (!dbPred) return

    setSyncing(true)
    try {
      const predictionHash = hashPrediction({
        userId,
        matchId: dbPred.matchId,
        pick: dbPred.pick,
        homeScore: dbPred.homeScore,
        awayScore: dbPred.awayScore,
        cornersPick: dbPred.cornersPick,
      })
      const matchName = `${dbPred.match.teamA} vs ${dbPred.match.teamB}`
      const summary = `Pick: ${dbPred.pick}`
      const tx = await submitStorePredictionTxWithWallet(wallet, predictionHash, userId, matchId, matchName, summary)
      await fetch('/api/predictions/txhash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, storeTxHash: tx.hash }),
      })
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (!msg.includes('Prediction already stored')) {
        console.error('[sync] failed:', msg)
      }
    } finally {
      setSyncing(false)
    }
  }

  const claimRewards = async () => {
    if (!wallet || claiming) return
    setClaiming(true)
    try {
      const contract = await import('@/lib/blockchain').then((m) =>
        m.claimRewardsTx(wallet as unknown as import('ethers').Eip1193Provider),
      )
      await contract.wait()
      await loadData()
    } catch (err) {
      console.error('Claim failed:', err)
    } finally {
      setClaiming(false)
    }
  }

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

  const syncable = getSyncableMatch()
  const settledPredictions = predictions.filter((p) => p.isSettled)
  const correctCount = settledPredictions.filter((p) => p.isCorrect).length
  const wrongCount = settledPredictions.filter((p) => !p.isCorrect).length

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

      {/* On-Chain Contract Data */}
      {walletAddress && (
        <div className="bg-fifa-card rounded-2xl p-6 border border-wc-gold/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-wc-gold">Smart Contract Data</h2>
            <a
              href={`https://sourcify.dev/server/repo-ui/80002/${process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-wc-teal hover:underline"
            >
              View Source on Sourcify →
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{predictions.length}</p>
              <p className="text-[10px] text-white/40">Synced</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-green-400">{correctCount}</p>
              <p className="text-[10px] text-white/40">Won</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-red-400">{wrongCount}</p>
              <p className="text-[10px] text-white/40">Lost</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-wc-gold">{tokenBalance}</p>
              <p className="text-[10px] text-white/40">PRED</p>
            </div>
          </div>

          {/* Token Balance & Claim */}
          <div className="flex items-center justify-between bg-white/5 rounded-xl p-4 mb-4">
            <div>
              <p className="text-xs text-white/40">PRED Token Balance</p>
              <p className="text-xl font-bold text-white">{tokenBalance} <span className="text-sm text-white/40">PRED</span></p>
            </div>
            {Number(unclaimedRewards) > 0 && (
              <button
                onClick={claimRewards}
                disabled={claiming}
                className="px-4 py-2 text-xs font-semibold bg-wc-gold hover:bg-wc-gold/90 text-wc-navy rounded-lg transition-colors disabled:opacity-50"
              >
                {claiming ? 'Claiming...' : `Claim ${unclaimedRewards} PRED`}
              </button>
            )}
          </div>

          {/* POL Balance & Swap */}
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

          {/* Sync Match - Live / Latest Ended */}
          {syncable && !isSynced(syncable.matchId) && (
            <div className="bg-wc-gold/10 border border-wc-gold/30 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-wc-gold font-semibold mb-1">READY TO SYNC</p>
                  <p className="text-sm font-bold text-white">{syncable.match.teamA} vs {syncable.match.teamB}</p>
                  <p className="text-[10px] text-white/40">Pick: {syncable.pick}</p>
                </div>
                {Number(polBalance) >= 0.02 ? (
                  <button
                    onClick={() => syncMatch(syncable.matchId)}
                    disabled={syncing}
                    className="px-4 py-2 text-xs font-semibold bg-wc-gold hover:bg-wc-gold/90 text-wc-navy rounded-lg transition-colors disabled:opacity-50"
                  >
                    {syncing ? 'Syncing...' : 'Sync to Chain'}
                  </button>
                ) : (
                  <p className="text-[10px] text-red-400">Need POL for gas</p>
                )}
              </div>
            </div>
          )}

          {/* Prediction History */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : predictions.length === 0 && dbPredictions.length === 0 ? (
            <p className="text-sm text-white/40">No predictions yet. Make a pick to see them here.</p>
          ) : (
            <div className="space-y-2">
              {predictions.map((p) => {
                const matchId = Number(p.matchId)
                const match = matches.find((m) => m.id === matchId)
                const matchName = match ? `${match.teamA} vs ${match.teamB}` : p.matchName
                const pick = p.predictionSummary.replace('Pick: ', '')
                const txData = txHashes[matchId]
                const storeTx = txData?.storeTxHash
                const settleTx = txData?.settleTxHash

                return (
                  <div key={`chain-${matchId}`} className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{matchName}</p>
                        <p className="text-[10px] text-wc-gold">Pick: {pick}</p>
                        <div className="flex gap-2 mt-0.5">
                          {storeTx && (
                            <a
                              href={`https://amoy.polygonscan.com/tx/${storeTx}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-wc-teal hover:underline font-mono"
                            >
                              Store ↗
                            </a>
                          )}
                          {settleTx && (
                            <a
                              href={`https://amoy.polygonscan.com/tx/${settleTx}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-wc-teal hover:underline font-mono"
                            >
                              Settle ↗
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                          On-Chain
                        </span>
                        {p.isSettled ? (
                          p.isCorrect ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                              +0.0001 PRED
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                              -0.0001 PRED
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

              {dbPredictions
                .filter((p) => !predictions.some((op) => Number(op.matchId) === p.matchId))
                .map((p) => (
                  <div key={`db-${p.matchId}`} className="bg-white/5 rounded-xl p-3 border border-white/10 opacity-50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{p.match.teamA} vs {p.match.teamB}</p>
                        <p className="text-[10px] text-wc-gold">Pick: {p.pick}</p>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                        Not Synced
                      </span>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {/* Contract Address */}
          <div className="mt-4 pt-3 border-t border-white/10">
            <p className="text-[10px] text-white/30">Contract: <span className="font-mono">{process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS?.slice(0, 6)}...{process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS?.slice(-4)}</span></p>
            <p className="text-[10px] text-white/30">Network: Polygon Amoy Testnet</p>
          </div>
        </div>
      )}
    </div>
  )
}
