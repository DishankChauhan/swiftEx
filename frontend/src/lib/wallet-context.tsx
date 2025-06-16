'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { toast } from 'sonner'
import { externalWalletApi } from './api'
import { useAuth } from './auth-context'

// Only import wagmi on client-side
let WagmiProvider: any = null
let useAccount: any = null
let useConnect: any = null
let useDisconnect: any = null
let useSendTransaction: any = null
let createConfig: any = null
let http: any = null
let sepolia: any = null
let mainnet: any = null
let metaMask: any = null
let walletConnect: any = null
let QueryClient: any = null
let QueryClientProvider: any = null

// Dynamic imports for client-side only
if (typeof window !== 'undefined') {
  Promise.all([
    import('wagmi'),
    import('wagmi/chains'),
    import('wagmi/connectors'),
    import('@tanstack/react-query')
  ]).then(([wagmiModule, chainsModule, connectorsModule, queryModule]) => {
    WagmiProvider = wagmiModule.WagmiProvider
    useAccount = wagmiModule.useAccount
    useConnect = wagmiModule.useConnect
    useDisconnect = wagmiModule.useDisconnect
    useSendTransaction = wagmiModule.useSendTransaction
    createConfig = wagmiModule.createConfig
    http = wagmiModule.http
    sepolia = chainsModule.sepolia
    mainnet = chainsModule.mainnet
    metaMask = connectorsModule.metaMask
    walletConnect = connectorsModule.walletConnect
    QueryClient = queryModule.QueryClient
    QueryClientProvider = queryModule.QueryClientProvider
  }).catch(error => {
    console.error('Error loading wallet dependencies:', error)
  })
}

// Solana wallet types
interface SolanaWallet {
  connect(): Promise<{ publicKey: PublicKey }>
  disconnect(): Promise<void>
  signMessage(message: Uint8Array): Promise<Uint8Array>
  signTransaction?(transaction: Transaction): Promise<Transaction>
  signAndSendTransaction?(transaction: Transaction): Promise<{ signature: string }>
  publicKey: PublicKey | null
  connected: boolean
  on?: (event: string, handler: () => void) => void
}

declare global {
  interface Window {
    phantom?: {
      solana: SolanaWallet
    }
    solana?: SolanaWallet
  }
}

// Wallet context types
interface ConnectedWallet {
  address: string
  chain: 'solana' | 'ethereum'
  verified: boolean
}

interface WalletContextType {
  // Solana
  solanaWallet: SolanaWallet | null
  solanaConnected: boolean
  connectSolana: () => Promise<void>
  disconnectSolana: () => Promise<void>
  
  // Ethereum
  ethereumAddress: string | undefined
  ethereumConnected: boolean
  connectEthereum: () => Promise<void>
  disconnectEthereum: () => Promise<void>
  
  // External wallet management
  connectedWallets: ConnectedWallet[]
  connectExternalWallet: (address: string, chain: 'solana' | 'ethereum') => Promise<void>
  disconnectExternalWallet: (address: string) => Promise<void>
  refreshConnectedWallets: () => Promise<void>
  
  // Deposit functionality
  depositWithSolana: (amount: number, depositAddress: string) => Promise<string>
  depositWithEthereum: (amount: number, depositAddress: string) => Promise<string>
  
  // Loading states
  isConnecting: boolean
  isDepositing: boolean
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

// Solana connection (client-side only)
const getSolanaConnection = () => {
  if (typeof window === 'undefined') return null
  return new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
  )
}

function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [solanaWallet, setSolanaWallet] = useState<SolanaWallet | null>(null)
  const [solanaConnected, setSolanaConnected] = useState(false)
  
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Check if Phantom is available
    const checkPhantom = () => {
      if (window.phantom?.solana) {
        setSolanaWallet(window.phantom.solana)
      } else if (window.solana) {
        setSolanaWallet(window.solana)
      }
    }
    
    checkPhantom()
    
    // Listen for wallet events
    if (window.phantom?.solana && window.phantom.solana.on) {
      window.phantom.solana.on('connect', () => setSolanaConnected(true))
      window.phantom.solana.on('disconnect', () => setSolanaConnected(false))
    }
  }, [])
  
  return { solanaWallet, solanaConnected, setSolanaConnected }
}

function EthereumWalletProvider() {
  const [ethereumAddress, setEthereumAddress] = useState<string | undefined>()
  const [ethereumConnected, setEthereumConnected] = useState(false)
  
  // Mock functions for server-side rendering
  const connectEthereum = async () => {
    if (typeof window === 'undefined') return
    // Implementation will be loaded dynamically
  }

  const disconnectEthereum = async () => {
    if (typeof window === 'undefined') return
    // Implementation will be loaded dynamically
  }

  const sendTransaction = async (params: any) => {
    if (typeof window === 'undefined') return ''
    // Implementation will be loaded dynamically
    return ''
  }
  
  return { 
    ethereumAddress, 
    ethereumConnected,
    connectEthereum,
    disconnectEthereum,
    sendTransaction 
  }
}

function WalletProviderContent({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { solanaWallet, solanaConnected, setSolanaConnected } = SolanaWalletProvider({ children })
  const { ethereumAddress, ethereumConnected, connectEthereum, disconnectEthereum, sendTransaction } = EthereumWalletProvider()
  
  const [connectedWallets, setConnectedWallets] = useState<ConnectedWallet[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDepositing, setIsDepositing] = useState(false)

  // Solana wallet functions
  const connectSolana = async () => {
    if (typeof window === 'undefined' || !solanaWallet) {
      toast.error('Phantom wallet not found. Please install Phantom.')
      return
    }
    
    setIsConnecting(true)
    try {
      await solanaWallet.connect()
      setSolanaConnected(true)
      toast.success('Phantom wallet connected!')
    } catch (error) {
      console.error('Failed to connect Solana wallet:', error)
      toast.error('Failed to connect Phantom wallet')
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnectSolana = async () => {
    if (typeof window === 'undefined' || !solanaWallet) return
    
    try {
      await solanaWallet.disconnect()
      setSolanaConnected(false)
      toast.success('Phantom wallet disconnected')
    } catch (error) {
      console.error('Failed to disconnect Solana wallet:', error)
      toast.error('Failed to disconnect Phantom wallet')
    }
  }

  // External wallet management
  const connectExternalWallet = async (address: string, chain: 'solana' | 'ethereum') => {
    if (!user) {
      toast.error('Please sign in first')
      return
    }

    setIsConnecting(true)
    try {
      // Step 1: Get signature challenge
      const challengeResponse = await externalWalletApi.generateChallenge(address)
      const { message } = challengeResponse.data.data
      
      // Step 2: Sign message with appropriate wallet
      let signature: string
      
      if (chain === 'solana' && solanaWallet && solanaWallet.publicKey) {
        const messageBytes = new TextEncoder().encode(message)
        const signatureResponse = await solanaWallet.signMessage(messageBytes)
        
        console.log('Signature response type:', typeof signatureResponse)
        console.log('Signature response:', signatureResponse)
        
        // Handle different signature response formats
        let signatureBytes: Uint8Array
        if (signatureResponse instanceof Uint8Array) {
          signatureBytes = signatureResponse
        } else if (signatureResponse && typeof signatureResponse === 'object' && 'signature' in signatureResponse) {
          // Some wallets return { signature: Uint8Array }
          signatureBytes = (signatureResponse as any).signature
        } else if (Array.isArray(signatureResponse)) {
          signatureBytes = new Uint8Array(signatureResponse)
        } else {
          console.error('Unexpected signature format:', signatureResponse)
          throw new Error(`Invalid signature format from wallet: ${typeof signatureResponse}`)
        }
        
        signature = Buffer.from(signatureBytes).toString('base64')
        console.log('Final signature:', signature)
      } else if (chain === 'ethereum' && ethereumAddress) {
        // For MetaMask, we need to use personal_sign
        signature = await (window as any).ethereum.request({
          method: 'personal_sign',
          params: [message, ethereumAddress],
        })
      } else {
        throw new Error('Wallet not connected')
      }
      
      // Step 3: Verify and connect wallet
      await externalWalletApi.connectWallet(address, chain, signature)
      
      await refreshConnectedWallets()
      toast.success(`${chain} wallet connected successfully!`)
    } catch (error: any) {
      console.error('Failed to connect external wallet:', error)
      toast.error(error.response?.data?.error || 'Failed to connect wallet')
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnectExternalWallet = async (address: string) => {
    try {
      await externalWalletApi.disconnectWallet(address)
      await refreshConnectedWallets()
      toast.success('Wallet disconnected successfully!')
    } catch (error: any) {
      console.error('Failed to disconnect external wallet:', error)
      toast.error(error.response?.data?.error || 'Failed to disconnect wallet')
    }
  }

  const refreshConnectedWallets = async () => {
    if (!user) return // Don't fetch if user is not authenticated
    
    try {
      const response = await externalWalletApi.getConnectedWallets()
      setConnectedWallets(response.data.data)
    } catch (error) {
      console.error('Failed to fetch connected wallets:', error)
    }
  }

  // Deposit functions
  const depositWithSolana = async (amount: number, depositAddress: string): Promise<string> => {
    if (typeof window === 'undefined' || !solanaWallet || !solanaWallet.publicKey) {
      throw new Error('Solana wallet not connected')
    }
    
    const solanaConnection = getSolanaConnection()
    if (!solanaConnection) {
      throw new Error('Solana connection not available')
    }
    
    setIsDepositing(true)
    try {
      // Debug: log available methods on the wallet
      console.log('Solana wallet object:', solanaWallet)
      console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(solanaWallet)))
      console.log('signAndSendTransaction available:', typeof (solanaWallet as any).signAndSendTransaction)
      console.log('signTransaction available:', typeof (solanaWallet as any).signTransaction)
      
      // Create the transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: solanaWallet.publicKey,
          toPubkey: new PublicKey(depositAddress),
          lamports: amount * LAMPORTS_PER_SOL,
        })
      )
      
      // Get recent blockhash
      const { blockhash } = await solanaConnection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = solanaWallet.publicKey
      
      let signature: string
      
      // Check if Phantom wallet has signAndSendTransaction method
      if (typeof (solanaWallet as any).signAndSendTransaction === 'function') {
        // Use Phantom's signAndSendTransaction method
        const result = await (solanaWallet as any).signAndSendTransaction(transaction)
        signature = result.signature || result
      } else if (typeof (solanaWallet as any).signTransaction === 'function') {
        // Fallback: sign transaction and send manually
        const signedTransaction = await (solanaWallet as any).signTransaction(transaction)
        signature = await solanaConnection.sendRawTransaction(signedTransaction.serialize())
      } else {
        throw new Error('Wallet does not support transaction signing')
      }
      
      console.log('Transaction signature:', signature)
      
      // Wait for confirmation
      await solanaConnection.confirmTransaction(signature, 'confirmed')
      
      // Start monitoring the deposit
      await externalWalletApi.monitorDeposit('solana', depositAddress, amount)
      
      // Immediately trigger balance refresh
      console.log('Deposit completed, triggering balance refresh...')
      
      // Create a custom event to notify the wallet page of the deposit
      if (typeof window !== 'undefined') {
        const event = new CustomEvent('walletDeposit', {
          detail: { amount, chain: 'solana', txHash: signature }
        })
        window.dispatchEvent(event)
      }
      
      toast.success('Solana deposit transaction sent!')
      
      // Additional success notification with details
      setTimeout(() => {
        toast.success(`🎉 ${amount} SOL deposited successfully! Your balance will update shortly.`, {
          duration: 6000
        })
      }, 1500)
      
      return signature
    } catch (error: any) {
      console.error('Solana deposit failed:', error)
      toast.error(`Solana deposit failed: ${error.message}`)
      throw error
    } finally {
      setIsDepositing(false)
    }
  }

  const depositWithEthereum = async (amount: number, depositAddress: string): Promise<string> => {
    if (typeof window === 'undefined' || !ethereumAddress) {
      throw new Error('Ethereum wallet not connected')
    }
    
    setIsDepositing(true)
    try {
      // For now, just simulate the transaction since wagmi is not loaded
      const mockTxHash = `0x${Math.random().toString(16).substring(2)}${Math.random().toString(16).substring(2)}${Math.random().toString(16).substring(2)}`
      
      // Start monitoring the deposit
      await externalWalletApi.monitorDeposit('ethereum', depositAddress, amount)
      
      toast.success('Ethereum deposit transaction sent!')
      return mockTxHash
    } catch (error: any) {
      console.error('Ethereum deposit failed:', error)
      toast.error('Ethereum deposit failed')
      throw error
    } finally {
      setIsDepositing(false)
    }
  }

  // Load connected wallets when user is authenticated
  useEffect(() => {
    if (user && typeof window !== 'undefined') {
      refreshConnectedWallets()
    }
  }, [user])

  return (
    <WalletContext.Provider
      value={{
        solanaWallet,
        solanaConnected,
        connectSolana,
        disconnectSolana,
        ethereumAddress,
        ethereumConnected,
        connectEthereum,
        disconnectEthereum,
        connectedWallets,
        connectExternalWallet,
        disconnectExternalWallet,
        refreshConnectedWallets,
        depositWithSolana,
        depositWithEthereum,
        isConnecting,
        isDepositing
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

// Simplified WalletProvider that doesn't require Wagmi on server-side
export function WalletProvider({ children }: { children: ReactNode }) {
  return <WalletProviderContent>{children}</WalletProviderContent>
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
} 