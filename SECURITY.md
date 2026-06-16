# Security Architecture Documentation

## Overview
This document describes the security architecture of the chat application, following enterprise-grade practices similar to WhatsApp and Signal.

## Security Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (React)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ Firebase │  │ E2EE     │  │ DOMPurify XSS        │  │
│  │ Auth     │  │ (Web     │  │ Sanitization         │  │
│  │ (Google/ │  │  Crypto) │  │                      │  │
│  │  Phone)  │  │          │  │                      │  │
│  └────┬─────┘  └────┬─────┘  └──────────────────────┘  │
│       │              │                                   │
│       ▼              ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │          Socket.IO (WSS) + JWT Token              │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    SERVER (Node.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Helmet       │  │ Rate         │  │ express-     │  │
│  │ Security     │  │ Limiting     │  │ validator    │  │
│  │ Headers      │  │ (per IP)     │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ JWT Auth     │  │ RBAC         │  │ Input        │  │
│  │ Middleware    │  │ (User/Mod/   │  │ Sanitization │  │
│  │              │  │  Admin)      │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Audit        │  │ File Upload  │  │ Socket Auth  │  │
│  │ Logging      │  │ Security     │  │ Middleware   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                 MONGODB ATLAS                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Encrypted    │  │ Mongoose     │  │ Indexes for  │  │
│  │ at Rest      │  │ Validation   │  │ Performance  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
User A                    Server                    User B
  │                         │                         │
  │  1. Firebase Auth       │                         │
  │────────────────────────►│                         │
  │  2. JWT Token          │                         │
  │◄────────────────────────│                         │
  │                         │                         │
  │  3. Get User B Pub Key │                         │
  │────────────────────────►│                         │
  │◄────────────────────────│                         │
  │                         │                         │
  │  4. Derive Shared Key  │                         │
  │  (ECDH)                │                         │
  │                         │                         │
  │  5. Encrypt Message    │                         │
  │  (AES-256-GCM)         │                         │
  │                         │                         │
  │  6. Send Encrypted     │                         │
  │────────────────────────►│────────────────────────►│
  │                         │                         │
  │                         │  7. Decrypt Message    │
  │                         │  (AES-256-GCM)         │
  │                         │                         │
```

## Threat Model

### Assets
- User messages (plaintext never stored on server)
- User credentials (Firebase ID tokens)
- User profile data (email, display name, avatar)
- E2EE public keys (stored on server, public)
- E2EE private keys (stored ONLY on client device)

### Trust Boundaries
1. **Client ↔ Server**: Server is NOT trusted with message content
2. **Client ↔ Firebase**: Firebase is trusted for authentication only
3. **Server ↔ Database**: MongoDB Atlas with encryption at rest

### Threats & Mitigations

| Threat | Mitigation | Severity |
|--------|-----------|----------|
| Message interception | E2EE with AES-256-GCM | Critical |
| Unauthorized access | Firebase Auth + JWT | Critical |
| Token theft | Short-lived JWT (15 min) + refresh tokens | High |
| XSS attacks | DOMPurify + server-side validation | High |
| SQL/NoSQL injection | Mongoose validation + sanitization | High |
| CSRF | SameSite cookies + token-based auth | High |
| Rate limiting abuse | express-rate-limit | Medium |
| File upload malware | MIME validation + type whitelist | Medium |
| Brute force login | Account lockout + rate limiting | High |
| Session hijacking | Socket auth middleware + device tracking | High |
| Privilege escalation | RBAC middleware | Critical |

## OWASP Top 10 Compliance

### A1: Broken Access Control ✅
- JWT authentication on all API routes
- RBAC (User/Moderator/Admin) with role hierarchy
- Socket.IO authentication middleware

### A2: Cryptographic Failures ✅
- E2EE with AES-256-GCM (message content)
- ECDH P-256 for key exchange
- HTTPS/WSS enforced in production
- Plaintext messages NEVER stored on server

### A3: Injection ✅
- DOMPurify on client-side render
- express-validator on all API inputs
- Mongoose schema validation
- HPP (HTTP Parameter Pollution) protection

### A4: Insecure Design ✅
- Rate limiting on all endpoints
- Audit logging for sensitive actions
- Device session tracking
- Account lockout on failed attempts

### A5: Security Misconfiguration ✅
- Helmet security headers
- CORS with whitelisted origins
- Secure environment variables (.env)
- Production-ready CSP headers

### A6: Vulnerable Components ⚠️
- Regular npm audit recommended
- Dependencies pinned in package.json
- Keep Firebase SDK updated

### A7: Auth Failures ✅
- Firebase Google + Phone OTP
- JWT access tokens (15 min expiry)
- Refresh token rotation
- Logout from all devices

### A8: Data Integrity Failures ✅
- E2EE ensures message integrity
- AES-256-GCM provides authentication
- Audit logging for data changes

### A9: Logging & Monitoring ✅
- Comprehensive audit logging
- Track: login, logout, message deletion, device changes
- Severity levels (info/warning/error/critical)
- 90-day log retention with TTL index

### A10: SSRF ✅
- URL validation via validateRequest middleware
- No server-side URL fetching from user input

## Security Checklist

### Authentication
- [x] Firebase Google Authentication
- [x] Firebase Phone OTP Authentication
- [x] JWT Access Tokens (15 min expiry)
- [x] Refresh Tokens (7 day expiry)
- [x] Automatic Token Refresh
- [x] Logout From All Devices
- [x] Device Session Tracking
- [x] Account Lockout After Failed Attempts

### Authorization
- [x] RBAC (User/Moderator/Admin)
- [x] authenticateUser middleware
- [x] authorizeRole middleware
- [x] API route protection

### End-to-End Encryption
- [x] ECDH P-256 key generation
- [x] AES-256-GCM message encryption
- [x] Public key exchange
- [x] Shared key derivation
- [x] Local private key storage (never sent to server)
- [x] Secure key export/import

### API Security
- [x] Helmet security headers
- [x] CORS with whitelisted origins
- [x] Content Security Policy
- [x] Rate limiting (global + per-endpoint)
- [x] Input validation (express-validator)
- [x] HPP protection
- [x] Body size limits

### XSS Protection
- [x] DOMPurify client-side sanitization
- [x] Server-side input validation
- [x] CSP headers
- [x] Output encoding

### File Upload Security
- [x] MIME type validation
- [x] File extension whitelist
- [x] File size limits
- [x] Blocked extension list
- [x] MIME-extension cross-validation
- [x] Secure random filenames
- [x] Malware scan hook

### Database Security
- [x] Mongoose schema validation
- [x] Data sanitization
- [x] Compound indexes
- [x] TTL indexes for auto-cleanup
- [x] Sensitive field stripping (toSafeObject)

### Privacy
- [x] Block User
- [x] Report User
- [x] Hide Last Seen
- [x] Hide Online Status
- [x] Hide Read Receipts
- [x] Disappearing Messages (24h/7d/90d)
- [x] Privacy settings model

### Device Security
- [x] Session Management
- [x] Active Devices List
- [x] Revoke Device
- [x] Revoke All Devices

### Audit Logging
- [x] Login events
- [x] Logout events
- [x] Message deletion
- [x] Device changes
- [x] Failed login attempts
- [x] Account changes
- [x] 90-day retention
- [x] Severity levels

## Penetration Test Checklist

### 1. Information Gathering
- [ ] Check security headers (helmet)
- [ ] Identify exposed endpoints
- [ ] Check CORS configuration

### 2. Authentication Testing
- [ ] Test token expiration
- [ ] Test invalid token rejection
- [ ] Test refresh token rotation
- [ ] Test logout from all devices
- [ ] Test account lockout

### 3. Authorization Testing
- [ ] Test role escalation
- [ ] Test unauthenticated access
- [ ] Test direct object references

### 4. Session Testing
- [ ] Test session fixation
- [ ] Test concurrent sessions
- [ ] Test device revocation

### 5. Input Validation
- [ ] Test XSS vectors
- [ ] Test SQL/NoSQL injection
- [ ] Test parameter pollution
- [ ] Test file upload bypass

### 6. Cryptography Testing
- [ ] Verify E2EE implementation
- [ ] Test key exchange security
- [ ] Verify encrypted storage

### 7. Business Logic
- [ ] Test rate limiting
- [ ] Test block/report functionality
- [ ] Test disappearing messages

## Deployment Security Guide

### Vercel (Frontend)
```
1. Set environment variables in Vercel dashboard
2. Enable HTTPS (automatic)
3. Configure custom domain with SSL
4. Set CSP headers in vercel.json
```

### Render (Backend)
```
1. Set environment variables in Render dashboard
2. Enable HTTPS
3. Configure firewall rules
4. Set up auto-deploy from protected branch
```

### MongoDB Atlas
```
1. Enable IP whitelist (Render IP + dev IPs)
2. Enable encryption at rest
3. Enable audit logging
4. Use strong database user passwords
5. Enable two-factor authentication
```
