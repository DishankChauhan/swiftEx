import { Elysia } from 'elysia'
import { WalletService } from '../services/wallet.service'
import {
  depositAddressRequestSchema,
  withdrawalRequestSchema,
  transactionHistorySchema
} from '../types/wallet'
import { verifyAccessToken } from '../utils/jwt'
import { prisma } from '../config/database'

const walletService = new WalletService()

// Auth guard function (same as auth routes)
async function authGuard({ headers }: any) {
  const authorization = headers.authorization

  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new Error('Authorization token required')
  }

  const token = authorization.substring(7)

  const payload = await verifyAccessToken(token)
  if (!payload) {
    throw new Error('Invalid or expired token')
  }

  // Check if user exists and session is valid
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      sessions: {
        where: {
          token: token,
          expiresAt: {
            gte: new Date()
          }
        }
      }
    }
  })

  if (!user || user.sessions.length === 0) {
    throw new Error('Invalid session')
  }

  return {
    id: user.id,
    email: user.email,
    is2FAEnabled: user.is2FAEnabled,
    kycStatus: user.kycStatus
  }
}

export const walletRoutes = new Elysia({ prefix: '/wallet' })
  
  // Generate deposit address
  .post('/deposit/address', async (context) => {
    try {
      const user = await authGuard(context)
      const validatedData = depositAddressRequestSchema.parse(context.body)
      return await walletService.generateDepositAddress(user.id, validatedData)
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate deposit address'
      }
    }
  })

  // Get all deposit addresses
  .get('/deposit/addresses', async (context) => {
    try {
      const user = await authGuard(context)
      return await walletService.getDepositAddresses(user.id)
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to retrieve deposit addresses'
      }
    }
  })

  // Get user balances
  .get('/balances', async (context) => {
    try {
      const user = await authGuard(context)
      return await walletService.getUserBalances(user.id)
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to retrieve balances'
      }
    }
  })

  // Get transaction history
  .get('/transactions', async (context) => {
    try {
      const user = await authGuard(context)
      const query = transactionHistorySchema.parse(context.query)
      
      const transactions = await prisma.transaction.findMany({
        where: {
          userId: user.id,
          ...(query.chain && { chain: query.chain }),
          ...(query.asset && { asset: query.asset }),
          ...(query.txType && { txType: query.txType })
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset
      })

      const total = await prisma.transaction.count({
        where: {
          userId: user.id,
          ...(query.chain && { chain: query.chain }),
          ...(query.asset && { asset: query.asset }),
          ...(query.txType && { txType: query.txType })
        }
      })

      return {
        success: true,
        message: 'Transaction history retrieved successfully',
        data: {
          transactions: transactions.map((tx: { id: any; txHash: any; chain: any; txType: any; status: any; amount: any; asset: any; fromAddress: any; toAddress: any; fee: any; createdAt: any }) => ({
            id: tx.id,
            txHash: tx.txHash,
            chain: tx.chain,
            txType: tx.txType,
            status: tx.status,
            amount: tx.amount,
            asset: tx.asset,
            fromAddress: tx.fromAddress,
            toAddress: tx.toAddress,
            fee: tx.fee,
            createdAt: tx.createdAt
          })),
          total,
          limit: query.limit,
          offset: query.offset
        }
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to retrieve transaction history'
      }
    }
  })

  // Get live blockchain balances (for verification)
  .get('/balance/live/:chain/:address', async (context) => {
    try {
      const user = await authGuard(context)
      const { chain, address } = context.params as { chain: string, address: string }
      
      // Verify the address belongs to the user
      const wallet = await prisma.wallet.findFirst({
        where: {
          userId: user.id,
          chain,
          address,
          isActive: true
        }
      })

      if (!wallet) {
        return {
          success: false,
          message: 'Wallet not found or not owned by user'
        }
      }

      let balance = 0
      if (chain === 'solana') {
        balance = await walletService.getSolanaBalance(address)
      } else if (chain === 'ethereum') {
        balance = await walletService.getEthereumBalance(address)
      } else {
        return {
          success: false,
          message: 'Unsupported chain'
        }
      }

      return {
        success: true,
        message: 'Live balance retrieved successfully',
        data: {
          chain,
          address,
          balance: balance.toString(),
          asset: chain === 'solana' ? 'SOL' : 'ETH'
        }
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to retrieve live balance'
      }
    }
  }) 