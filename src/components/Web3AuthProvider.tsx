'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { ethers } from 'ethers'

const WALLET_SECRET = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID || 'tbwc26-default-secret'
const AMOY_RPC = process.env.NEXT_PUBLIC_AMOY_RPC || 'https://rpc-amoy.polygon.technology'

interface Web3AuthContextType {
  wallet: ethers.Wallet | null
  provider: ethers.Eip1193Provider | null
  connected: boolean
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  address: string | null
}

const Web3AuthContext = createContext<Web3AuthContextType>({
  wallet: null,
  provider: null,
  connected: false,
  connecting: false,
  connect: async () => {},
  disconnect: async () => {},
  address: null,
})

export const useWeb3Auth = () => useContext(Web3AuthContext)

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1]
  const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
  return JSON.parse(json)
}

function deriveWallet(idToken: string): ethers.Wallet {
  const payload = decodeJwtPayload(idToken)
  const sub = (payload.sub as string) || (payload.email as string) || idToken
  const salt = ethers.id(WALLET_SECRET)
  const seed = ethers.pbkdf2(
    ethers.id(sub),
    salt,
    100000,
    32,
    'sha512',
  )
  return new ethers.Wallet(seed)
}

function saveWalletAddress(addr: string) {
  fetch('/api/wallet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: addr }),
  }).catch(() => {})
}

export default function Web3AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [wallet, setWallet] = useState<ethers.Wallet | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  const autoConnectRan = useRef(false)

  const connectFromToken = useCallback(async (idToken: string) => {
    const derived = deriveWallet(idToken)
    const rpcProvider = new ethers.JsonRpcProvider(AMOY_RPC)
    const connectedWallet = derived.connect(rpcProvider) as ethers.Wallet
    setWallet(connectedWallet)
    setConnected(true)
    setAddress(connectedWallet.address)
    saveWalletAddress(connectedWallet.address)
  }, [])

  useEffect(() => {
    if (status !== 'authenticated' || connected || autoConnectRan.current) return
    const idToken = (session as unknown as Record<string, unknown>)?.idToken as string | undefined
    if (!idToken) return

    autoConnectRan.current = true
    const t = idToken
    Promise.resolve().then(() => connectFromToken(t))
  }, [status, session, connected, connectFromToken])

  const connect = useCallback(async () => {
    if (connecting || connected) return
    setConnecting(true)
    try {
      const idToken = (session as unknown as Record<string, unknown>)?.idToken as string | undefined
      if (idToken) {
        await connectFromToken(idToken)
      }
    } catch (err) {
      console.error('[wallet] connect error:', err)
    } finally {
      setConnecting(false)
    }
  }, [connecting, connected, session, connectFromToken])

  const disconnect = useCallback(async () => {
    setWallet(null)
    setConnected(false)
    setAddress(null)
  }, [])

  return (
    <Web3AuthContext.Provider value={{ wallet, provider: wallet as unknown as ethers.Eip1193Provider, connected, connecting, connect, disconnect, address }}>
      {children}
    </Web3AuthContext.Provider>
  )
}
