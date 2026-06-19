'use client'

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/components/Toast'
import Web3AuthProvider from '@/components/Web3AuthProvider'
import BlockchainEnable from '@/components/BlockchainEnable'

export default function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <Web3AuthProvider>
        <ToastProvider>
          <BlockchainEnable />
          {children}
        </ToastProvider>
      </Web3AuthProvider>
    </NextAuthSessionProvider>
  )
}
