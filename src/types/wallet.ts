import { z } from 'zod'

// Supported chains and assets
export const SUPPORTED_CHAINS = ['solana', 'ethereum'] as const
export const SUPPORTED_ASSETS = ['SOL', 'ETH', 'USDC'] as const

export type Chain = typeof SUPPORTED_CHAINS[number]
export type Asset = typeof SUPPORTED_ASSETS[number]

// Request validation schemas
export const depositAddressRequestSchema = z.object({
  chain: z.enum(SUPPORTED_CHAINS)
})

export const withdrawalRequestSchema = z.object({
  chain: z.enum(SUPPORTED_CHAINS),
  asset: z.enum(SUPPORTED_ASSETS),
  toAddress: z.string().min(1),
  amount: z.string().min(1),
  twoFactorToken: z.string().length(6).optional()
})

export const transactionHistorySchema = z.object({
  chain: z.enum(SUPPORTED_CHAINS).optional(),
  asset: z.enum(SUPPORTED_ASSETS).optional(),
  txType: z.enum(['deposit', 'withdrawal', 'internal']).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0)
})

// Type exports
export type DepositAddressRequest = z.infer<typeof depositAddressRequestSchema>
export type WithdrawalRequest = z.infer<typeof withdrawalRequestSchema>
export type TransactionHistoryRequest = z.infer<typeof transactionHistorySchema>

// Response types
export interface WalletResponse {
  success: boolean
  message: string
  data?: {
    address?: string
    chain?: string
    type?: string
    qrCode?: string
  }
}

export interface BalanceResponse {
  success: boolean
  message: string
  data?: {
    balances: {
      asset: string
      chain: string
      available: string
      locked: string
      total: string
    }[]
  }
}

export interface TransactionResponse {
  success: boolean
  message: string
  data?: {
    transaction?: {
      id: string
      txHash?: string
      chain: string
      txType: string
      status: string
      amount: string
      asset: string
      fromAddress?: string
      toAddress?: string
      fee?: string
      createdAt: Date
    }
    transactions?: any[]
    total?: number
  }
}

// Wallet generation result
export interface WalletGenerationResult {
  address: string
  publicKey: string
  privateKey: string
  derivationPath?: string
  mnemonic?: string
}

// Transaction status types
export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled'
export type TransactionType = 'deposit' | 'withdrawal' | 'internal'

// Blockchain configuration
export interface BlockchainConfig {
  solana: {
    rpcUrl: string
    network: 'devnet' | 'testnet' | 'mainnet-beta'
  }
  ethereum: {
    rpcUrl: string
    network: 'sepolia' | 'goerli' | 'mainnet'
    chainId: number
  }
} 