# Security Architecture — Connect It

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │  React   │  │ Firebase │  │  Socket  │  │ IndexedDB     │   │
│  │  App     │  │ Auth     │  │  IO      │  │ (E2EE Keys)   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬───────┘   │
│       │              │             │                │           │
└───────┼──────────────┼─────────────┼────────────────┼───────────┘
        │              │             │                │
    HTTPS/           HTTPS/        WSS/             Local
    REST             Firebase      WebSocket        Browser
        │              │             │                │
┌───────┼──────────────┼─────────────┼────────────────┼───────────┐
│       ▼              ▼             ▼                │           │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              REVERSE PROXY / CDN                    │       │
│  │         (Vercel Edge / Render Proxy)                │       │
│  │    TLS Termination · DDoS Protection · WAF          │       │
│  └──────────────────────┬──────────────────────────────┘       │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────┐       │
│  │                 EXPRESS SERVER                      │       │
│  │                                                     │       │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │       │
│  │  │ Helmet/CORS │  │ Rate Limit  │  │ Input      │  │       │
│  │  │ Security    │  │ Layers      │  │ Validation │  │       │
│  │  └─────────────┘  └─────────────┘  └────────────┘  │       │
│  │                                                     │       │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │       │
│  │  │ Auth        │  │ RBAC        │  │ Firesecure │  │       │
│  │  │ Middleware  │  │ Middleware  │  │ Admin SDK  │  │       │
│  │  └─────────────┘  └─────────────┘  └────────────┘  │       │
│  │                                                     │       │
│  │  ┌──────────────────────────────────────────────┐   │       │
│  │  │           SOCKET.IO SERVER                   │   │       │
│  │  │  ┌────────────┐ ┌──────────┐ ┌───────────┐  │   │       │
│  │  │  │ JWT Auth   │ │ Rate     │ │ Event     │  │   │       │
│  │  │  │ Middleware │ │ Limiting │ │ Validation│  │   │       │
│  │  │  └────────────┘ └──────────┘ └───────────┘  │   │       │
│  │  └──────────────────────────────────────────────┘   │       │
│  │                                                     │       │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │       │
│  │  │ File       │  │ Audit      │  │ Encrypted    │   │       │
│  │  │ Upload     │  │ Logger     │  │ Backup       │   │       │
│  │  │ Security   │  │ Service    │  │ Handler      │   │       │
│  │  └────────────┘  └────────────┘  └──────────────┘   │       │
│  │                                                     │       │
│  └──────────────────────┬──────────────────────────────┘       │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────┐       │
│  │              MONGODB ATLAS                           │       │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │       │
│  │  │ Users    │ │ Messages │ │ Devices  │ │ Audit  │  │       │
│  │  │ (role,   │ │ (E2EE    │ │ (sess.   │ │ Logs   │  │       │
│  │  │ keys,    │ │  only)   │ │  mgt)    │ │        │  │       │
│  │  │ privacy) │ │          │ │          │ │        │  │       │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │       │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │       │
│  │  │ Backups  │ │ Files    │ │ RefreshTokens        │  │       │
│  │  │ (E2EE)   │ │ (secure) │ │ (revocable, rotated) │  │       │
│  │  └──────────┘ └──────────┘ └──────────────────────┘  │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Message Sending (E2EE)

```
Sender                           Server                        Receiver
   │                                │                             │
   │  1. Get recipient's            │                             │
   │     public key from API        │                             │
   │  ────────────────────────────► │                             │
   │  ◄──────────────────────────── │                             │
   │                                │                             │
   │  2. Generate ECDH shared       │                             │
   │     secret using own private   │                             │
   │     key + recipient's public   │                             │
   │     key                        │                             │
   │                                │                             │
   │  3. Derive AES-256-GCM key     │                             │
   │                                │                             │
   │  4. Encrypt message with       │                             │
   │     AES-256-GCM + random IV    │                             │
   │                                │                             │
   │  5. Send encrypted payload     │                             │
   │     via socket.send-message ──►│                             │
   │                                │  6. Store encrypted         │
   │                                │     payload in MongoDB      │
   │                                │     (never decrypted)       │
   │                                │                             │
   │                                │  7. Forward to receiver ──► │
   │                                │     via socket              │
   │                                │                             │
   │                                │                             │  8. Receive encrypted
   │                                │                               payload
   │                                │                             │
   │                                │                             │  9. Generate same
   │                                │                               ECDH shared secret
   │                                │                             │
   │                                │                             │ 10. Derive same
   │                                │                               AES-256-GCM key
   │                                │                             │
   │                                │                             │ 11. Decrypt locally
   │                                │                             │     with IV
```

### Authentication Flow

```
Browser                        Firebase                       Server
   │                               │                             │
   │  1. Sign in (Google/Email/    │                             │
   │     Phone) ──────────────────►│                             │
   │  ◄────────────────────────────                             │
   │     Firebase ID Token         │                             │
   │                               │                             │
   │  2. POST /api/auth/session    │                             │
   │     (Bearer: Firebase Token) ──────────────────────────────►│
   │                               │                             │
   │                               │  3. Verify ID token via     │
   │                               │     Firebase Admin SDK      │
   │                               │                             │
   │                               │  4. Generate JWT (15 min)   │
   │                               │     + Refresh Token (7 day) │
   │                               │                             │
   │  ◄───────────────────────────────────────────────────────── │
   │     { accessToken, refreshToken }                           │
   │                               │                             │
   │  5. Store refreshToken in     │                             │
   │     sessionStorage            │                             │
   │                               │                             │
   │  6. Connect Socket.IO         │                             │
   │     with auth.token ───────────────────────────────────────►│
   │                               │                             │
   │                               │  7. Verify JWT, register    │
   │                               │     device, audit log       │
   │                               │                             │
   │  ◄───────────────────────────────────────────────────────── │
   │     Connected + deviceId                                     │
```

## Security Layers

```
Layer 1: Network Edge
├── TLS/HTTPS (Vercel/Render CDN)
├── DDoS Protection (Cloudflare/Vercel)
└── CORS Origin Validation

Layer 2: HTTP Security
├── Helmet Headers (CSP, HSTS, X-Frame-Options, etc.)
├── Rate Limiting (IP-based, multi-tier)
├── Body Size Limiting (12MB)
└── X-Powered-By Disabled

Layer 3: Input Validation
├── express-validator (schema validation)
├── xss-clean (XSS vector stripping)
├── express-mongo-sanitize (NoSQL injection)
├── hpp (parameter pollution)
└── DOMPurify (frontend XSS)

Layer 4: Authentication
├── Firebase ID Token Verification
├── JWT Access Tokens (15 min)
├── JWT Refresh Tokens (7 day, rotation)
└── Device Session Tracking

Layer 5: Authorization
├── RBAC (User/Moderator/Admin)
├── Self-access enforcement (requireSelf)
└── Socket Event Identity Verification

Layer 6: Encryption
├── E2EE (ECDH P-256 + AES-256-GCM)
├── At-Rest Encryption (AES-256-GCM)
├── Backup Encryption (PBKDF2 + AES-256-GCM)
└── TLS for All Transmissions

Layer 7: Audit & Monitoring
├── Comprehensive Audit Logging
├── Login/Logout Tracking
├── Device Change Tracking
└── Message Deletion Tracking
```

## Key Management

```
┌─────────────────────────────────────────┐
│            KEY HIERARCHY                │
├─────────────────────────────────────────┤
│                                         │
│  JWT_SECRET                             │
│  ├── Signs access tokens (15 min)       │
│  └── Stored in server .env              │
│                                         │
│  JWT_REFRESH_SECRET                     │
│  ├── (Reserved for future HMAC)         │
│  └── Stored in server .env              │
│                                         │
│  MESSAGE_ENCRYPTION_KEY                 │
│  ├── At-rest encryption of messages     │
│  └── Stored in server .env              │
│                                         │
│  ECDH P-256 Key Pair (Per User)         │
│  ├── Private Key → IndexedDB            │
│  ├── Public Key → MongoDB (User.public) │
│  └── Derives AES-256-GCM session key    │
│                                         │
│  AES-256-GCM Key (Per Message)          │
│  ├── Derived via ECDH key agreement     │
│  ├── Used once then discarded           │
│  └── Never persisted                    │
│                                         │
│  PBKDF2 Derived Key (Per Backup)        │
│  ├── Salt + User Password → AES-256 key │
│  └── Stored in EncryptedBackup model    │
│                                         │
└─────────────────────────────────────────┘
```
