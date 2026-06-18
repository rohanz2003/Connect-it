# Security Architecture Blueprint, Data Flow, and Threat Model Documentation

This document specifies the technical design, cryptographic operations, role access topologies, threat mitigations, and implementation mappings for the enterprise secure messaging platform transformation.

---

## 1. Security Architecture Diagram

```
                 [ CLIENT LAYER / BROWSER RUNTIME ]
   +-------------------------------------------------------------+
   |  React SPA Context Stateful Engine                          |
   |                                                             |
   |  +---------------------------+  +------------------------+  |
   |  | Web Crypto Cryptography   |  | DOMPurify XSS Filter   |  |
   |  | (ECDH P-256 / AES-256GCM) |  | (Input Sanitization)   |  |
   |  +-------------+-------------+  +-----------+------------+  |
   +----------------|----------------------------|---------------+
                    | (E2EE Payload)             | (REST JSON)
                    v                            v
   +-------------------------------------------------------------+
   |  SOCKET.IO TRANSPORT LINE       |  RESTFUL API SERVICES     |
   |  (Handshake Authorization Guard)|  (Helmet, Rate-Limiters)  |
   +----------------|----------------------------|---------------+
                    |                            |
                    +------------+---------------+
                                 |
                                 v
                 [ SERVER LAYER / EXPRESS APPLICATION ]
   +-------------------------------------------------------------+
   |  Middlware Interception Pipelines                           |
   |                                                             |
   |  +------------------------+      +-----------------------+  |
   |  | Firebase Token Admin   | ---> | Short-Lived JWT Access|  |
   |  | (Identity Attestation) |      | (HttpOnly Refresh)    |  |
   |  +------------------------+      +-----------+-----------+  |
   |                                              |              |
   |  +------------------------+      +-----------v-----------+  |
   |  | File Upload MIME Scan  | <--- | Role-Based RBAC Check |  |
   |  | (Size/Ext Whitelisting)  |      | (User/Mod/Admin Clear)|  |
   |  +------------------------+      +-----------+-----------+  |
   +----------------------------------------------|--------------+
                                                  v
                 [ DATABASE DATA ACCUMULATION LAYER ]
   +-------------------------------------------------------------+
   |  MongoDB Atlas Hardened Schemas                             |
   |                                                             |
   |  +------------------------+      +-----------------------+  |
   |  | Disappearing Message   |      | Comprehensive Audit   |  |
   |  | (Dynamic TTL Indices)  |      | (Immutable Logs Trail)|  |
   |  +------------------------+      +-----------------------+  |
   +-------------------------------------------------------------+
```

---

## 2. Cryptographic Data Flow Diagram (E2EE)

The sequence below charts how Plaintext parameters remain confined to browser memory buffers, while only Ciphertext hashes travel over transport links and persist within database storage arrays.

```
 Sender Node (Alice)                                    Receiver Node (Bob)
+-----------------------+                              +-----------------------+
| 1. Type Message       |                              |                       |
| 2. Fetch Bob's PubKey |                              |                       |
|    From Directory     |                              |                       |
| 3. Compute shared key |                              |                       |
|    via ECDH P-256     |                              |                       |
| 4. Symmetric Encrypt  |                              |                       |
|    via AES-256-GCM    |                              |                       |
+-----------+-----------+                              +-----------+-----------+
            |                                                      ^
            | (Ciphertext + IV Blob)                               |
            v                                                      |
+-----------+-----------+                              +-----------+-----------+
| EXPRESS ROUTER REGIME | ---------------------------> | 5. Listen to Sockets  |
| No Plaintext Read     |                              | 6. Compute common     |
+-----------+-----------+                              |    shared key secret  |
            |                                          | 7. Local Decrypt      |
            v                                          |    via AES-256-GCM    |
+-----------+-----------+                              | 8. Clean via Purify   |
| MONGODB VAULT         |                              |    Render Plaintext   |
| Hardened Cipher Cache |                              +-----------------------+
+-----------------------+
```

---

## 3. STRIDE Threat Model Matrix

| Threat Category | Defined Vector Risk Description | Automated Platform Hardening Implementation Mitigation |
| :--- | :--- | :--- |
| **Spoofing Identity** | Malicious network node impersonating a user to dispatch arbitrary packet buffers. | Hardened Socket handshakes require a verified short-lived JWT token binding user email credentials. Anti-spoofing logic forces `senderId` parameter reconstruction from authenticated session contexts. |
| **Tampering with Data** | On-the-wire payload modification or parameter alteration over transport lines. | AES-256-GCM authenticated symmetric encryption attaches signature tags ensuring packet contents cannot be modified without matching shared secrets. |
| **Repudiation** | An actor denying launching sensitive actions (e.g. account parameter changes). | Continuous system immutable tracking records operations into the `AuditLog` database cluster mapping target, action type, IP address, and browser footprints. |
| **Information Disclosure** | Bad actor capturing backend server logs or database collections to read messaging data. | Comprehensive client-side End-to-End Encryption translates data streams using dynamic initialization vectors. Plaintext records never pass into cloud systems. |
| **Denial of Service** | Volumetric traffic packet injection intended to trigger memory bottlenecks or service crashes. | Rate-limiters throttle incoming request loops: Login operations restrict to 5 per minute, general operations cap at 60 messages per minute. |
| **Elevation of Privilege**| Standard user accounts hitting administrative management route boundaries. | Rigid Role-Based Access Control (`authorizeRoles` middleware checks payload attributes signed within encrypted JWT cookies before running logic). |

---

## 4. OWASP Top 10 Mitigation Matrix

1. **A01:2021-Broken Access Control**: Mitigated by deploying rigorous RBAC authorization middleware wrappers on every route. Every resource endpoint is gated by token and role ownership constraints.
2. **A02:2021-Cryptographic Failures**: Solved by implementing elite forward-secrecy P-256 ECDH public key exchanges combined with military-grade authenticated AES-256-GCM data encryption.
3. **A03:2021-Injection**: Mitigated on the backend via Mongoose parameter casting plus `express-validator` query/param validation hooks. Mitigated on the frontend via immediate input filtration utilizing DOMPurify.
4. **A04:2021-Insecure Design**: Structural plan sets clear client-backend boundaries. Encryption code avoids custom cryptographic design, selecting standardized native Web Crypto blocks instead.
5. **A05:2021-Security Misconfiguration**: Handled by embedding `helmet` security packages, stripping default stack banners, configuring Strict-Transport-Security, and isolating Cross-Origin resource permissions.
6. **A06:2021-Vulnerable and Outdated Components**: Fixed by tracking explicit version numbers inside system files and leveraging standard node environment updates.
7. **A07:2021-Identification and Authentication Failures**: Covered by binding official Firebase Admin token attestation verification scripts directly on login, transitioning onto HttpOnly SameSite=Strict short-lived JWT access routines.
8. **A08:2021-Software and Data Integrity Failures**: Binary attachments evaluate size limitations (10MB maximum capacity) and strip executable signatures (.exe, .apk, .js) prior to distribution.
9. **A09:2021-Security Logging and Monitoring Failures**: Implemented a standalone, dedicated `AuditLog` collection engine tracing failed authentication attempts, data deletions, account configuration updates, and session revocations.
10. **A10:2021-Server-Side Request Forgery (SSRF)**: Network configurations restrict input file targets. Cross-origin parameters reject anonymous cross-site redirects.

---

## 5. Deployment and Operations Playbook

### MongoDB Atlas Setup Guide
1. Launch an Atlas Cluster (Shared Tier or Dedicated M10+).
2. Under Network Access, whitelist target hosting IPs (Render outbound proxy nodes) or select `0.0.0.0/0` if proxy routing is transparently managed.
3. Establish database users with robust connection credentials. Save connection string strings to the server environment parameters.

### Render Backend Configuration Playbook
1. Initialize a Web Service project pointed to your repository backend path folder structure (`server/`).
2. Map the environment properties template below to environment variables variables panels:
   - `PORT` = `5000`
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = `mongodb+srv://<user>:<password>@cluster.mongodb.net/secureChat`
   - `JWT_SECRET` = `[Generate High Entropy 64 Character String]`
   - `JWT_REFRESH_SECRET` = `[Generate High Entropy 64 Character String]`
   - `FIREBASE_PROJECT_ID` = `[Your-Firebase-Project-Slug]`
   - `FIREBASE_CLIENT_EMAIL` = `[Firebase-Service-Account-Email]`
   - `FIREBASE_PRIVATE_KEY` = `[Firebase-Private-Key-String-With-Newlines]`
   - `ALLOWED_ORIGINS` = `https://your-vercel-domain.vercel.app`

### Vercel Frontend Configuration Playbook
1. Connect target repository client directory (`client/`) to a Vercel project container.
2. Bind target environment parameters inputs inside the project properties settings:
   - `REACT_APP_API_URL` = `https://your-render-service.onrender.com/api`
   - `REACT_APP_SOCKET_URL` = `https://your-render-service.onrender.com`
3. Trigger deployment builds. Vercel automatically maps headers, provisions global edge SSL certificates, and caches production build bundles.
