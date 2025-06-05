import { Elysia, t } from 'elysia';
import { authGuard } from '../middleware/auth.middleware.js';
import { externalWalletService } from '../services/external-wallet.service.js';
import { marketMakerService } from '../services/market-maker.service.js';

export const externalWalletRoutes = new Elysia({ prefix: '/api/external-wallet' })
  .use(authGuard)

  // Generate signature challenge for wallet verification
  .post('/challenge', async ({ body, user }) => {
    try {
      const { address } = body;
      const message = externalWalletService.generateSignatureChallenge(address);
      
      return {
        success: true,
        data: { message }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate challenge'
      };
    }
  }, {
    body: t.Object({
      address: t.String()
    })
  })

  // Connect external wallet
  .post('/connect', async ({ body, user }) => {
    try {
      const { address, chain, signature } = body;
      
      const connection = await externalWalletService.connectExternalWallet(
        user.id,
        address,
        chain,
        signature
      );
      
      return {
        success: true,
        data: connection
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect wallet'
      };
    }
  }, {
    body: t.Object({
      address: t.String(),
      chain: t.Union([t.Literal('solana'), t.Literal('ethereum')]),
      signature: t.String()
    })
  })

  // Get connected wallets
  .get('/connected', async ({ user }) => {
    try {
      const wallets = await externalWalletService.getUserConnectedWallets(user.id);
      
      return {
        success: true,
        data: wallets
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get connected wallets'
      };
    }
  })

  // Disconnect external wallet
  .delete('/disconnect', async ({ body, user }) => {
    try {
      const { address } = body;
      
      await externalWalletService.disconnectExternalWallet(user.id, address);
      
      return {
        success: true,
        message: 'Wallet disconnected successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disconnect wallet'
      };
    }
  }, {
    body: t.Object({
      address: t.String()
    })
  })

  // Get deposit address for a chain
  .get('/deposit-address/:chain', async ({ params, user }) => {
    try {
      const { chain } = params;
      const address = await externalWalletService.getUserDepositAddress(user.id, chain as 'solana' | 'ethereum');
      
      return {
        success: true,
        data: { address, chain }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get deposit address'
      };
    }
  }, {
    params: t.Object({
      chain: t.Union([t.Literal('solana'), t.Literal('ethereum')])
    })
  })

  // Start monitoring deposits
  .post('/monitor-deposit', async ({ body, user }) => {
    try {
      const { chain, userAddress, expectedAmount } = body;
      
      const monitorId = await externalWalletService.monitorDeposit(
        user.id,
        chain,
        userAddress,
        expectedAmount
      );
      
      return {
        success: true,
        data: { monitorId }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start monitoring'
      };
    }
  }, {
    body: t.Object({
      chain: t.Union([t.Literal('solana'), t.Literal('ethereum')]),
      userAddress: t.String(),
      expectedAmount: t.Optional(t.Number())
    })
  });

export const marketMakerRoutes = new Elysia({ prefix: '/api/market-maker' })
  
  // Get current Binance prices
  .get('/prices', async () => {
    try {
      const prices = {
        'SOL/USDC': marketMakerService.getBinancePrice('SOL/USDC'),
        'ETH/USDC': marketMakerService.getBinancePrice('ETH/USDC')
      };
      
      return {
        success: true,
        data: prices
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get prices'
      };
    }
  })

  // Get market data
  .get('/market-data/:pair', async ({ params }) => {
    try {
      const { pair } = params;
      const marketData = await marketMakerService.getMarketData(pair);
      
      return {
        success: true,
        data: marketData
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get market data'
      };
    }
  }, {
    params: t.Object({
      pair: t.String()
    })
  })

  // Get market maker configuration (admin only)
  .get('/config', async () => {
    try {
      const config = Object.fromEntries(marketMakerService.getConfig());
      
      return {
        success: true,
        data: config
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get config'
      };
    }
  })

  // Update market maker configuration (admin only)
  .put('/config/:pair', async ({ params, body }) => {
    try {
      const { pair } = params;
      marketMakerService.updateConfig(pair, body);
      
      return {
        success: true,
        message: `Configuration updated for ${pair}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update config'
      };
    }
  }, {
    params: t.Object({
      pair: t.String()
    }),
    body: t.Object({
      spread: t.Optional(t.Number()),
      orderSize: t.Optional(t.Number()),
      maxOrders: t.Optional(t.Number()),
      priceDeviation: t.Optional(t.Number()),
      enabled: t.Optional(t.Boolean())
    })
  })

  // Toggle market making for a pair (admin only)
  .post('/toggle/:pair', async ({ params, body }) => {
    try {
      const { pair } = params;
      const { enabled } = body;
      
      marketMakerService.toggleMarketMaking(pair, enabled);
      
      return {
        success: true,
        message: `Market making ${enabled ? 'enabled' : 'disabled'} for ${pair}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to toggle market making'
      };
    }
  }, {
    params: t.Object({
      pair: t.String()
    }),
    body: t.Object({
      enabled: t.Boolean()
    })
  }); 