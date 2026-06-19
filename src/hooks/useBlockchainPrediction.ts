'use client'

import { useCallback } from 'react'
import { useWeb3Auth } from '@/components/Web3AuthProvider'
import { hashPrediction, submitStorePredictionTx } from '@/lib/blockchain'

export function useBlockchainPrediction() {
  const { provider, connected } = useWeb3Auth()

  const submitOnChain = useCallback(
    async (params: {
      userId: string
      matchId: number
      pick: string
      teamA: string
      teamB: string
      homeScore?: number | null
      awayScore?: number | null
      cornersPick?: string | null
    }) => {
      if (!provider || !connected) return
      try {
        const predictionHash = hashPrediction({
          userId: params.userId,
          matchId: params.matchId,
          pick: params.pick,
          homeScore: params.homeScore,
          awayScore: params.awayScore,
          cornersPick: params.cornersPick,
        })
        const matchName = `${params.teamA} vs ${params.teamB}`
        const summary = `Pick: ${params.pick === 'Team A' ? params.teamA : params.pick === 'Team B' ? params.teamB : 'Draw'}`
        await submitStorePredictionTx(provider, predictionHash, params.userId, params.matchId, matchName, summary)
      } catch (err) {
        console.warn('[blockchain] on-chain store failed:', err)
      }
    },
    [provider, connected],
  )

  return { submitOnChain, hasWallet: connected }
}
