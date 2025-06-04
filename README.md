# 🚀 Crypto Exchange Backend - Phase 2

A high-performance centralized crypto spot exchange backend built with **Bun** and **Elysia.js**, inspired by Backpack.exchange.

## 🎯 Phase 2 Features

### ✅ Phase 1 - Authentication & Core
- **User Authentication** - Registration, login with JWT tokens
- **2FA Security** - TOTP-based two-factor authentication
- **Session Management** - Refresh tokens with secure session handling
- **Database Integration** - PostgreSQL with Prisma ORM
- **Type Safety** - Full TypeScript implementation with Zod validation

### 🆕 Phase 2 - Wallet System (Crypto Custody)
- **Multi-Chain Support** - Solana and Ethereum wallet generation
- **Deposit Addresses** - Unique addresses per user per chain
- **HD Wallet Generation** - Deterministic wallet creation with BIP39
- **Balance Management** - Internal balance tracking system
- **Transaction History** - Comprehensive transaction logging
- **Live Balance Checking** - Real-time blockchain balance verification
- **Secure Key Storage** - Encrypted private key management

## 🛠️ Tech Stack

- **Runtime**: Bun (JavaScript/TypeScript)
- **Framework**: Elysia.js (lightweight Bun-native framework)
- **Database**: PostgreSQL with Prisma ORM
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

## 📖 API Usage Examples

### Phase 1 - Authentication

```bash
# Register
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepassword123"}'

# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepassword123"}'
```

### Phase 2 - Wallet System

```bash
# Generate Solana deposit address
curl -X POST http://localhost:3001/wallet/deposit/address \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"chain": "solana"}'

# Generate Ethereum deposit address
curl -X POST http://localhost:3001/wallet/deposit/address \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"chain": "ethereum"}'

# Get all deposit addresses
curl -X GET http://localhost:3001/wallet/deposit/addresses \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Get user balances
curl -X GET http://localhost:3001/wallet/balances \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Get transaction history
curl -X GET http://localhost:3001/wallet/transactions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Get live balance for specific address
curl -X GET http://localhost:3001/wallet/balance/live/solana/ADDRESS \
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

## 🌐 Supported Blockchains

### Solana
- **Network**: Devnet (configurable)
- **RPC**: Public devnet endpoint (configurable)
- **Assets**: SOL, USDC
- **Wallet Generation**: ED25519 keypairs with BIP44 derivation

### Ethereum
- **Network**: Sepolia testnet (configurable)
- **RPC**: Public Sepolia endpoint (configurable) 
- **Assets**: ETH
- **Wallet Generation**: secp256k1 with BIP44 derivation

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
│   └── wallet.routes.ts    # Wallet routes (Phase 2)
├── services/
│   ├── auth.service.ts     # Authentication business logic
│   └── wallet.service.ts   # Wallet business logic (Phase 2)
├── types/
│   ├── auth.ts            # Authentication types
│   └── wallet.ts          # Wallet types (Phase 2)
├── utils/
│   └── jwt.ts             # JWT utilities
└── index.ts               # Application entry point

prisma/
└── schema.prisma          # Database schema

tests/
├── test.js                # Phase 1 tests
└── test-phase2.js         # Phase 2 tests
```

## 🚧 Completed Phases

- ✅ **Phase 1**: Project Bootstrap (Auth + Core)
- ✅ **Phase 2**: Wallet System (Crypto Custody)

## 🛣️ Next Phases

- **Phase 3**: Internal Ledger System
- **Phase 4**: Matching Engine + Orderbook (Redis)
- **Phase 5**: Trading APIs + WebSocket
- **Phase 6**: Trading UI (Next.js)
- **Phase 7**: Admin + Security
- **Phase 8**: Deployment & Monitoring

## 🚀 Performance & Architecture

- **Bun Runtime**: ~3x faster than Node.js
- **Elysia.js**: Lightweight, Bun-optimized framework
- **Database**: PostgreSQL for reliability + Redis ready for Phase 4
- **Type Safety**: Full TypeScript implementation
- **Modular Design**: Clean separation of concerns
- **Blockchain Integration**: Direct RPC connections for real-time data
- **HD Wallets**: Deterministic address generation for scalability

## 🤝 Contributing

1. Ensure Bun is installed
2. Run `bun install` to install dependencies
3. Follow the TypeScript and ESLint configurations
4. Test your changes with `bun run test` and `bun run test:phase2`
5. Submit PRs with clear descriptions

## 📄 License

MIT License - see LICENSE file for details. 