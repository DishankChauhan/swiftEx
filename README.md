# 🚀 swiftEx 

A high-performance centralized crypto spot exchange backend built with **Bun** and **Elysia.js**

![swiftEx architecture](https://github.com/user-attachments/assets/2a958335-a7ca-4c88-84df-b6622c01802e)



## 🎯 Completed Phases

### ✅ Phase 1 - Authentication & Core
- **User Authentication** - Registration, login with JWT tokens
- **2FA Security** - TOTP-based two-factor authentication
- **Session Management** - Refresh tokens with secure session handling
- **Database Integration** - PostgreSQL with Prisma ORM
- **Type Safety** - Full TypeScript implementation with Zod validation

### ✅ Phase 2 - Wallet System (Crypto Custody)
- **Multi-Chain Support** - Solana and Ethereum wallet generation
- **Deposit Addresses** - Unique addresses per user per chain
- **HD Wallet Generation** - Deterministic wallet creation with BIP39
- **Balance Management** - Internal balance tracking system
- **Transaction History** - Comprehensive transaction logging
- **Live Balance Checking** - Real-time blockchain balance verification
- **Secure Key Storage** - Encrypted private key management

### ✅ Phase 3 - Internal Ledger System
- **Asset Configuration** - Comprehensive asset management (SOL, ETH, USDC)
- **Trading Pairs** - Configurable trading pairs (SOL/USDC, ETH/USDC)
- **Order Management** - Create, cancel, and track limit orders
- **Balance Operations** - Lock/unlock balances for trading operations
- **Internal Transfers** - Move funds between user accounts instantly
- **Ledger History** - Complete audit trail of all balance movements
- **Order Book Foundation** - Prepared for matching engine integration
- **Asset Configuration** - Min/max order sizes, fees, decimals per asset

### 🆕 ✅ Phase 4 - Matching Engine & Order Book (Redis-Powered)
- **Redis-Based Order Book** - High-performance order book using Redis sorted sets
- **Matching Engine** - Complete order matching with price-time priority
- **Real-time Order Book** - Live order book snapshots and updates
- **WebSocket Integration** - Real-time market data streaming
- **Market Data APIs** - Ticker data, statistics, and order book depth
- **Order Execution** - Atomic order matching with proper balance updates
- **Trade History** - Complete trade execution records and order fills
- **Performance Optimized** - Sub-millisecond order book operations

## 🛠️ Tech Stack

- **Runtime**: Bun (JavaScript/TypeScript)
- **Framework**: Elysia.js (lightweight Bun-native framework)
- **Database**: PostgreSQL with Prisma ORM
- **Cache/Order Book**: Redis (high-performance order book storage)
- **Real-time**: WebSocket connections for live market data
- **Authentication**: JWT with refresh tokens, TOTP 2FA
- **Blockchain**: @solana/web3.js, ethers.js
- **Cryptography**: bip39, ed25519-hd-key
- **Validation**: Zod schema validation
- **Security**: bcryptjs password hashing, QR code generation

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) installed
- Docker and Docker Compose
- PostgreSQL database running

### Installation

1. **Clone and install dependencies**:
```bash
bun install
```

2. **Start the database**:
```bash
docker-compose up -d
```

3. **Setup environment variables**:
```bash
# Create .env file with:
DATABASE_URL="postgresql://postgres:password@localhost:5432/crypto_exchange_db"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
REFRESH_TOKEN_SECRET="your-super-secret-refresh-token-key-change-in-production"
PORT=3001

# Optional blockchain RPC URLs (defaults to public endpoints)
SOLANA_RPC_URL="https://api.devnet.solana.com"
ETHEREUM_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/your-api-key"
```

4. **Initialize database**:
```bash
bun run db:generate
bun run db:push
```

5. **Start development server**:
```bash
bun run dev
```

The API will be available at `http://localhost:3001`

## 📚 API Endpoints

### Authentication Endpoints (Phase 1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API information |
| GET | `/health` | Health check |
| POST | `/auth/register` | User registration |
| POST | `/auth/login` | User login |
| POST | `/auth/login/2fa` | Login with 2FA |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout user |
| GET | `/auth/profile` | Get user profile (Protected) |
| POST | `/auth/2fa/setup` | Setup 2FA (Protected) |
| POST | `/auth/2fa/enable` | Enable 2FA (Protected) |
| POST | `/auth/2fa/disable` | Disable 2FA (Protected) |

### Wallet Endpoints (Phase 2) - All Protected

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/wallet/deposit/address` | Generate deposit address |
| GET | `/wallet/deposit/addresses` | Get all deposit addresses |
| GET | `/wallet/balances` | Get user balances |
| GET | `/wallet/transactions` | Get transaction history |
| GET | `/wallet/balance/live/:chain/:address` | Get live blockchain balance |

### Ledger Endpoints (Phase 3)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ledger/init` | Initialize system assets & trading pairs |
| GET | `/ledger/assets` | Get asset configurations |
| GET | `/ledger/assets/:symbol` | Get specific asset config |
| POST | `/ledger/assets` | Create asset configuration (Admin) |
| GET | `/ledger/trading-pairs` | Get trading pairs |
| GET | `/ledger/trading-pairs/:symbol` | Get specific trading pair |
| POST | `/ledger/trading-pairs` | Create trading pair (Admin) |

#### Protected Ledger Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ledger/orders` | Create order |
| GET | `/ledger/orders` | Get user orders |
| GET | `/ledger/orders/:orderId` | Get specific order |
| DELETE | `/ledger/orders/:orderId` | Cancel order |
| GET | `/ledger/balances` | Get user balances |
| GET | `/ledger/balances/:asset/:chain` | Get specific balance |
| POST | `/ledger/transfer` | Internal transfer |
| GET | `/ledger/history` | Get ledger history |
| POST | `/ledger/balance/operation` | Manual balance operation (Admin) |

### Order Book & Matching Engine Endpoints (Phase 4)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/orderbook/:pair` | Get order book snapshot |
| GET | `/orderbook/:pair/ticker` | Get real-time ticker data |
| GET | `/orderbook/:pair/stats` | Get order book statistics |
| GET | `/orderbook/:pair/config` | Get trading pair configuration |
| DELETE | `/orderbook/:pair/clear` | Clear order book (Admin) |

#### Protected Order Book Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orderbook/order` | Place order via matching engine |
| DELETE | `/orderbook/order/:orderId` | Cancel order |

### WebSocket Endpoints (Phase 4)

| Protocol | Endpoint | Description |
|----------|----------|-------------|
| WS | `/ws` | WebSocket connection for real-time data |
| GET | `/ws/stats` | WebSocket connection statistics |

**WebSocket Subscription Channels:**
- `orderbook@SOL/USDC` - Real-time order book updates
- `ticker@SOL/USDC` - Real-time ticker data
- `trade@SOL/USDC` - Real-time trade stream
- `ticker@all` - All ticker updates

## 📖 API Usage Examples

### Phase 4 - Matching Engine & Order Book

```bash
# Get order book snapshot
curl -X GET http://localhost:3001/orderbook/SOLUSDC

# Get ticker data
curl -X GET http://localhost:3001/orderbook/SOLUSDC/ticker

# Get order book statistics
curl -X GET http://localhost:3001/orderbook/SOLUSDC/stats

# Get trading pair configuration
curl -X GET http://localhost:3001/orderbook/SOLUSDC/config

# Place order via matching engine
curl -X POST http://localhost:3001/orderbook/order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "tradingPair": "SOL/USDC",
    "side": "buy",
    "type": "limit",
    "amount": "1.0",
    "price": "100.00"
  }'

# Cancel order
curl -X DELETE http://localhost:3001/orderbook/order/ORDER_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# WebSocket connection (JavaScript example)
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onopen = () => {
  // Subscribe to order book updates
  ws.send(JSON.stringify({
    type: 'subscribe',
    data: {
      channels: ['orderbook@SOL/USDC', 'ticker@SOL/USDC']
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Real-time update:', message);
};
```

### Phase 3 - Internal Ledger System

```bash
# Initialize system (creates SOL, ETH, USDC assets and SOL/USDC, ETH/USDC pairs)
curl -X POST http://localhost:3001/ledger/init

# Get trading pairs
curl -X GET http://localhost:3001/ledger/trading-pairs

# Create a buy order
curl -X POST http://localhost:3001/ledger/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "tradingPair": "SOL/USDC",
    "orderType": "limit",
    "side": "buy",
    "amount": "1.0",
    "price": "100.00",
    "timeInForce": "GTC"
  }'

# Create a sell order
curl -X POST http://localhost:3001/ledger/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "tradingPair": "SOL/USDC",
    "orderType": "limit",
    "side": "sell",
    "amount": "0.5",
    "price": "105.00"
  }'

# Get user orders
curl -X GET http://localhost:3001/ledger/orders \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Cancel an order
curl -X DELETE http://localhost:3001/ledger/orders/ORDER_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Internal transfer
curl -X POST http://localhost:3001/ledger/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "toUserId": "TARGET_USER_ID",
    "asset": "USDC",
    "amount": "50",
    "description": "Payment for services"
  }'

# Get ledger history
curl -X GET http://localhost:3001/ledger/history \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 🗄️ Database Schema

### Phase 1 Models
```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  passwordHash    String
  is2FAEnabled    Boolean   @default(false)
  twoFASecret     String?
  kycStatus       String    @default("pending")
  sessions        Session[]
  wallets         Wallet[]
  transactions    Transaction[]
  balances        Balance[]
  orders          Order[]
  ledgerEntries   LedgerEntry[]
}

model Session {
  id          String   @id @default(cuid())
  userId      String
  token       String   @unique
  refreshToken String  @unique
  expiresAt   DateTime
  user        User     @relation(fields: [userId], references: [id])
}
```

### Phase 2 Models
```prisma
model Wallet {
  id          String   @id @default(cuid())
  userId      String
  chain       String   // "solana" or "ethereum"
  address     String   @unique
  type        String   // "deposit" or "withdrawal"
  privateKey  String?  // Encrypted
  publicKey   String?
  derivationPath String?
  isActive    Boolean  @default(true)
  user        User     @relation(fields: [userId], references: [id])
}

model Transaction {
  id          String   @id @default(cuid())
  userId      String
  chain       String
  txType      String   // "deposit", "withdrawal", "internal"
  status      String   @default("pending")
  amount      String
  asset       String   // "SOL", "ETH", "USDC"
  txHash      String?
  user        User     @relation(fields: [userId], references: [id])
}

model Balance {
  id          String   @id @default(cuid())
  userId      String
  asset       String   // "SOL", "ETH", "USDC"
  chain       String   // "solana" or "ethereum"
  available   String   @default("0")
  locked      String   @default("0")
  total       String   @default("0")
  user        User     @relation(fields: [userId], references: [id])
}
```

### Phase 3 Models
```prisma
model AssetConfig {
  id              String    @id @default(cuid())
  symbol          String    @unique // "SOL", "ETH", "USDC"
  name            String    // "Solana", "Ethereum", "USD Coin"
  decimals        Int       // 9 for SOL, 18 for ETH, 6 for USDC
  chain           String    // "solana" or "ethereum"
  contractAddress String?   // For tokens
  isActive        Boolean   @default(true)
  minDeposit      String    @default("0")
  minWithdrawal   String    @default("0")
  withdrawalFee   String    @default("0")
}

model TradingPair {
  id           String   @id @default(cuid())
  symbol       String   @unique // "SOL/USDC", "ETH/USDC"
  baseAsset    String   // "SOL", "ETH"
  quoteAsset   String   // "USDC"
  isActive     Boolean  @default(true)
  minOrderSize String   // Minimum order size
  maxOrderSize String   // Maximum order size
  priceStep    String   // Minimum price increment
  sizeStep     String   // Minimum size increment
  makerFee     String   @default("0.001")
  takerFee     String   @default("0.001")
  orders       Order[]
}

model Order {
  id            String   @id @default(cuid())
  userId        String
  tradingPair   String   // "SOL/USDC"
  orderType     String   // "market", "limit", "stop"
  side          String   // "buy", "sell"
  amount        String   // Order amount
  price         String?  // Order price
  status        String   @default("pending")
  filled        String   @default("0")
  remaining     String   // Amount remaining
  lockedAmount  String   // Amount locked for order
  lockedAsset   String   // Asset locked
  user          User     @relation(fields: [userId], references: [id])
  fills         OrderFill[]
  ledgerEntries LedgerEntry[]
}

model OrderFill {
  id         String   @id @default(cuid())
  orderId    String
  amount     String   // Amount filled
  price      String   // Fill price
  fee        String   // Fee charged
  feeAsset   String   // Asset in which fee is charged
  isMaker    Boolean  // True if maker order
  order      Order    @relation(fields: [orderId], references: [id])
}

model LedgerEntry {
  id            String   @id @default(cuid())
  userId        String
  orderId       String?
  transactionId String?
  entryType     String   // "deposit", "withdrawal", "trade", "fee", "lock", "unlock"
  asset         String   // Asset affected
  amount        String   // Amount (+ for credit, - for debit)
  balanceBefore String   // Balance before
  balanceAfter  String   // Balance after
  description   String?
  user          User     @relation(fields: [userId], references: [id])
  order         Order?   @relation(fields: [orderId], references: [id])
  transaction   Transaction? @relation(fields: [transactionId], references: [id])
}
```

## 🔧 Development Commands

```bash
# Development server with hot reload
bun run dev

# Production server
bun run start

# Database operations
bun run db:generate    # Generate Prisma client
bun run db:push        # Push schema to database
bun run db:migrate     # Create migration
bun run db:studio      # Open Prisma Studio

# Testing
bun run test           # Phase 1 tests
bun run test:phase2    # Phase 2 tests
bun run test:phase3    # Phase 3 tests
```

## 🛡️ Security Features

### Phase 1
- **Password Hashing**: bcryptjs with salt rounds
- **JWT Tokens**: Short-lived access tokens (15 min) + long-lived refresh tokens (7 days)
- **2FA Authentication**: TOTP-based with QR code generation
- **Session Management**: Secure session tracking with expiration
- **Input Validation**: Zod schema validation for all inputs
- **CORS Protection**: Configured for specific origins

### Phase 2
- **HD Wallet Generation**: BIP39 mnemonic-based deterministic wallets
- **Private Key Encryption**: Encrypted storage of private keys
- **Address Verification**: Ownership verification for all operations
- **Chain Separation**: Isolated wallet generation per blockchain
- **Balance Isolation**: Separate balance tracking per asset/chain

### Phase 3
- **Atomic Transactions**: Database transactions ensure consistency
- **Balance Locking**: Proper fund locking for pending orders
- **Order Validation**: Min/max order size enforcement
- **Asset Validation**: Trading pair and asset existence checks
- **Audit Trail**: Complete ledger history for compliance
- **Transfer Verification**: User existence checks for internal transfers

## 🌐 Supported Trading Features

### Order Types
- **Limit Orders**: Buy/sell at specific price or better
- **Time in Force**: GTC (Good Till Cancelled), IOC, FOK support
- **Order Management**: Create, cancel, query orders
- **Balance Management**: Automatic fund locking/unlocking

### Trading Pairs
- **SOL/USDC**: Solana to USD Coin
- **ETH/USDC**: Ethereum to USD Coin
- **Configurable**: Min/max order sizes, price steps, fees
- **Active/Inactive**: Enable/disable trading pairs dynamically

### Internal Operations
- **Instant Transfers**: Move funds between accounts
- **Balance Operations**: Add, subtract, lock, unlock balances
- **Ledger Tracking**: Complete audit trail of all operations
- **Fee Management**: Configurable maker/taker fees

## 📁 Project Structure

```
src/
├── config/
│   ├── database.ts          # Prisma client setup
│   └── blockchain.ts        # Blockchain configuration
├── middleware/
│   └── auth.ts             # Authentication middleware
├── routes/
│   ├── auth.routes.ts      # Authentication routes
│   ├── wallet.routes.ts    # Wallet routes (Phase 2)
│   └── ledger.routes.ts    # Ledger routes (Phase 3)
├── services/
│   ├── auth.service.ts     # Authentication business logic
│   ├── wallet.service.ts   # Wallet business logic (Phase 2)
│   └── ledger.service.ts   # Ledger business logic (Phase 3)
├── types/
│   ├── auth.ts            # Authentication types
│   ├── wallet.ts          # Wallet types (Phase 2)
│   └── ledger.ts          # Ledger types (Phase 3)
├── utils/
│   └── jwt.ts             # JWT utilities
└── index.ts               # Application entry point

prisma/
└── schema.prisma          # Database schema

tests/
├── test.js                # Phase 1 tests
├── test-phase2.js         # Phase 2 tests
└── test-phase3.js         # Phase 3 tests
```

## 🚧 Completed Phases

- ✅ **Phase 1**: Project Bootstrap (Auth + Core)
- ✅ **Phase 2**: Wallet System (Crypto Custody)
- ✅ **Phase 3**: Internal Ledger System
- ✅ **Phase 4**: Matching Engine & Order Book (Redis-Powered)

## 🛣️ Next Phases

- **Phase 5**: Advanced Market Data & Analytics
- **Phase 6**: Advanced Order Types & Risk Management
- **Phase 7**: Multi-Asset Portfolio Management
- **Phase 8**: Production Deployment & Monitoring

## 🚀 Performance & Architecture

- **Bun Runtime**: ~3x faster than Node.js
- **Elysia.js**: Lightweight, Bun-optimized framework
- **Database**: PostgreSQL for reliability + Redis for high-performance order book
- **Cache Layer**: Redis sorted sets for sub-millisecond order book operations
- **Real-time**: WebSocket connections for live market data streaming
- **Type Safety**: Full TypeScript implementation
- **Modular Design**: Clean separation of concerns
- **Blockchain Integration**: Direct RPC connections for real-time data
- **HD Wallets**: Deterministic address generation for scalability
- **Atomic Operations**: Database transactions for data consistency
- **Balance Management**: Proper fund locking for trading operations
- **Order Matching**: Price-time priority matching engine

## 🧪 Test Results

### Phase 4 - Matching Engine & Order Book ✅

✅ **Health Check**: System status and version verification  
✅ **Order Book Endpoints**: Snapshots, ticker data, statistics, configuration  
✅ **WebSocket Connections**: Real-time data streaming  
✅ **System Initialization**: Asset and trading pair setup  
✅ **Order Placement**: Buy/sell order creation via matching engine  
✅ **Order Execution**: Atomic order matching and balance updates  
✅ **Order Cancellation**: Remove orders from book and unlock funds  
✅ **Real-time Updates**: Live order book and market data  
✅ **Performance**: Sub-millisecond order book operations  
✅ **Market Data**: Best bid/ask, spreads, statistics  

### Phase 3 - Internal Ledger System ✅

✅ **System Initialization**: Asset and trading pair configuration  
✅ **Asset Management**: SOL, ETH, USDC configuration retrieval  
✅ **Trading Pairs**: SOL/USDC and ETH/USDC pair management  
✅ **Balance Operations**: Add, lock, unlock operations  
✅ **Order Creation**: Buy and sell limit orders  
✅ **Order Management**: Order retrieval and status tracking  
✅ **Balance Locking**: Automatic fund locking for orders  
✅ **Internal Transfers**: Instant transfers between users  
✅ **Ledger History**: Complete audit trail of all operations  

## 🤝 Contributing

1. Ensure Bun is installed
2. Run `bun install` to install dependencies
3. Follow the TypeScript and ESLint configurations
4. Test your changes with `bun run test:phase3`
5. Submit PRs with clear descriptions

## 📄 License

MIT License - see LICENSE file for details.
