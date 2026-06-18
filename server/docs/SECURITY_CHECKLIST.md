# Security Checklist — Connect It

## Authentication
- [x] Firebase Google Authentication
- [x] Firebase Email/Password Authentication
- [x] Firebase Phone OTP Authentication
- [x] JWT Access Tokens (15 min expiry)
- [x] JWT Refresh Tokens (7 day expiry, rotation)
- [x] Automatic Token Refresh on 401
- [x] Logout From All Devices
- [x] Device Session Tracking
- [x] Firebase ID Token verification on backend

## Authorization (RBAC)
- [x] User role (default)
- [x] Moderator role
- [x] Admin role
- [x] authenticateUser middleware
- [x] authorizeAdmin middleware
- [x] authorizeModerator middleware
- [x] Hierarchical role enforcement

## End-to-End Encryption
- [x] ECDH P-256 key pair generation per user
- [x] Private key stored in IndexedDB
- [x] AES-256-GCM message encryption
- [x] Public key exchange between users
- [x] Messages encrypted before sending to server
- [x] Messages decrypted locally on receipt
- [x] Server never stores plaintext messages
- [x] Encrypted payload validation on backend

## Socket Security
- [x] JWT verification on socket connect
- [x] User authentication before connection
- [x] Connection rate limiting (20/min/IP)
- [x] Event rate limiting (120/10s)
- [x] Disconnect invalid users
- [x] Per-event payload validation
- [x] Socket identity verification

## API Security
- [x] Helmet security headers (including CSP)
- [x] CORS with origin whitelist
- [x] Rate limiting: Login (5/min), Messages (60/min), API (300/min), Feedback (3/min)
- [x] express-validator for input validation
- [x] xss-clean middleware
- [x] hpp (HTTP parameter pollution protection)
- [x] express-mongo-sanitize (NoSQL injection prevention)
- [x] Mongoose schema validation

## XSS Protection
- [x] DOMPurify on frontend
- [x] xss-clean on backend
- [x] Input validation rejects script/HTML injection
- [x] Message content treated as encrypted (no rendering)

## File Upload Security
- [x] Extension blocklist (.exe, .apk, .js, .bat, .sh, etc.)
- [x] MIME type whitelist (jpeg, png, webp, pdf)
- [x] File size limit (10MB)
- [x] Random UUID filenames
- [x] Malware scan hook (extensible)
- [x] Path traversal protection

## Database Security
- [x] Mongoose schema validation with strict mode
- [x] Query sanitization (sanitizeFilter)
- [x] NoSQL injection prevention
- [x] Database indexes for performance
- [x] At-rest message encryption (AES-256-GCM)
- [x] Sensitive data never stored in plaintext

## Privacy Features
- [x] Block User
- [x] Report User
- [x] Delete Message (for all or self)
- [x] Delete/Clear Chat
- [x] Hide Last Seen
- [x] Hide Online Status
- [x] Hide Read Receipts
- [x] Disappearing Messages (24h, 7d, 90d)

## Device Security
- [x] Session Management
- [x] Active Devices List
- [x] Revoke Device
- [x] Login Notifications (cross-device)
- [x] Device metadata stored (browser, OS, platform)

## Backup Security
- [x] Encrypted backups (client-side AES-256-GCM)
- [x] PBKDF2 key derivation
- [x] Password-protected backup
- [x] Restore process

## Audit Logging
- [x] Login tracking
- [x] Logout tracking
- [x] Token refresh tracking
- [x] Message deletion tracking
- [x] Device registration/revocation
- [x] Failed login attempts
- [x] Account changes
- [x] IP and user agent stored

## Environment Security
- [x] All secrets in .env (gitignored)
- [x] Separate JWT_SECRET and JWT_REFRESH_SECRET
- [x] MESSAGE_ENCRYPTION_KEY separate from JWT keys
- [x] CORS origin whitelist
- [x] Helmet security headers
- [x] X-Powered-By disabled
- [x] Trust proxy enabled

## Network Security
- [x] HTTPS enforced (via Render/Vercel edge)
- [x] HSTS headers (via Helmet)
- [x] CSP configured
- [x] WebSocket with WSS
- [x] CORS restricted to known origins
