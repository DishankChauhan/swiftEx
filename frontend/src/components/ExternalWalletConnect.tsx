'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Wallet, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  ExternalLink,
  AlertCircle,
  Send,
  RefreshCw
} from 'lucide-react'
import { useWallet } from '@/lib/wallet-context'
import { externalWalletApi, walletApi } from '@/lib/api'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface ConnectedWallet {
  id: string
  address: string
  chain: 'solana' | 'ethereum'
  verified: boolean
  connectedAt: string
}

interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
  chain: 'solana' | 'ethereum'
}

function DepositModal({ isOpen, onClose, chain }: DepositModalProps) {
  const [amount, setAmount] = useState('')
  const [copiedAddress, setCopiedAddress] = useState('')
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const { 
    solanaWallet, 
    solanaConnected, 
    depositWithSolana,
    isDepositing
  } = useWallet()

  // Debug the query state
  console.log('Modal state:', { isOpen, user: !!user, chain })
  console.log('Query enabled:', isOpen && !!user)
  console.log('Auth token:', localStorage.getItem('accessToken'))
  console.log('User object:', user)

  // Test auth with a simpler endpoint
  const { data: testAuthData, error: testAuthError } = useQuery({
    queryKey: ['test-auth'],
    queryFn: async () => {
      console.log('Testing auth with connected wallets endpoint...')
      try {
        const result = await externalWalletApi.getConnectedWallets()
        console.log('Auth test result:', result)
        return result
      } catch (error: any) {
        console.error('Auth test failed:', error)
        throw error
      }
    },
    enabled: isOpen && !!user
  })

  console.log('Auth test data:', testAuthData)
  console.log('Auth test error:', testAuthError)

  // Get deposit address for the selected chain
  const { data: depositAddressData, isLoading: loadingAddress, error: depositAddressError } = useQuery({
    queryKey: ['deposit-address', chain],
    queryFn: async () => {
      try {
        const result = await externalWalletApi.getDepositAddress(chain)
        return result
      } catch (error: any) {
        console.error('Failed to fetch deposit address:', error)
        throw error
      }
    },
    enabled: isOpen && !!user,
    retry: 3,
    retryDelay: 1000
  })

  // Debug the deposit address data
  console.log('Deposit address data:', depositAddressData)
  console.log('Deposit address loading:', loadingAddress)
  console.log('Deposit address error:', depositAddressError)

  const depositMutation = useMutation({
    mutationFn: async () => {
      const depositAddress = depositAddressData?.data?.data?.address
      if (!depositAddress) throw new Error('Deposit address not found')
      
      const depositAmount = parseFloat(amount)
      if (isNaN(depositAmount) || depositAmount <= 0) {
        throw new Error('Invalid deposit amount')
      }

      if (chain === 'solana') {
        return await depositWithSolana(depositAmount, depositAddress)
      } else {
        // Ethereum is temporarily disabled
        throw new Error('Ethereum deposits temporarily unavailable')
      }
    },
    onSuccess: (txHash) => {
      toast.success(`Deposit transaction submitted! Transaction: ${txHash}`)
      
      // Immediately refresh all relevant data
      queryClient.invalidateQueries({ queryKey: ['balances'] })
      queryClient.invalidateQueries({ queryKey: ['wallet-balances'] })
      queryClient.invalidateQueries({ queryKey: ['connected-wallets'] })
      queryClient.invalidateQueries({ queryKey: ['deposit-address'] })
      
      // Force immediate refetch of balances
      queryClient.refetchQueries({ queryKey: ['wallet-balances'] })
      
      setAmount('')
      onClose()
      
      // Show additional success messages
      setTimeout(() => {
        toast.success(
          `✅ Deposit confirmed! Transaction: ${txHash.slice(0, 8)}...${txHash.slice(-8)}`, 
          { duration: 6000 }
        )
      }, 1000)
      
      setTimeout(() => {
        toast.info(
          `🔗 View on Solana Explorer: https://explorer.solana.com/tx/${txHash}?cluster=devnet`, 
          { duration: 10000 }
        )
      }, 3000)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Deposit failed')
    }
  })

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedAddress(text)
      toast.success('Address copied to clipboard!')
      setTimeout(() => setCopiedAddress(''), 2000)
    } catch (error) {
      toast.error('Failed to copy address')
    }
  }

  const isWalletConnected = chain === 'solana' ? solanaConnected : false
  const walletAddress = chain === 'solana' ? solanaWallet?.publicKey?.toString() : undefined
  const chainName = chain === 'solana' ? 'Solana' : 'Ethereum'
  const assetSymbol = chain === 'solana' ? 'SOL' : 'ETH'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Deposit {assetSymbol}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {chain === 'ethereum' ? (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
            <p className="text-white mb-2">Ethereum Support Coming Soon</p>
            <p className="text-gray-400 text-sm mb-4">
              Ethereum wallet integration is being finalized. Please use Solana for now.
            </p>
            <button
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Wallet Connection Status */}
            <div className="mb-6">
              <div className="flex items-center space-x-3 p-4 bg-gray-700 rounded-lg">
                <Wallet className="h-5 w-5 text-blue-400" />
                <div className="flex-1">
                  <p className="text-white font-medium">{chainName} Wallet</p>
                  <p className="text-gray-400 text-sm">
                    {isWalletConnected ? (
                      <>Connected: {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</>
                    ) : (
                      'Not connected'
                    )}
                  </p>
                </div>
                <div className={`w-3 h-3 rounded-full ${isWalletConnected ? 'bg-green-400' : 'bg-red-400'}`} />
              </div>
            </div>

            {isWalletConnected ? (
              <>
                {/* Deposit Address */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Exchange Deposit Address
                  </label>
                  {loadingAddress ? (
                    <div className="bg-gray-700 rounded-lg p-3 flex items-center justify-center">
                      <RefreshCw className="h-4 w-4 text-gray-400 animate-spin" />
                      <span className="ml-2 text-gray-400">Loading address...</span>
                    </div>
                  ) : depositAddressData?.data?.data?.address ? (
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-gray-700 rounded-lg p-3 font-mono text-sm text-white break-all">
                        {depositAddressData.data.data.address}
                      </div>
                      <button
                        onClick={() => copyToClipboard(depositAddressData.data.data.address)}
                        className="bg-blue-600 hover:bg-blue-700 p-2 rounded-lg"
                      >
                        {copiedAddress === depositAddressData.data.data.address ? (
                          <Check className="h-4 w-4 text-white" />
                        ) : (
                          <Copy className="h-4 w-4 text-white" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-red-900 bg-opacity-20 border border-red-700 rounded-lg p-3 text-red-300">
                      Failed to load deposit address
                      {depositAddressError && (
                        <p className="text-xs mt-1">
                          Error: {(depositAddressError as any)?.response?.data?.message || (depositAddressError as any)?.message || 'Unknown error'}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Amount Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Amount to Deposit ({assetSymbol})
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={`Enter ${assetSymbol} amount`}
                    step="0.001"
                    min="0.001"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-gray-400 text-xs mt-1">
                    Minimum deposit: 0.001 {assetSymbol}
                  </p>
                </div>

                {/* Deposit Button */}
                <button
                  onClick={() => depositMutation.mutate()}
                  disabled={!amount || parseFloat(amount) < 0.001 || isDepositing || depositMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-medium transition-colors"
                >
                  {isDepositing || depositMutation.isPending ? (
                    <div className="flex items-center justify-center">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Processing Deposit...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <Send className="h-4 w-4 mr-2" />
                      Deposit {assetSymbol}
                    </div>
                  )}
                </button>

                {/* Important Notes */}
                <div className="mt-6 bg-yellow-900 bg-opacity-20 border border-yellow-700 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
                    <div>
                      <h3 className="text-yellow-400 font-medium mb-1">Important Notes:</h3>
                      <ul className="text-yellow-300 text-sm space-y-1">
                        <li>• This is Solana Devnet</li>
                        <li>• Only send {assetSymbol} to this address</li>
                        <li>• Deposits are monitored automatically</li>
                        <li>• Balance will update after confirmation</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
                <p className="text-white mb-2">Wallet Not Connected</p>
                <p className="text-gray-400 text-sm mb-4">
                  Please connect your {chainName} wallet to make deposits
                </p>
                <button
                  onClick={onClose}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg"
                >
                  Close
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function ExternalWalletConnect() {
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false)
  const [selectedChain, setSelectedChain] = useState<'solana' | 'ethereum'>('solana')
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const {
    solanaWallet,
    solanaConnected,
    connectSolana,
    disconnectSolana,
    connectExternalWallet,
    disconnectExternalWallet,
    isConnecting
  } = useWallet()

  // Get connected wallets
  const { data: connectedWalletsData, isLoading: loadingWallets } = useQuery({
    queryKey: ['connected-wallets'],
    queryFn: () => externalWalletApi.getConnectedWallets(),
    enabled: !!user
  })

  const connectedWallets = connectedWalletsData?.data.data || []

  // Connect external wallet mutation
  const connectWalletMutation = useMutation({
    mutationFn: ({ address, chain }: { address: string; chain: 'solana' | 'ethereum' }) =>
      connectExternalWallet(address, chain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-wallets'] })
    }
  })

  // Disconnect external wallet mutation
  const disconnectWalletMutation = useMutation({
    mutationFn: (address: string) => disconnectExternalWallet(address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-wallets'] })
    }
  })

  const handleConnectSolana = async () => {
    if (isConnecting || connectWalletMutation.isPending) return // Prevent multiple attempts
    
    try {
      // First connect the wallet locally
      await connectSolana()
      
      // Wait a moment for the wallet state to stabilize
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Then register with the backend if we have a public key
      if (solanaWallet?.publicKey && solanaConnected) {
        await connectWalletMutation.mutateAsync({
          address: solanaWallet.publicKey.toString(),
          chain: 'solana'
        })
      }
    } catch (error) {
      console.error('Failed to connect Solana wallet:', error)
    }
  }

  const openDepositModal = (chain: 'solana' | 'ethereum') => {
    setSelectedChain(chain)
    setIsDepositModalOpen(true)
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
        <p className="text-white text-lg mb-2">Authentication Required</p>
        <p className="text-gray-400">Please sign in to connect external wallets</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">External Wallets</h2>
          <p className="text-gray-400">Connect your Phantom wallet to deposit devnet SOL</p>
        </div>
      </div>

      {/* Wallet Connection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Solana (Phantom) */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold">S</span>
              </div>
              <div>
                <h3 className="text-white font-medium">Solana (Phantom)</h3>
                <p className="text-gray-400 text-sm">Connect Phantom wallet</p>
              </div>
            </div>
            <div className={`w-3 h-3 rounded-full ${solanaConnected ? 'bg-green-400' : 'bg-gray-400'}`} />
          </div>

          {solanaConnected && solanaWallet?.publicKey ? (
            <div className="space-y-3">
              <div className="bg-gray-700 rounded-lg p-3">
                <p className="text-gray-400 text-xs">Connected Address</p>
                <p className="text-white font-mono text-sm">
                  {solanaWallet.publicKey.toString().slice(0, 20)}...{solanaWallet.publicKey.toString().slice(-10)}
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => openDepositModal('solana')}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg text-sm"
                >
                  Deposit SOL
                </button>
                <button
                  onClick={disconnectSolana}
                  className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-3 rounded-lg"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleConnectSolana}
              disabled={isConnecting || connectWalletMutation.isPending}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg"
            >
              {isConnecting || connectWalletMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
              ) : (
                'Connect Phantom'
              )}
            </button>
          )}
        </div>

        {/* Ethereum (Coming Soon) */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 opacity-50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold">E</span>
              </div>
              <div>
                <h3 className="text-white font-medium">Ethereum (MetaMask)</h3>
                <p className="text-gray-400 text-sm">Coming soon...</p>
              </div>
            </div>
            <div className="w-3 h-3 rounded-full bg-gray-500" />
          </div>

          <button
            disabled
            className="w-full bg-gray-600 text-gray-400 py-2 px-4 rounded-lg cursor-not-allowed"
          >
            Coming Soon
          </button>
        </div>
      </div>

      {/* Connected Wallets List */}
      {connectedWallets.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h3 className="text-white font-medium mb-4">Connected & Verified Wallets</h3>
          <div className="space-y-3">
            {connectedWallets.map((wallet: ConnectedWallet) => (
              <div key={wallet.id} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    wallet.chain === 'solana' ? 'bg-purple-600' : 'bg-orange-600'
                  }`}>
                    <span className="text-white text-sm font-bold">
                      {wallet.chain === 'solana' ? 'S' : 'E'}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-mono text-sm">
                      {wallet.address.slice(0, 20)}...{wallet.address.slice(-10)}
                    </p>
                    <p className="text-gray-400 text-xs capitalize">
                      {wallet.chain} • {wallet.verified ? 'Verified' : 'Pending'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => disconnectWalletMutation.mutate(wallet.address)}
                  disabled={disconnectWalletMutation.isPending}
                  className="text-red-400 hover:text-red-300 p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      <DepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        chain={selectedChain}
      />
    </div>
  )
} 