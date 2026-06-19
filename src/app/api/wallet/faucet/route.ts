import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ethers } from 'ethers'

const POLYGON_RPC = process.env.NEXT_PUBLIC_AMOY_RPC || 'https://rpc-amoy.polygon.technology'
const PRIVATE_KEY = process.env.CONTRACT_OWNER_PRIVATE_KEY as string
const FUND_AMOUNT = ethers.parseEther('0.02')

export async function POST() {
  if (!PRIVATE_KEY) {
    return NextResponse.json({ error: 'Owner key not configured' }, { status: 500 })
  }

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user?.walletAddress) {
    return NextResponse.json({ error: 'No wallet address' }, { status: 400 })
  }

  const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC)
  const ownerWallet = new ethers.Wallet(PRIVATE_KEY, rpcProvider)

  const balance = await rpcProvider.getBalance(user.walletAddress)
  if (balance >= FUND_AMOUNT) {
    return NextResponse.json({ funded: false, reason: 'Already has funds', balance: ethers.formatEther(balance) })
  }

  const ownerBalance = await rpcProvider.getBalance(ownerWallet.address)
  if (ownerBalance < FUND_AMOUNT) {
    return NextResponse.json({ error: 'Owner wallet needs POL. Visit https://faucet.polygon.technology/' }, { status: 500 })
  }

  const tx = await ownerWallet.sendTransaction({
    to: user.walletAddress,
    value: FUND_AMOUNT,
  })
  await tx.wait()

  const newBalance = await rpcProvider.getBalance(user.walletAddress)
  return NextResponse.json({ funded: true, balance: ethers.formatEther(newBalance) })
}
