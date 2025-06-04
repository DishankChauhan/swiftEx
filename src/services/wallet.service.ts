import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { ethers } from 'ethers'
import * as bip39 from 'bip39'
import { derivePath } from 'ed25519-hd-key'
import { prisma } from '../config/database'
import { blockchainConfig, assetConfig } from '../config/blockchain'
import {
  Chain,
  Asset,
  WalletGenerationResult,
  WalletResponse,
  BalanceResponse,
  DepositAddressRequest,
  WithdrawalRequest
} from '../types/wallet'

export class WalletService {
  private solanaConnection: Connection
  private ethereumProvider: ethers.JsonRpcProvider

  constructor() {
    this.solanaConnection = new Connection(blockchainConfig.solana.rpcUrl, 'confirmed')
    this.ethereumProvider = new ethers.JsonRpcProvider(blockchainConfig.ethereum.rpcUrl)
  }

  // Generate Solana wallet
  private async generateSolanaWallet(userId: string, index: number = 0): Promise<WalletGenerationResult> {
    try {
      // Generate or use existing master seed for user
      const masterSeed = await this.getMasterSeed(userId)
      const derivationPath = `m/44'/501'/${index}'/0'`
      
      // Derive keypair from seed
      const { key } = derivePath(derivationPath, masterSeed.toString('hex'))
      const keypair = Keypair.fromSeed(key)
      
      return {
        address: keypair.publicKey.toString(),
        publicKey: keypair.publicKey.toString(),
        privateKey: Buffer.from(keypair.secretKey).toString('hex'),
        derivationPath
      }
    } catch (error) {
      console.error('Solana wallet generation error:', error)
      throw new Error('Failed to generate Solana wallet')
    }
  }

  // Generate Ethereum wallet
  private async generateEthereumWallet(userId: string, index: number = 0): Promise<WalletGenerationResult> {
    try {
      // Generate or use existing master seed for user
      const masterSeed = await this.getMasterSeed(userId)
      const derivationPath = `m/44'/60'/0'/0/${index}`
      
      // Create wallet from seed
      const masterNode = ethers.HDNodeWallet.fromSeed(masterSeed)
      const wallet = masterNode.derivePath(derivationPath)
      
      return {
        address: wallet.address,
        publicKey: wallet.publicKey,
        privateKey: wallet.privateKey,
        derivationPath
      }
    } catch (error) {
      console.error('Ethereum wallet generation error:', error)
      throw new Error('Failed to generate Ethereum wallet')
    }
  }

  // Get or generate master seed for user
  private async getMasterSeed(userId: string): Promise<Buffer> {
    // In production, this should be securely stored and encrypted
    // For now, we'll derive a deterministic seed from user ID
    const seed = bip39.mnemonicToSeedSync(`user ${userId} master seed`)
    return seed.subarray(0, 32) // Use first 32 bytes
  }

  // Encrypt private key (simplified for demo)
  private encryptPrivateKey(privateKey: string): string {
    // In production, use proper encryption with a master key
    return Buffer.from(privateKey).toString('base64')
  }

  // Decrypt private key (simplified for demo)
  private decryptPrivateKey(encryptedKey: string): string {
    // In production, use proper decryption
    return Buffer.from(encryptedKey, 'base64').toString()
  }

  // Generate deposit address for user
  async generateDepositAddress(userId: string, data: DepositAddressRequest): Promise<WalletResponse> {
    try {
      // Check if user already has a deposit address for this chain
      const existingWallet = await prisma.wallet.findFirst({
        where: {
          userId,
          chain: data.chain,
          type: 'deposit',
          isActive: true
        }
      })

      if (existingWallet) {
        return {
          success: true,
          message: 'Deposit address retrieved',
          data: {
            address: existingWallet.address,
            chain: existingWallet.chain,
            type: existingWallet.type
          }
        }
      }

      // Generate new wallet based on chain
      let walletResult: WalletGenerationResult

      if (data.chain === 'solana') {
        walletResult = await this.generateSolanaWallet(userId)
      } else if (data.chain === 'ethereum') {
        walletResult = await this.generateEthereumWallet(userId)
      } else {
        throw new Error('Unsupported chain')
      }

      // Store wallet in database
      const wallet = await prisma.wallet.create({
        data: {
          userId,
          chain: data.chain,
          address: walletResult.address,
          type: 'deposit',
          publicKey: walletResult.publicKey,
          privateKey: this.encryptPrivateKey(walletResult.privateKey),
          derivationPath: walletResult.derivationPath
        }
      })

      return {
        success: true,
        message: 'Deposit address generated successfully',
        data: {
          address: wallet.address,
          chain: wallet.chain,
          type: wallet.type
        }
      }
    } catch (error) {
      console.error('Deposit address generation error:', error)
      return {
        success: false,
        message: 'Failed to generate deposit address'
      }
    }
  }

  // Get user balances
  async getUserBalances(userId: string): Promise<BalanceResponse> {
    try {
      const balances = await prisma.balance.findMany({
        where: { userId }
      })

      return {
        success: true,
        message: 'Balances retrieved successfully',
        data: {
          balances: balances.map((balance: { asset: any; chain: any; available: any; locked: any; total: any }) => ({
            asset: balance.asset,
            chain: balance.chain,
            available: balance.available,
            locked: balance.locked,
            total: balance.total
          }))
        }
      }
    } catch (error) {
      console.error('Get balances error:', error)
      return {
        success: false,
        message: 'Failed to retrieve balances'
      }
    }
  }

  // Update user balance
  async updateBalance(
    userId: string,
    asset: Asset,
    chain: Chain,
    availableChange: string,
    lockedChange: string = '0'
  ): Promise<void> {
    try {
      await prisma.$transaction(async (tx: { balance: { findUnique: (arg0: { where: { userId_asset_chain: { userId: string; asset: "SOL" | "ETH" | "USDC"; chain: "solana" | "ethereum" } } }) => any; upsert: (arg0: { where: { userId_asset_chain: { userId: string; asset: "SOL" | "ETH" | "USDC"; chain: "solana" | "ethereum" } }; update: { available: string; locked: string; total: string }; create: { userId: string; asset: "SOL" | "ETH" | "USDC"; chain: "solana" | "ethereum"; available: string; locked: string; total: string } }) => any } }) => {
        // Get current balance
        const currentBalance = await tx.balance.findUnique({
          where: {
            userId_asset_chain: {
              userId,
              asset,
              chain
            }
          }
        })

        const currentAvailable = parseFloat(currentBalance?.available || '0')
        const currentLocked = parseFloat(currentBalance?.locked || '0')
        
        const newAvailable = (currentAvailable + parseFloat(availableChange)).toString()
        const newLocked = (currentLocked + parseFloat(lockedChange)).toString()
        const newTotal = (parseFloat(newAvailable) + parseFloat(newLocked)).toString()

        // Update or create balance
        await tx.balance.upsert({
          where: {
            userId_asset_chain: {
              userId,
              asset,
              chain
            }
          },
          update: {
            available: newAvailable,
            locked: newLocked,
            total: newTotal
          },
          create: {
            userId,
            asset,
            chain,
            available: newAvailable,
            locked: newLocked,
            total: newTotal
          }
        })
      })
    } catch (error) {
      console.error('Update balance error:', error)
      throw new Error('Failed to update balance')
    }
  }

  // Get Solana balance
  async getSolanaBalance(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address)
      const balance = await this.solanaConnection.getBalance(publicKey)
      return balance / 1e9 // Convert lamports to SOL
    } catch (error) {
      console.error('Get Solana balance error:', error)
      return 0
    }
  }

  // Get Ethereum balance
  async getEthereumBalance(address: string): Promise<number> {
    try {
      const balance = await this.ethereumProvider.getBalance(address)
      return parseFloat(ethers.formatEther(balance))
    } catch (error) {
      console.error('Get Ethereum balance error:', error)
      return 0
    }
  }

  // Get user deposit addresses
  async getDepositAddresses(userId: string): Promise<WalletResponse> {
    try {
      const wallets = await prisma.wallet.findMany({
        where: {
          userId,
          type: 'deposit',
          isActive: true
        }
      })

      return {
        success: true,
        message: 'Deposit addresses retrieved successfully',
        data: {
          addresses: wallets.map((wallet: { chain: any; address: any }) => ({
            chain: wallet.chain,
            address: wallet.address
          }))
        } as any
      }
    } catch (error) {
      console.error('Get deposit addresses error:', error)
      return {
        success: false,
        message: 'Failed to retrieve deposit addresses'
      }
    }
  }
} 