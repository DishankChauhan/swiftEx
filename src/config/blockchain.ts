import { BlockchainConfig } from '../types/wallet'

// Blockchain network configuration
export const blockchainConfig: BlockchainConfig = {
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    network: (process.env.SOLANA_NETWORK as 'devnet' | 'testnet' | 'mainnet-beta') || 'devnet'
  },
  ethereum: {
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
    network: (process.env.ETHEREUM_NETWORK as 'sepolia' | 'goerli' | 'mainnet') || 'sepolia',
    chainId: process.env.ETHEREUM_CHAIN_ID ? parseInt(process.env.ETHEREUM_CHAIN_ID) : 11155111 // Sepolia
  }
}

// Asset configuration
export const assetConfig = {
  SOL: {
    chain: 'solana',
    decimals: 9,
    minWithdrawal: '0.001',
    withdrawalFee: '0.001'
  },
  ETH: {
    chain: 'ethereum',
    decimals: 18,
    minWithdrawal: '0.001',
    withdrawalFee: '0.001'
  },
  USDC: {
    chain: 'solana', // We'll use USDC on Solana for this implementation
    decimals: 6,
    minWithdrawal: '1',
    withdrawalFee: '0.1',
    mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC mint on devnet
  }
} as const

// Withdrawal limits (daily)
export const withdrawalLimits = {
  unverified: {
    SOL: '1',
    ETH: '0.1',
    USDC: '100'
  },
  verified: {
    SOL: '100',
    ETH: '10',
    USDC: '10000'
  }
} as const 