# Threat Model — Connect It

## Asset Inventory

| Asset | Sensitivity | Location |
|---|---|---|
| User messages | High | Client memory, MongoDB (encrypted) |
| User credentials | Critical | Firebase Auth |
| E2EE private keys | Critical | Client IndexedDB |
| JWT access tokens | High | Client memory, HTTP headers |
| Refresh tokens | High | Client sessionStorage, MongoDB |
| User profiles | Medium | MongoDB |
| Device sessions | Medium | MongoDB |
| Audit logs | Medium | MongoDB |
| Backups (encrypted) | Medium | MongoDB |

## Trust Boundaries

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Client Browser  │────►│  Network (TLS)   │────►│  Express Server  │
│  (Untrusted)     │◄────│  (Protected)     │◄────│  (Trusted)       │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                            │
                                                            ▼
                                                  ┌──────────────────┐
                                                  │  MongoDB Atlas   │
                                                  │  (Trusted)       │
                                                  └──────────────────┘
```

## Threat Scenarios (STRIDE)

### Spoofing

| Threat | Impact | Mitigation |
|---|---|---|
| Attacker forges JWT | Critical | JWT_SECRET kept secret, 64-char random hex |
| Attacker replays Firebase token | High | Firebase Admin SDK verifies token + checks `auth_time` |
| Attacker uses stolen refresh token | High | Rotation invalidates old token after use |
| Attacker connects to socket as another user | Critical | Socket identity verification: JWT email vs claimed email |
| Attacker registers with fake email | Medium | Email verification required for email/password auth |

### Tampering

| Threat | Impact | Mitigation |
|---|---|---|
| Attacker modifies encrypted message | Low | AES-GCM authentication tag detects tampering |
| Attacker modifies message in transit | Low | TLS + AES-GCM integrity |
| Attacker modifies E2EE public key | High | Public keys stored in MongoDB, only owner can update |
| Attacker modifies backup data | Low | PBKDF2-derived key + AES-GCM integrity |
| Attacker modifies audit logs | Medium | Only server can write audit logs (not client-facing) |
| Attacker tampers with socket event payload | Medium | Per-event payload schema validation |

### Repudiation

| Threat | Impact | Mitigation |
|---|---|---|
| User denies sending message | Medium | Audit logs track all message events |
| User denies logging in | Medium | All logins recorded in AuditLog with IP + user agent |
| Admin denies performing action | High | Admin actions logged with timestamp and metadata |
| User denies account deletion | Medium | Account deletion logged before execution |

### Information Disclosure

| Threat | Impact | Mitigation |
|---|---|---|
| Server breach exposes messages | Low | Messages stored as E2EE ciphertext (AES-256-GCM) |
| Database breach exposes user data | Low | Passwords never stored (Firebase managed), E2EE keys not in DB |
| Attacker intercepts plaintext message | None | All messages encrypted end-to-end before transmission |
| Attacker accesses IndexedDB private keys | High | IndexedDB isolated per origin; XSS prevention in place |
| Error messages reveal sensitive info | Medium | Generic error messages returned to client |
| CSP bypass allows data exfiltration | Medium | CSP configured with strict directives |

### Denial of Service

| Threat | Impact | Mitigation |
|---|---|---|
| Rate limit bypass | Medium | Multi-layer rate limiting (IP, endpoint, socket events) |
| Socket connection flood | Medium | Connection rate limit (20/min/IP) |
| Large message upload | Medium | Body size limit (12MB), message rate limit (60/min) |
| Large file upload | Medium | File size limit (10MB) |
| Account creation flood | Medium | Firebase limits + login rate limiter |

### Elevation of Privilege

| Threat | Impact | Mitigation |
|---|---|---|
| User accesses admin API | Critical | RBAC middleware checks role hierarchy |
| User promotes self to admin | Critical | Role assignment controlled server-side |
| User accesses other user's messages | Critical | requireSelf + sender email validation in socket events |
| User accesses other user's devices | High | Device queries filtered by userId (not client-supplied) |
| User deletes other user's messages | High | Message deletion validates sender email matches authenticated user |

## Attack Trees

### Message Interception Attack Tree
```
Read another user's messages
├── 1. Access server database
│   ├── 1.1 SQL/NoSQL injection [MITIGATED: mongo-sanitize]
│   ├── 1.2 Direct DB access (credentials leak) [MITIGATED: env protection]
│   └── 1.3 Server compromise [PARTIAL: encrypted storage]
│       └── Messages still E2EE encrypted (AES-256-GCM)
├── 2. Man-in-the-middle on network
│   ├── 2.1 TLS interception [MITIGATED: HSTS, certificate pinning]
│   └── 2.2 WebSocket hijacking [MITIGATED: JWT auth on socket]
├── 3. Access recipient's private key
│   ├── 3.1 XSS to steal IndexedDB keys [MITIGATED: DOMPurify, CSP]
│   └── 3.2 Physical access to device [OUT OF SCOPE]
└── 4. Social engineering
    └── Account takeover [MITIGATED: Firebase security]
```

### Account Takeover Attack Tree
```
Takeover user account
├── 1. Steal Firebase credentials
│   ├── 1.1 Phishing [MITIGATED: email verification]
│   └── 1.2 Credential stuffing [MITIGATED: rate limiting, Firebase protection]
├── 2. Steal JWT/refresh tokens
│   ├── 2.1 XSS [MITIGATED: DOMPurify, CSP, no token in URL]
│   └── 2.2 localStorage/sessionStorage access [MITIGATED: XSS prevention]
├── 3. Session hijacking
│   ├── 3.1 Steal socket token [MITIGATED: short-lived JWT]
│   └── 3.2 Session fixation [MITIGATED: new tokens on each auth]
└── 4. Firebase admin takeover
    └── Firebase project compromise [OUT OF SCOPE]
```

## Risk Assessment Matrix

| Threat | Likelihood | Impact | Risk Level |
|---|---|---|---|
| Brute force login | Medium | High | HIGH |
| XSS via message content | Low | Critical | HIGH |
| JWT token theft | Low | Critical | HIGH |
| Database breach | Low | High | MEDIUM |
| Rate limit bypass | Low | Medium | LOW |
| Disappearing message persistence | Low | Medium | LOW |
| Socket hijacking | Low | High | MEDIUM |
| File upload malware | Low | High | MEDIUM |

## Security Controls Mapping

| Control | Type | STRIDE Mitigation |
|---|---|---|
| Firebase Authentication | Preventive | Spoofing, Tampering |
| JWT with short expiry | Preventive | Spoofing, Repudiation |
| Refresh token rotation | Preventive | Spoofing |
| RBAC middleware | Preventive | Elevation of Privilege |
| E2EE (ECDH + AES-256-GCM) | Preventive | Information Disclosure, Tampering |
| At-rest encryption | Preventive | Information Disclosure |
| Rate limiting | Detective | Denial of Service |
| Input validation | Preventive | Tampering, Information Disclosure |
| XSS prevention (DOMPurify + CSP) | Preventive | Information Disclosure |
| NoSQL injection prevention | Preventive | Information Disclosure, Tampering |
| File upload validation | Preventive | Tampering, Elevation of Privilege |
| Device session tracking | Detective | Spoofing, Repudiation |
| Audit logging | Detective | Repudiation |
| CSP headers | Preventive | Information Disclosure |
| CORS whitelist | Preventive | Information Disclosure |
| Helmet security headers | Preventive | Information Disclosure, Spoofing |
