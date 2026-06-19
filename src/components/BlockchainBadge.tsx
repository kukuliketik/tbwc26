'use client'

import { useWeb3Auth } from '@/components/Web3AuthProvider'

export default function BlockchainBadge() {
  const { connected, address } = useWeb3Auth()

  if (!connected || !address) return null

  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/30">
      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
      Blockchain Active
    </span>
  )
}
