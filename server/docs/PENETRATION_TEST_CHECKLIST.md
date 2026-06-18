# Penetration Test Checklist — Connect It

## 1. Information Gathering
- [ ] Identify all endpoints (API routes, WebSocket events)
- [ ] Map authentication flow (Firebase + JWT)
- [ ] Identify file upload endpoints
- [ ] Check CORS configuration
- [ ] Review response headers for information disclosure

## 2. Authentication Testing
- [ ] Test Firebase ID token replay
- [ ] Test JWT token forgery with modified payload
- [ ] Test expired JWT acceptance
- [ ] Test refresh token replay
- [ ] Test refresh token reuse after rotation
- [ ] Test logout does not invalidate session
- [ ] Test concurrent session limits
- [ ] Test brute force on login (rate limiting)
- [ ] Test Firebase phone OTP brute force
- [ ] Test OTP interception via reCAPTCHA bypass

## 3. Authorization Testing
- [ ] Test user accessing admin endpoints
- [ ] Test user accessing moderator endpoints
- [ ] Test privilege escalation via role manipulation
- [ ] Test accessing other users' messages
- [ ] Test accessing other users' devices
- [ ] Test accessing other users' backups

## 4. End-to-End Encryption Testing
- [ ] Verify message payload is encrypted
- [ ] Verify server cannot decrypt messages
- [ ] Test key exchange manipulation
- [ ] Test replay of old encrypted messages
- [ ] Test downgrade attack (change algorithm version)
- [ ] Test public key substitution
- [ ] Verify private key stored securely (IndexedDB)
- [ ] Test XSS in IndexedDB

## 5. Socket Security Testing
- [ ] Test connection without JWT
- [ ] Test connection with expired JWT
- [ ] Test socket event injection
- [ ] Test socket identity mismatch
- [ ] Test socket event rate limit bypass
- [ ] Test socket connection rate limit bypass
- [ ] Test socket hijacking via token theft
- [ ] Test emit to unauthorized rooms

## 6. API Security Testing
- [ ] Test HTTP methods override
- [ ] Test parameter pollution (hpp bypass)
- [ ] Test header injection
- [ ] Test rate limit bypass (IP spoofing, header manipulation)
- [ ] Test CORS misconfiguration
- [ ] Test HSTS bypass (MITM)
- [ ] Test CSP bypass (inline script injection)

## 7. Input Validation Testing
- [ ] Test XSS in display name
- [ ] Test XSS in bio
- [ ] Test XSS in messages (encrypted, so payload only)
- [ ] Test NoSQL injection in email fields
- [ ] Test NoSQL injection in query parameters
- [ ] Test MongoDB operator injection ($gt, $ne, etc.)
- [ ] Test IDOR in message ID parameters
- [ ] Test path traversal in file upload

## 8. File Upload Testing
- [ ] Test double extension bypass (file.php.jpg)
- [ ] Test MIME type spoofing
- [ ] Test null byte injection
- [ ] Test large file upload (>10MB)
- [ ] Test upload of executable content
- [ ] Test directory traversal in filename
- [ ] Test malware upload (EICAR test file)
- [ ] Test zip bombs / decompression bombs

## 9. Session Management Testing
- [ ] Test session fixation
- [ ] Test concurrent session handling
- [ ] Test device revocation effectiveness
- [ ] Test session timeout enforcement
- [ ] Test cookie security attributes

## 10. Privacy Feature Testing
- [ ] Test block bypass (different account)
- [ ] Test message deletion bypass
- [ ] Test disappearing message timer manipulation
- [ ] Test hide last seen bypass
- [ ] Test hide online status bypass
- [ ] Test read receipt bypass

## 11. Audit Log Testing
- [ ] Test log injection via input fields
- [ ] Test sensitive data leakage in logs (PII, tokens)
- [ ] Test log tampering
- [ ] Verify all security events are logged

## 12. Backup Security Testing
- [ ] Test backup decryption without password
- [ ] Test backup data leakage
- [ ] Test backup restore authorization
- [ ] Test backup tampering

## 13. Environment Testing
- [ ] Check for hardcoded secrets
- [ ] Check .env exposure via misconfiguration
- [ ] Check debug endpoints in production
- [ ] Check stack trace exposure
- [ ] Check Firebase config leakage

## 14. Dependency Testing
- [ ] Run npm audit for vulnerable dependencies
- [ ] Check for outdated packages
- [ ] Check for known CVEs in dependencies
- [ ] Verify no malicious packages
