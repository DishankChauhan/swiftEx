import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ethers } from 'ethers';
import crypto from 'crypto';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';

export interface ExternalWalletConnection {
  address: string;
  chain: 'solana' | 'ethereum';
  signature?: string;
  verified: boolean;
}

export interface DepositMonitor {
  userAddress: string;
  chain: 'solana' | 'ethereum';
  expectedAmount?: number;
  confirmations: number;
  status: 'pending' | 'confirmed' | 'failed';
}

class ExternalWalletService {
  private solanaConnection: Connection;
  private ethProvider: ethers.JsonRpcProvider;
  private depositMonitors: Map<string, DepositMonitor> = new Map();

  constructor() {
    // Initialize blockchain connections
    this.solanaConnection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    
    this.ethProvider = new ethers.JsonRpcProvider(
      process.env.ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/your-project-id'
    );

    // Start monitoring deposits
    this.startDepositMonitoring();
  }

  /**
   * Generate signature challenge for wallet verification
   */
  generateSignatureChallenge(address: string): string {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const message = `SwiftEx Wallet Verification\nAddress: ${address}\nTimestamp: ${timestamp}\nNonce: ${nonce}`;
    
    // Store challenge in Redis with 5-minute expiry
    redis.setEx(`wallet_challenge:${address}`, 300, JSON.stringify({
      message,
      timestamp,
      nonce
    }));

    return message;
  }

  /**
   * Verify wallet signature for Solana (Phantom)
   */
  async verifySolanaSignature(address: string, signature: string, message: string): Promise<boolean> {
    try {
      const publicKey = new PublicKey(address);
      
      // Create message bytes
      const messageBytes = new TextEncoder().encode(message);
      
      // Verify signature (Note: This is a simplified version)
      // In production, you'd use @solana/wallet-adapter for proper verification
      return true; // Placeholder - implement proper signature verification
    } catch (error) {
      console.error('Solana signature verification failed:', error);
      return false;
    }
  }

  /**
   * Verify wallet signature for Ethereum (MetaMask)
   */
  async verifyEthereumSignature(address: string, signature: string, message: string): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      console.error('Ethereum signature verification failed:', error);
      return false;
    }
  }

  /**
   * Connect and verify external wallet
   */
  async connectExternalWallet(
    userId: string,
    address: string,
    chain: 'solana' | 'ethereum',
    signature: string
  ): Promise<ExternalWalletConnection> {
    try {
      // Get stored challenge
      const challengeData = await redis.get(`wallet_challenge:${address}`);
      if (!challengeData) {
        throw new Error('Challenge expired or not found');
      }

      const { message } = JSON.parse(challengeData);

      // Verify signature based on chain
      let verified = false;
      if (chain === 'solana') {
        verified = await this.verifySolanaSignature(address, signature, message);
      } else if (chain === 'ethereum') {
        verified = await this.verifyEthereumSignature(address, signature, message);
      }

      if (!verified) {
        throw new Error('Signature verification failed');
      }

      // Store connected wallet in database
      await prisma.connectedWallet.create({
        data: {
          userId,
          address,
          chain,
          verified: true,
          signature,
          connectedAt: new Date()
        }
      });

      // Clean up challenge
      await redis.del(`wallet_challenge:${address}`);

      return {
        address,
        chain,
        signature,
        verified: true
      };
    } catch (error) {
      console.error('External wallet connection failed:', error);
      throw error;
    }
  }

  /**
   * Get user's deposit address for a specific chain
   */
  async getUserDepositAddress(userId: string, chain: 'solana' | 'ethereum'): Promise<string> {
    const wallet = await prisma.wallet.findFirst({
      where: {
        userId,
        chain,
        type: 'deposit',
        isActive: true
      }
    });

    if (!wallet) {
      throw new Error(`No ${chain} deposit wallet found for user`);
    }

    return wallet.address;
  }

  /**
   * Monitor deposits to user's wallet address
   */
  async monitorDeposit(
    userId: string,
    chain: 'solana' | 'ethereum',
    userAddress: string,
    expectedAmount?: number
  ): Promise<string> {
    const monitorId = crypto.randomUUID();
    
    this.depositMonitors.set(monitorId, {
      userAddress,
      chain,
      expectedAmount,
      confirmations: 0,
      status: 'pending'
    });

    // Store in Redis for persistence
    await redis.setEx(`deposit_monitor:${monitorId}`, 3600, JSON.stringify({
      userId,
      userAddress,
      chain,
      expectedAmount,
      startTime: Date.now()
    }));

    return monitorId;
  }

  /**
   * Check Solana balance and transactions
   */
  async checkSolanaDeposits(): Promise<void> {
    for (const [monitorId, monitor] of this.depositMonitors) {
      if (monitor.chain !== 'solana') continue;

      try {
        const publicKey = new PublicKey(monitor.userAddress);
        const balance = await this.solanaConnection.getBalance(publicKey);
        const balanceSOL = balance / LAMPORTS_PER_SOL;

        // Get recent transactions
        const signatures = await this.solanaConnection.getSignaturesForAddress(
          publicKey,
          { limit: 10 }
        );

        for (const sigInfo of signatures) {
          if (sigInfo.confirmationStatus === 'confirmed' || sigInfo.confirmationStatus === 'finalized') {
            const transaction = await this.solanaConnection.getTransaction(sigInfo.signature);
            
            if (transaction && transaction.meta && !transaction.meta.err) {
              // Process confirmed deposit
              await this.processConfirmedDeposit(monitorId, {
                txHash: sigInfo.signature,
                amount: (transaction.meta.postBalances[0] - transaction.meta.preBalances[0]) / LAMPORTS_PER_SOL,
                chain: 'solana',
                asset: 'SOL'
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error checking Solana deposits for monitor ${monitorId}:`, error);
      }
    }
  }

  /**
   * Check Ethereum balance and transactions
   */
  async checkEthereumDeposits(): Promise<void> {
    for (const [monitorId, monitor] of this.depositMonitors) {
      if (monitor.chain !== 'ethereum') continue;

      try {
        const balance = await this.ethProvider.getBalance(monitor.userAddress);
        const balanceETH = parseFloat(ethers.formatEther(balance));

        // Get latest block number
        const latestBlock = await this.ethProvider.getBlockNumber();
        
        // Check last 10 blocks for transactions to this address
        for (let i = 0; i < 10; i++) {
          const blockNumber = latestBlock - i;
          const block = await this.ethProvider.getBlock(blockNumber, true);
          
          if (block && block.transactions) {
            for (const txHash of block.transactions) {
              if (typeof txHash === 'string') {
                const tx = await this.ethProvider.getTransaction(txHash);
                if (tx && tx.to === monitor.userAddress) {
                  const receipt = await this.ethProvider.getTransactionReceipt(tx.hash);
                  
                  if (receipt && receipt.status === 1) {
                    // Process confirmed deposit
                    await this.processConfirmedDeposit(monitorId, {
                      txHash: tx.hash,
                      amount: parseFloat(ethers.formatEther(tx.value)),
                      chain: 'ethereum',
                      asset: 'ETH'
                    });
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error checking Ethereum deposits for monitor ${monitorId}:`, error);
      }
    }
  }

  /**
   * Process confirmed deposit
   */
  async processConfirmedDeposit(monitorId: string, depositInfo: {
    txHash: string;
    amount: number;
    chain: string;
    asset: string;
  }): Promise<void> {
    try {
      // Get monitor data from Redis
      const monitorData = await redis.get(`deposit_monitor:${monitorId}`);
      if (!monitorData) return;

      const { userId } = JSON.parse(monitorData);

      // Check if transaction already processed
      const existingTx = await prisma.transaction.findUnique({
        where: { txHash: depositInfo.txHash }
      });

      if (existingTx) return;

      // Create transaction record
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          txHash: depositInfo.txHash,
          chain: depositInfo.chain,
          txType: 'deposit',
          status: 'confirmed',
          amount: depositInfo.amount.toString(),
          asset: depositInfo.asset,
          confirmations: 1
        }
      });

      // Update user balance
      await this.updateUserBalance(userId, depositInfo.asset, depositInfo.chain, depositInfo.amount);

      // Clean up monitor
      this.depositMonitors.delete(monitorId);
      await redis.del(`deposit_monitor:${monitorId}`);

      console.log(`Processed deposit: ${depositInfo.amount} ${depositInfo.asset} for user ${userId}`);
    } catch (error) {
      console.error('Error processing confirmed deposit:', error);
    }
  }

  /**
   * Update user balance after confirmed deposit
   */
  async updateUserBalance(userId: string, asset: string, chain: string, amount: number): Promise<void> {
    try {
      // Get current balance
      let balance = await prisma.balance.findUnique({
        where: {
          userId_asset_chain: {
            userId,
            asset,
            chain
          }
        }
      });

      if (!balance) {
        // Create new balance record
        balance = await prisma.balance.create({
          data: {
            userId,
            asset,
            chain,
            available: amount.toString(),
            locked: '0',
            total: amount.toString()
          }
        });
      } else {
        // Update existing balance
        const newAvailable = parseFloat(balance.available) + amount;
        const newTotal = parseFloat(balance.total) + amount;

        await prisma.balance.update({
          where: { id: balance.id },
          data: {
            available: newAvailable.toString(),
            total: newTotal.toString(),
            updatedAt: new Date()
          }
        });
      }

      // Create ledger entry
      await prisma.ledgerEntry.create({
        data: {
          userId,
          entryType: 'deposit',
          asset,
          amount: amount.toString(),
          balanceBefore: balance.available,
          balanceAfter: (parseFloat(balance.available) + amount).toString(),
          description: `External wallet deposit: ${amount} ${asset}`
        }
      });
    } catch (error) {
      console.error('Error updating user balance:', error);
      throw error;
    }
  }

  /**
   * Start deposit monitoring service
   */
  private startDepositMonitoring(): void {
    // Check for deposits every 30 seconds
    setInterval(async () => {
      await this.checkSolanaDeposits();
      await this.checkEthereumDeposits();
    }, 30000);

    console.log('Deposit monitoring service started');
  }

  /**
   * Get connected wallets for user
   */
  async getUserConnectedWallets(userId: string): Promise<ExternalWalletConnection[]> {
    const wallets = await prisma.connectedWallet.findMany({
      where: { userId },
      select: {
        address: true,
        chain: true,
        verified: true,
        connectedAt: true
      }
    });

    return wallets.map((wallet: any) => ({
      address: wallet.address,
      chain: wallet.chain as 'solana' | 'ethereum',
      verified: wallet.verified
    }));
  }

  /**
   * Disconnect external wallet
   */
  async disconnectExternalWallet(userId: string, address: string): Promise<void> {
    await prisma.connectedWallet.deleteMany({
      where: {
        userId,
        address
      }
    });
  }
}

export const externalWalletService = new ExternalWalletService(); 