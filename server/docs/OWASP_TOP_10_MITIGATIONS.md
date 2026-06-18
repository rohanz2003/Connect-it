# OWASP Top 10 (2021) Mitigation — Connect It

## A01: Broken Access Control
**Risk:** Users accessing unauthorized resources or performing unauthorized actions.  
**Mitigations:**
- Role-based access control (RBAC) with `authorize()` middleware
- `requireAuth` on all authenticated routes
- `requireSelf` enforcement where applicable (e.g., profile access)
- Device ownership verification
- Block/Report authorization checks
- Message ownership verified via sender email matching
- Server validates socket event sender identity matches authenticated user

## A02: Cryptographic Failures
**Risk:** Exposure of sensitive data due to weak or missing encryption.  
**Mitigations:**
- End-to-end encryption using ECDH P-256 key agreement + AES-256-GCM
- Messages encrypted client-side before transmission
- Server stores only encrypted ciphertext (never plaintext)
- At-rest encryption via AES-256-GCM with dedicated key
- Backup encryption using PBKDF2-derived AES-256-GCM keys
- TLS/HTTPS enforced at edge (Render/Vercel)
- JWTs signed with HS256
- Refresh tokens generated via cryptographically secure random bytes

## A03: Injection
**Risk:** SQL/NoSQL injection, command injection, script injection.  
**Mitigations:**
- `express-mongo-sanitize` to strip `$` and `.` operators from input
- `mongoose.set("sanitizeFilter", true)` for query sanitization
- `xss-clean` middleware to strip XSS vectors
- DOMPurify on frontend to sanitize all user content
- `express-validator` with custom validators rejecting script/HTML patterns
- All user input treated as untrusted and validated
- File upload MIME validation (no content-type trust)

## A04: Insecure Design
**Risk:** Architecture-level security flaws.  
**Mitigations:**
- Rate limiting at multiple layers (API, socket, login, messages, feedback)
- JWT with short expiry (15 min) and refresh token rotation
- Session management with device tracking and revocation
- Disappearing messages with server-side TTL enforcement
- Encrypted payload validation schema on backend
- Audit logging for all security events
- Error boundaries on frontend

## A05: Security Misconfiguration
**Risk:** Default configurations, unnecessary features, misconfigured headers.  
**Mitigations:**
- Helmet.js security headers (CSP, HSTS, X-Frame-Options, etc.)
- CORS whitelist (only known origins allowed)
- `X-Powered-By` disabled
- Express trust proxy configured
- No debug endpoints in production
- Environment validation on startup
- Empty admin dashboard files removed from production concern
- Secure defaults for all configuration

## A06: Vulnerable and Outdated Components
**Risk:** Using components with known vulnerabilities.  
**Mitigations:**
- Regular `npm audit` recommended in CI/CD
- Dependencies pinned to specific versions
- Firebase SDK updated to v12
- Socket.IO updated to v4
- Express updated to v5
- React updated to v19
- All packages within recent major versions

## A07: Identification and Authentication Failures
**Risk:** Weak authentication, session management flaws.  
**Mitigations:**
- Firebase Authentication (Google + Email/Password + Phone OTP)
- JWT access tokens with 15-minute expiry
- Refresh tokens with 7-day expiry and automatic rotation
- Firebase ID token verification on every backend request
- Rate limiting on login (5 requests/minute)
- Email verification required for email/password auth
- Device-based session tracking
- Logout from all devices capability
- Session invalidation on token refresh

## A08: Software and Data Integrity Failures
**Risk:** Tampered updates, malicious data.  
**Mitigations:**
- End-to-end encryption ensures message integrity
- Encrypted payload validation (version, algorithm, required fields)
- SHA-256 file hashing for uploaded files
- Malware scan hook for uploaded files
- `.env` files never committed to version control
- CSP prevents unauthorized script loading
- Service worker scope restricted

## A09: Security Logging and Monitoring Failures  
**Risk:** Insufficient logging, inability to detect breaches.  
**Mitigations:**
- Comprehensive AuditLog model tracking all security events:
  - Login/logout events
  - Token refresh events
  - Device registration/revocation
  - Message deletion
  - Failed login attempts
  - Account changes
  - Block/report actions
- Audit logs include actor, action, target, IP, user agent, timestamp
- IP and user agent stored for forensic analysis

## A10: Server-Side Request Forgery (SSRF)
**Risk:** Server making requests to internal resources.  
**Mitigations:**
- No user-supplied URLs fetched by server
- File uploads stored in memory, not streamed to external services
- Push notifications use pre-configured VAPID keys (no user input in URLs)
- Email sending via configured SMTP (no user-controlled endpoints)
- CORS validation prevents malicious origins from making cross-origin requests
- No open redirect functionality
