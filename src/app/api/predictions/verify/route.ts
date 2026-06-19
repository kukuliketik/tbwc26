import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ethers } from 'ethers'

const PREDICTION_REGISTRY_ABI = [
  'function markPrediction(bytes32 predictionHash, bool correct, uint8 rewardTier) external',
  'function getPredictionCount() external view returns (uint256)',
]

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS as string
const PRIVATE_KEY = process.env.CONTRACT_OWNER_PRIVATE_KEY as string
const POLYGON_RPC = process.env.NEXT_PUBLIC_AMOY_RPC || 'https://rpc-amoy.polygon.technology'

function hashPrediction(data: {
  userId: string
  matchId: number
  pick: string
  homeScore?: number | null
  awayScore?: number | null
  cornersPick?: string | null
}): string {
  const raw = JSON.stringify(data)
  return ethers.keccak256(ethers.toUtf8Bytes(raw))
}

function determineRewardTier(
  pick: string,
  result: string,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
  matchHomeScore: number,
  matchAwayScore: number,
): number {
  if (pick !== result) return 0

  if (
    homeScore != null &&
    awayScore != null &&
    homeScore === matchHomeScore &&
    awayScore === matchAwayScore
  ) {
    return 2
  }

  return 1
}

export async function POST() {
  if (!PRIVATE_KEY) {
    return NextResponse.json({ error: 'Owner private key not configured' }, { status: 500 })
  }

  const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC)
  const wallet = new ethers.Wallet(PRIVATE_KEY, rpcProvider)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, PREDICTION_REGISTRY_ABI, wallet)

  const predictions = await prisma.prediction.findMany({
    include: { match: true },
  })

  const results = {
    verified: 0,
    correct: 0,
    exactScore: 0,
    correctWinner: 0,
    alreadySettled: 0,
    notOnChain: 0,
    errors: 0,
  }

  for (const p of predictions) {
    const result = p.match.result
    if (!result) continue

    const isCorrect = p.pick === result

    let matchHomeScore = 0
    let matchAwayScore = 0
    if (p.match.result && p.match.result.includes('-')) {
      const parts = p.match.result.split('-').map((s) => parseInt(s.trim(), 10))
      matchHomeScore = parts[0] || 0
      matchAwayScore = parts[1] || 0
    }

    const rewardTier = determineRewardTier(
      p.pick,
      result,
      p.homeScore,
      p.awayScore,
      matchHomeScore,
      matchAwayScore,
    )

    const predictionHash = hashPrediction({
      userId: p.userId,
      matchId: p.matchId,
      pick: p.pick,
      homeScore: p.homeScore,
      awayScore: p.awayScore,
      cornersPick: p.cornersPick,
    })

    try {
      const tx = await contract.markPrediction(predictionHash, isCorrect, rewardTier)
      await tx.wait()
      await prisma.prediction.update({
        where: { userId_matchId: { userId: p.userId, matchId: p.matchId } },
        data: { settleTxHash: tx.hash },
      })
      results.verified++
      if (isCorrect) {
        results.correct++
        if (rewardTier === 2) {
          results.exactScore++
        } else {
          results.correctWinner++
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('Already settled')) {
        results.alreadySettled++
      } else if (msg.includes('Prediction not found')) {
        results.notOnChain++
      } else {
        results.errors++
      }
    }
  }

  return NextResponse.json(results)
}
