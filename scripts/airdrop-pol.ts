import { ethers } from 'ethers'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const POLYGON_RPC = process.env.NEXT_PUBLIC_AMOY_RPC || 'https://rpc-amoy.polygon.technology'
const OWNER_PRIVATE_KEY = process.env.CONTRACT_OWNER_PRIVATE_KEY as string

const POL_AMOUNT = ethers.parseEther('0.005') // 0.005 POL per user

async function main() {
  if (!OWNER_PRIVATE_KEY) {
    console.error('CONTRACT_OWNER_PRIVATE_KEY not set')
    process.exit(1)
  }

  const rpcProvider = new ethers.JsonRpcProvider(POLYGON_RPC)
  const ownerWallet = new ethers.Wallet(OWNER_PRIVATE_KEY, rpcProvider)

  const ownerBalance = await rpcProvider.getBalance(ownerWallet.address)
  console.log(`Owner: ${ownerWallet.address}`)
  console.log(`Owner POL balance: ${ethers.formatEther(ownerBalance)}`)
  console.log(`Airdrop amount: ${ethers.formatEther(POL_AMOUNT)} POL per user\n`)

  const users = await prisma.user.findMany({
    where: { walletAddress: { not: null } },
    select: { id: true, name: true, email: true, walletAddress: true },
  })

  if (users.length === 0) {
    console.log('No users with wallet addresses found')
    await prisma.$disconnect()
    return
  }

  const totalNeeded = POL_AMOUNT * BigInt(users.length)
  if (ownerBalance < totalNeeded) {
    console.error(`Insufficient POL. Need ${ethers.formatEther(totalNeeded)} for ${users.length} users, have ${ethers.formatEther(ownerBalance)}`)
    await prisma.$disconnect()
    process.exit(1)
  }

  console.log(`Found ${users.length} users with wallets\n`)

  let funded = 0
  let skipped = 0
  let failed = 0

  for (const user of users) {
    const balance = await rpcProvider.getBalance(user.walletAddress!)
    if (balance >= POL_AMOUNT) {
      console.log(`SKIP  ${user.name || user.email} (${ethers.formatEther(balance)} POL)`)
      skipped++
      continue
    }

    try {
      const tx = await ownerWallet.sendTransaction({
        to: user.walletAddress!,
        value: POL_AMOUNT,
      })
      await tx.wait()
      console.log(`OK    ${user.name || user.email} -> ${user.walletAddress} (+${ethers.formatEther(POL_AMOUNT)} POL)`)
      funded++
    } catch (e) {
      const msg = e instanceof Error ? e.message?.slice(0, 80) : String(e)
      console.log(`FAIL  ${user.name || user.email}: ${msg}`)
      failed++
    }
  }

  console.log(`\nDone: ${funded} funded, ${skipped} skipped, ${failed} failed`)

  const finalBalance = await rpcProvider.getBalance(ownerWallet.address)
  console.log(`Owner POL remaining: ${ethers.formatEther(finalBalance)}`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
