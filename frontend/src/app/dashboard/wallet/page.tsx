'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Wallet as WalletIcon, 
  Plus, 
  Minus, 
  Copy, 
  Check,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff
} from 'lucide-react'
import { walletApi, Balance } from '@/lib/api'
import { toast } from 'sonner'

// Balance card component
function BalanceCard({ balance, showValue }: { balance: Balance; showValue: boolean }) {
  const totalValue = parseFloat(balance.total)
  
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">{balance.asset.substring(0, 2)}</span>
          </div>
          <div>
            <h3 className="text-white font-medium">{balance.asset}</h3>
            <p className="text-gray-400 text-sm">{balance.chain}</p>
          </div>
        </div>
        <div className="text-right">
          {showValue ? (
            <>
              <p className="text-white font-medium">{totalValue.toFixed(6)}</p>
              <p className="text-gray-400 text-sm">≈ ${(totalValue * 150).toFixed(2)}</p>
            </>
          ) : (
            <>
              <p className="text-white font-medium">••••••</p>
              <p className="text-gray-400 text-sm">≈ $••••</p>
            </>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-400">Available</p>
          <p className="text-white font-mono">
            {showValue ? parseFloat(balance.available).toFixed(6) : '••••••'}
          </p>
        </div>
        <div>
          <p className="text-gray-400">Locked</p>
          <p className="text-white font-mono">
            {showValue ? parseFloat(balance.locked).toFixed(6) : '••••••'}
          </p>
        </div>
      </div>
    </div>
  )
}

// Deposit modal component
function DepositModal({ 
  isOpen, 
  onClose, 
  selectedAsset 
}: { 
  isOpen: boolean
  onClose: () => void
  selectedAsset: string 
}) {
  const [copiedAddress, setCopiedAddress] = useState('')
  const queryClient = useQueryClient()

  const generateAddressMutation = useMutation({
    mutationFn: (chain: string) => walletApi.generateDepositAddress(chain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deposit-addresses'] })
      toast.success('Deposit address generated successfully!')
    },
    onError: () => {
      toast.error('Failed to generate deposit address')
    }
  })

  const { data: addresses } = useQuery({
    queryKey: ['deposit-addresses'],
    queryFn: () => walletApi.getDepositAddresses(),
    enabled: isOpen
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Deposit {selectedAsset}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-yellow-900 bg-opacity-20 border border-yellow-700 rounded-lg p-4">
            <p className="text-yellow-300 text-sm">
              ⚠️ Only send {selectedAsset} to this address. Sending other assets may result in loss.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Deposit Address
            </label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-gray-700 rounded-lg p-3 font-mono text-sm text-white break-all">
                1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
              </div>
              <button
                onClick={() => copyToClipboard('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')}
                className="bg-blue-600 hover:bg-blue-700 p-2 rounded-lg"
              >
                {copiedAddress === '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' ? (
                  <Check className="h-4 w-4 text-white" />
                ) : (
                  <Copy className="h-4 w-4 text-white" />
                )}
              </button>
            </div>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Important Notes:</h3>
            <ul className="text-gray-300 text-sm space-y-1">
              <li>• Minimum deposit: 0.001 {selectedAsset}</li>
              <li>• Network confirmations required: 3</li>
              <li>• Deposits typically arrive within 10-30 minutes</li>
            </ul>
          </div>

          <button
            onClick={() => generateAddressMutation.mutate(selectedAsset)}
            disabled={generateAddressMutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg disabled:opacity-50"
          >
            {generateAddressMutation.isPending ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              'Generate New Address'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Withdraw modal component
function WithdrawModal({ 
  isOpen, 
  onClose, 
  selectedAsset,
  availableBalance 
}: { 
  isOpen: boolean
  onClose: () => void
  selectedAsset: string
  availableBalance: string
}) {
  const [amount, setAmount] = useState('')
  const [address, setAddress] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Simulate withdrawal API call
      await new Promise(resolve => setTimeout(resolve, 2000))
      toast.success('Withdrawal request submitted successfully!')
      onClose()
      setAmount('')
      setAddress('')
    } catch (error) {
      toast.error('Failed to submit withdrawal request')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Withdraw {selectedAsset}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleWithdraw} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Withdrawal Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter destination address"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Amount
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                required
              />
              <button
                type="button"
                onClick={() => setAmount(availableBalance)}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-blue-400 text-sm hover:text-blue-300"
              >
                MAX
              </button>
            </div>
            <p className="text-gray-400 text-xs mt-1">
              Available: {parseFloat(availableBalance).toFixed(6)} {selectedAsset}
            </p>
          </div>

          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Fee Information:</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Network Fee:</span>
                <span className="text-white">0.001 {selectedAsset}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">You will receive:</span>
                <span className="text-white">
                  {amount ? (parseFloat(amount) - 0.001).toFixed(6) : '0.000000'} {selectedAsset}
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !amount || !address}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              'Withdraw'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

// Main wallet page
export default function WalletPage() {
  const [showBalances, setShowBalances] = useState(true)
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState('')
  const [selectedBalance, setSelectedBalance] = useState('')

  const { data: balancesData, isLoading, refetch } = useQuery({
    queryKey: ['wallet-balances'],
    queryFn: () => walletApi.getBalances(),
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  const balances = balancesData?.data.data.balances || []
  const totalValue = balances.reduce((sum, balance) => sum + (parseFloat(balance.total) * 150), 0)

  const openDepositModal = (asset: string) => {
    setSelectedAsset(asset)
    setDepositModalOpen(true)
  }

  const openWithdrawModal = (asset: string, available: string) => {
    setSelectedAsset(asset)
    setSelectedBalance(available)
    setWithdrawModalOpen(true)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallet</h1>
          <p className="text-gray-400">Manage your cryptocurrency holdings</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowBalances(!showBalances)}
            className="flex items-center space-x-2 bg-gray-800 px-4 py-2 rounded-lg border border-gray-600 hover:border-gray-500"
          >
            {showBalances ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="text-white text-sm">
              {showBalances ? 'Hide' : 'Show'} Balances
            </span>
          </button>
          
          <button
            onClick={() => refetch()}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
          >
            <RefreshCw className="h-4 w-4 text-white" />
            <span className="text-white text-sm">Refresh</span>
          </button>
        </div>
      </div>

      {/* Portfolio Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Balance</p>
              <p className="text-2xl font-bold text-white">
                {showBalances ? `$${totalValue.toFixed(2)}` : '$••••••'}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <WalletIcon className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="flex items-center mt-4 text-green-400">
            <TrendingUp className="h-4 w-4 mr-1" />
            <span className="text-sm">+12.5% (24h)</span>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Available Balance</p>
              <p className="text-2xl font-bold text-white">
                {showBalances ? 
                  `$${balances.reduce((sum, b) => sum + (parseFloat(b.available) * 150), 0).toFixed(2)}` : 
                  '$••••••'
                }
              </p>
            </div>
            <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
              <Plus className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Locked Balance</p>
              <p className="text-2xl font-bold text-white">
                {showBalances ? 
                  `$${balances.reduce((sum, b) => sum + (parseFloat(b.locked) * 150), 0).toFixed(2)}` : 
                  '$••••••'
                }
              </p>
            </div>
            <div className="w-12 h-12 bg-yellow-600 rounded-full flex items-center justify-center">
              <Minus className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Asset Balances */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Your Assets</h2>
        
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-gray-700 rounded mb-2"></div>
                <div className="h-6 bg-gray-700 rounded"></div>
              </div>
            ))}
          </div>
        ) : balances.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <WalletIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-400">No assets found</p>
            <p className="text-gray-500 text-sm">Make a deposit to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {balances.map((balance) => (
              <div key={`${balance.asset}-${balance.chain}`} className="relative group">
                <BalanceCard balance={balance} showValue={showBalances} />
                
                {/* Action buttons overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg flex items-center justify-center space-x-4">
                  <button
                    onClick={() => openDepositModal(balance.asset)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Deposit</span>
                  </button>
                  <button
                    onClick={() => openWithdrawModal(balance.asset, balance.available)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
                    disabled={parseFloat(balance.available) === 0}
                  >
                    <Minus className="h-4 w-4" />
                    <span>Withdraw</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Recent Transactions</h2>
        <div className="bg-gray-800 rounded-lg">
          <div className="p-4 border-b border-gray-700">
            <div className="grid grid-cols-5 gap-4 text-sm font-medium text-gray-400">
              <div>Type</div>
              <div>Asset</div>
              <div>Amount</div>
              <div>Status</div>
              <div>Date</div>
            </div>
          </div>
          <div className="p-8 text-center">
            <p className="text-gray-400">No recent transactions</p>
            <p className="text-gray-500 text-sm">Your transaction history will appear here</p>
          </div>
        </div>
      </div>

      {/* Modals */}
      <DepositModal
        isOpen={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        selectedAsset={selectedAsset}
      />
      
      <WithdrawModal
        isOpen={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        selectedAsset={selectedAsset}
        availableBalance={selectedBalance}
      />
    </div>
  )
}