import { ethers } from 'ethers'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const POLYGON_RPC = process.env.NEXT_PUBLIC_AMOY_RPC || 'https://rpc-amoy.polygon.technology'
const OWNER_PRIVATE_KEY = process.env.CONTRACT_OWNER_PRIVATE_KEY as string
const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_PREDICTION_TOKEN_ADDRESS as string

const PRED_AMOUNT = ethers.parseUnits('10', 18) // 10 PRED

const PREDICTION_TOKEN_ABI = [
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
]

async function main() {
  if (!OWNER_PRIVATE_KEY) {
    console.error('CONTRACT_OWNER_PRIVATE_KEY not set')
    process.exit(1)
  }

  const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC)
  const ownerWallet = new ethers.Wallet(OWNER_PRIVATE_KEY, rpcProvider)
  const tokenContract = new ethers.Contract(TOKEN_ADDRESS, PREDICTION_TOKEN_ABI, ownerWallet)

  console.log(`Owner: ${ownerWallet.address}`)
  console.log(`Token: ${TOKEN_ADDRESS}`)
  console.log(`Airdrop amount: 10 PRED per user\n`)

  const users = await prisma.user.findMany({
    where: { walletAddress: { not: null } },
    select: { id: true, name: true, email: true, walletAddress: true },
  })

  if (users.length === 0) {
    console.log('No users with wallet addresses found')
    await prisma.$disconnect()
    return
  }

  console.log(`Found ${users.length} users with wallets\n`)

  let funded = 0
  let skipped = 0
  let failed = 0

  for (const user of users) {
    const currentBalance = await tokenContract.balanceOf(user.walletAddress!)
    const alreadyHas = currentBalance >= PRED_AMOUNT

    if (alreadyHas) {
      console.log(`SKIP  ${user.name || user.email} (${ethers.formatUnits(currentBalance, 18)} PRED)`)
      skipped++
      continue
    }

    try {
      const tx = await tokenContract.mint(user.walletAddress!, PRED_AMOUNT)
      await tx.wait()
      console.log(`OK    ${user.name || user.email} -> ${user.walletAddress} (+10 PRED)`)
      funded++
    } catch (e) {
      const msg = e instanceof Error ? e.message?.slice(0, 80) : String(e)
      console.log(`FAIL  ${user.name || user.email}: ${msg}`)
      failed++
    }
  }

  console.log(`\nDone: ${funded} funded, ${skipped} skipped, ${failed} failed`)

  const ownerBalance = await tokenContract.balanceOf(ownerWallet.address)
  console.log(`Owner PRED remaining: ${ethers.formatUnits(ownerBalance, 18)}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
