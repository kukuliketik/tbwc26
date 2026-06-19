import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ethers } from 'ethers'

const PREDICTION_REGISTRY_ABI = [
  'function storePrediction(bytes32 predictionHash, string userId, uint256 matchId, string matchName, string predictionSummary) external',
]

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICTION_CONTRACT_ADDRESS as string
const POLYGON_RPC = process.env.NEXT_PUBLIC_AMOY_RPC || 'https://rpc-amoy.polygon.technology'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { matchId, predictionHash, userId, matchName, predictionSummary } = await request.json()
  if (!matchId || !predictionHash || !userId) {
    return NextResponse.json({ error: 'matchId, predictionHash, userId required' }, { status: 400 })
  }

  const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, PREDICTION_REGISTRY_ABI, rpcProvider)

  try {
    const tx = await contract.storePrediction.staticCall(
      predictionHash,
      userId,
      BigInt(matchId),
      matchName,
      predictionSummary,
    )
    return NextResponse.json({ success: true, willSucceed: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('Prediction already stored')) {
      return NextResponse.json({ success: true, alreadyStored: true })
    }
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 })
  }
}
