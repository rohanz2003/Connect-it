# Connect It 🚀
### Enterprise-Grade Secure Messaging & High-Fidelity WebRTC Calling Platform

Welcome to **Connect It**, a real-time, end-to-end encrypted messaging, voice, and video calling platform. Built with a robust **Node.js/Express/MongoDB** backend and a reactive **React/Tailwind CSS** frontend, the application incorporates top-tier security standards, multi-device state synchronization, and offline resilience.

---

## 📖 Table of Contents
1. [Core Pillars & Security Philosophy](#-core-pillars--security-philosophy)
2. [Platform Architecture Blueprint](#-platform-architecture-blueprint)
3. [Deep Dive: Feature Specifications](#-deep-dive-feature-specifications)
4. [Database Models & Schema Definitions](#-database-models--schema-definitions)
5. [System Lifecycle & Sequence Flows](#-system-lifecycle--sequence-flows)
    - [A. End-to-End Encrypted (E2EE) Messaging & Tick-Status Sequence](#a-end-to-end-encrypted-e2ee-messaging--tick-status-sequence)
    - [B. WebRTC calling & Signaling Flow](#b-webrtc-calling--signaling-flow)
    - [C. Auth & Multi-Device Registration](#c-auth--multi-device-registration)
    - [D. OTP-Secured Admin Login & JWT Pipeline](#d-otp-secured-admin-login--jwt-pipeline)
6. [Repository Structure Map](#-repository-structure-map)
7. [Environment Variables Reference](#-environment-variables-reference)
8. [Setup, Operations & Deployment](#-setup-operations--deployment)
9. [Telemetry & Diagnostics Endpoints](#-telemetry--diagnostics-endpoints)

---

## 🛡️ Core Pillars & Security Philosophy

Connect It is architected from the ground up to respect absolute user privacy, high operational reliability, and sub-second delivery latency.

*   **Zero-Knowledge Message Privacy (AES-256-GCM)**: All messages at rest on the database are fully encrypted using AES-256 in Galois/Counter Mode (GCM). The server handles routing but never holds the ability to index or read message contents in plaintext outside authorized audit streams.
*   **Dual-Layer Multi-Device Coordination**: A single user email can be active simultaneously across multiple physical browsers or devices. Sockets automatically route incoming payloads to all online device instances, providing a seamless multi-screen unified experience (reminiscent of WhatsApp Web).
*   **Zero-Call-Latency Signaling**: Calls employ a hybrid WebRTC signaling server model. Voice and Video data are piped peer-to-peer (P2P) for the highest quality and absolute lowest transit delay, utilizing STUN servers for NAT traversal.
*   **Secure Administration**: No passwords or default backdoors exist in the Admin portal. High-profile data audits are protected by One-Time Passwords (OTP) generated on-demand and sent to a validated, preconfigured `ADMIN_EMAIL`. Successive commands are validated via signed JWT bearer tokens expiring in 1 hour.

---

## 🏗️ Platform Architecture Blueprint

The platform separates responsibilities cleanly across three separate layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                               │
│  React Application • Tailwind CSS • WebRTC Media • Socket.io Client   │
└───────────────────▲───────────────────────────────▲────────────────────┘
                    │                               │
        WebSockets (Presence, Call                  │ HTTPS (REST API:
        Signaling, Instant Messaging)               │ Auth, Feedback, Admin)
                    │                               │
┌───────────────────▼───────────────────────────────▼────────────────────┐
│                              SERVER TIER                               │
│ Node.js • Express • Socket.io Server • AES-256-GCM Crypto • Mail Engine│
└───────────────────▲───────────────────────────────▲────────────────────┘
                    │                               │
       Database Reads/Writes                        │ SMTP / Web Push APIs
                    │                               │
┌───────────────────▼─────────────┐       ┌─────────▼────────────────────┐
│           DATA STORE            │       │      EXTERNAL PLATFORMS      │
│  MongoDB Cloud Cluster (Atlas)  │       │ Firebase Auth • Nodemailer   │
└─────────────────────────────────┘       └──────────────────────────────┘
```

1.  **Frontend SPA (React 19)**: Built with specialized contexts (`SocketContext`, `CallContext`) and custom hooks (`useWebRTC`, `useCallTimer`, `useLastSeen`) managing system states. Simple-Peer wraps the complex WebRTC connection, while Tailwind CSS serves a clean, responsive layout.
2.  **Stateful Backend Gateway (Express & Socket.io)**: Serves static files, hosts RESTful interfaces, and brokers Socket.io connections. Uses structured socket handlers (`presence`, `message`, `call`, `typing`, `requests`) and caches temporary parameters.
3.  **Persistence Store (Mongoose/MongoDB)**: Fully indexed documents managing user profiles, devices, chat friendship linkages, encrypted conversations, feedback submissions, and active notification subscription endpoints.

---

## 🚀 Deep Dive: Feature Specifications

### 🔑 1. User Auth & Verification
*   **Email Domain Restrictions**: Users sign up exclusively with valid `@gmail.com` addresses.
*   **In-Inbox Validation**: Signups are strictly held in a pending state until users verify their email account via the Firebase Auth verification links.
*   **Pre-compressed Avatars**: Profile picture uploads are dynamically downscaled and compressed to a Canvas-drawn JPEG (`quality: 0.7`) to minimize storage footprint before caching in local browser state.

### 💬 2. Friendship & Request Constraints (ChatRequest)
*   **The Firewall**: Users cannot randomly spam messages to any email. A user must search for a verified Gmail and transmit a **Chat Request**.
*   **Explicit Consent**: The recipient must actively click "Accept". Sockets instantly transition the local lists from "Pending" to "Friends".
*   **The Killswitch (Remove Friend)**: Any participant can choose to "Remove Friend". Doing so immediately wipes the `ChatRequest` records, hard-deletes all shared messages in MongoDB, updates the state in both clients over sockets, and fires an alert.

### ✉️ 3. Encrypted Multi-Device Messaging
*   **En-route Encryption**: When a message is sent, the server accepts the payload, generates a unique Initialization Vector (IV), encrypts the plaintext with AES-256-GCM using the server-side `MESSAGE_ENCRYPTION_KEY`, computes the Auth Tag, and stores the encrypted object (`iv`, `tag`, `data`) in MongoDB.
*   **Multi-Device Push**: If a receiver is online across three screens (e.g., Laptop, Phone, Tablet), the socket gateway routes the decrypted message payload simultaneously to all three socket instances mapped to the user.
*   **Delivered & Seen Ticks**:
    *   **Gray Single Tick (`sent`)**: Message written safely to database.
    *   **Double Gray Ticks (`delivered`)**: Message successfully dispatched to and received by at least one active device socket of the receiver.
    *   **Double Blue Ticks (`read`)**: The receiver opens the chat panel, triggering a `seen-message` or `mark-as-read` event across all devices.
*   **Soft Clears (WhatsApp Style)**: A user can select "Clear Chat". Rather than deleting messages from the database (which would delete them for both parties), it inserts a `ClearedChat` record marking a timestamp. Future history queries for that user filter out any messages sent prior to the cleared timestamp.

### 📞 4. High-Fidelity WebRTC Calling
*   **Audio & Video Mesh**: Establishes peer-to-peer real-time streams with Google STUN servers.
*   **Global Overlay Listener**: A portalled `GlobalCallOverlay` intercepts incoming invitations anywhere in the app, rendering call states instantly (Ringing, Outgoing Dialing, Active, Ended).
*   **Device Feedback**: Integrated ringtones (Web Audio API), mobile device vibration patterns, and real-time active duration timers ensure a native-app-like user experience.

### 🔔 5. Push Notifications & Offline Queueing
*   **Undelivered Cache**: If a message is sent to a friend who is currently offline, the server sets its status to `sent`. Upon the friend logging in, the server queries undelivered messages, releases them, flags them as `delivered`, and updates the sender.
*   **Service Worker Push**: Uses standard Web Push protocol (via `VAPID` keys) to register active service workers. If offline, the recipient receives system tray push notifications containing the sender's name and message preview.

### 🛡️ 6. Single-OTP Administrative Auditing
*   **OTP Dispatch**: Accessing `/admin` prompts for the admin email. The server generates a cryptographic 6-digit PIN, caches it for 5 minutes via an in-memory TTL cache, and sends it via Nodemailer/SendGrid (or logs to console in development).
*   **Audited Dashboard**: Submitting the correct PIN yields a signed short-duration JWT. The administrator gains access to global telemetry: message frequency, total users, rating charts, system feedback logs, and a master feed showing decrypted messages (for audit/compliance purposes).

---

## 🗄️ Database Models & Schema Definitions

Mongoose definitions mapping system entities in MongoDB:

### 1. `User` Schema
Holds validated profile metadata.
```javascript
{
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  displayName: { type: String, default: null },
  bio:         { type: String, default: null },
  avatarUrl:   { type: String, default: null },
  lastSeen:    { type: Date }
}
```

### 2. `Device` Schema
Tracks logged-in active browser and client configurations.
```javascript
{
  deviceId:   { type: String, required: true, unique: true },
  userId:     { type: String, required: true, lowercase: true, trim: true },
  socketId:   { type: String, default: null },
  deviceName: { type: String, default: "" },
  deviceType: { type: String, default: "" },
  browser:    { type: String, default: "" },
  os:         { type: String, default: "" },
  isActive:   { type: Boolean, default: false },
  lastSeen:   { type: Date, default: Date.now }
}
```

### 3. `ChatRequest` Schema
Manages explicit connection approvals between users.
```javascript
{
  from:        { type: String, required: true, lowercase: true, trim: true },
  to:          { type: String, required: true, lowercase: true, trim: true },
  status:      { type: String, enum: ["pending", "accepted", "rejected", "removed"], default: "pending" },
  createdAt:   { type: Date, default: Date.now },
  respondedAt: { type: Date, default: null }
}
// Compound Index: { from: 1, to: 1 } (Unique)
```

### 4. `Message` Schema
Maintains AES-256-GCM encrypted message structures.
```javascript
{
  sender:           { type: String, required: true, lowercase: true, trim: true },
  receiver:         { type: String, required: true, lowercase: true, trim: true },
  text: {
    __enc:          { type: Boolean, default: true },
    iv:             { type: String, required: true },
    tag:            { type: String, required: true },
    data:           { type: String, required: true }
  },
  type:             { type: String, default: "text" }, // "text", "media", etc.
  mediaType:        { type: String, default: null },   // "image", "audio", "video", etc.
  tempId:           { type: String },                  // Frontend temporary optimistic UUID
  replyTo:          { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  status:           { type: String, enum: ["sent", "delivered", "read"], default: "sent" },
  deliveredDevices: [ { type: String } ],              // Array of deviceIds that received it
  readDevices:      [ { type: String } ],              // Array of deviceIds where chat was opened
  timestamp:        { type: Date, default: Date.now }
}
```

### 5. `ClearedChat` Schema
Stores dynamic WhatsApp-style soft wipe timestamps per-user.
```javascript
{
  user:      { type: String, required: true, lowercase: true, trim: true },
  partner:   { type: String, required: true, lowercase: true, trim: true },
  clearedAt: { type: Date, default: Date.now }
}
```

### 6. `Feedback` Schema
Holds standard rating submissions and logs.
```javascript
{
  name:      { type: String, required: true },
  email:     { type: String, required: true },
  message:   { type: String, required: true },
  rating:    { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
}
```

### 7. `PushSubscription` Schema
Holds active Web Push subscriptions mapped to active service workers.
```javascript
{
  userId:       { type: String, required: true, lowercase: true, trim: true, unique: true },
  subscription: { type: mongoose.Schema.Types.Mixed, required: true }, // PushSubscription JSON
  deviceInfo:   { type: String, default: "" },
  updatedAt:    { type: Date, default: Date.now }
}
```

---

## 🔄 System Lifecycle & Sequence Flows

The detailed transactional interactions of Connect It's operational subsystems:

### A. End-to-End Encrypted (E2EE) Messaging & Tick-Status Sequence
This lifecycle handles message dispatch, on-the-fly encryption, multi-device delivery, offline notifications, and reading receipts.

```
 Sender Client                 Socket.io Gateway               MongoDB Cloud              Receiver Client
   (Active)                        (Server)                      Database                    (Offline)
      │                               │                              │                           │
      │ 1. send-message(plain text)   │                              │                           │
      ├──────────────────────────────>│                              │                           │
      │                               │ 2. Encrypt text with AES key │                           │
      │                               │    {__enc, iv, tag, data}    │                           │
      │                               ├────────────────┐             │                           │
      │                               │                │             │                           │
      │                               │ 3. Save Message│             │                           │
      │                               │<───────────────┘             │                           │
      │                               ├─────────────────────────────>│                           │
      │                               │                              │                           │
      │                               │ 4. Detect Recipient Offline  │                           │
      │                               ├──────────────────────────────┼──────────────────────────>│
      │                               │                              │                           │
      │                               │ 5. Trigger Push Notification │                           │
      │                               │    via Web Push (VAPID API)  │                           │
      │                               ├──────────────────────────────┼──────────────────────────> [Device Tray Push Alert]
      │                               │                              │                           │
      │ 6. message-status: "sent"     │                              │                           │
      │    (Single Gray Tick ✓)       │                              │                           │
      │<──────────────────────────────┤                              │                           │
      │                               │                              │                           │
      │                               │                              │    (Recipient logs in)    │
      │                               │                              │       (State: Active)     │
      │                               │ 7. join (userId, deviceId)   │                           │
      │                               │<─────────────────────────────┼───────────────────────────┤
      │                               │                              │                           │
      │                               │ 8. Query undelivered messages│                           │
      │                               ├─────────────────────────────>│                           │
      │                               │                              │                           │
      │                               │ 9. Return encrypted array    │                           │
      │                               │<─────────────────────────────┤                           │
      │                               │                              │                           │
      │                               │ 10. Decrypt on-the-fly       │                           │
      │                               ├────────┐                     │                           │
      │                               │        │                     │                           │
      │                               │ Decrypt│                     │                           │
      │                               │<───────┘                     │                           │
      │                               │                              │                           │
      │                               │ 11. undelivered-messages     │                           │
      │                               ├──────────────────────────────┼──────────────────────────>│
      │                               │                              │                           │
      │                               │ 12. Update Status to         │                           │
      │                               │     "delivered" in DB        │                           │
      │                               ├─────────────────────────────>│                           │
      │                               │                              │                           │
      │ 13. message-status: "delivered"                              │                           │
      │     (Double Gray Ticks ✓✓)    │                              │                           │
      │<──────────────────────────────┤                              │                           │
      │                               │                              │                           │
      │                               │                              │    (Receiver opens Chat)  │
      │                               │ 14. seen-message             │                           │
      │                               │<─────────────────────────────┼───────────────────────────┤
      │                               │                              │                           │
      │                               │ 15. Update Status to "read"  │                           │
      │                               ├─────────────────────────────>│                           │
      │                               │                              │                           │
      │ 16. messages-read             │                              │                           │
      │     (Double Blue Ticks ✓✓)    │                              │                           │
      │<──────────────────────────────┤                              │                           │
```

---

### B. WebRTC Calling & Signaling Flow
This sequence manages the peer-to-peer connection initialization, ice candidate trickling, active stream connection, and history logging.

```
Caller Client                  Socket.io Gateway                 STUN Servers                 Callee Client
   (Active)                        (Server)                    (Google public)                 (Ringing)
      │                               │                               │                            │
      │ 1. startCall(callee, type)    │                               │                            │
      ├──────────────────────────────>│                               │                            │
      │                               │ 2. emit: incoming-call        │                            │
      │                               ├───────────────────────────────┼───────────────────────────>│
      │                               │                               │                            │
      │                               │                               │                           [Play Ringtone, Vibrate]
      │                               │                               │                            │
      │                               │                               │    3. Click "Accept Call"  │
      │                               │                               │<───────────────────────────┤
      │                               │ 4. emit: answer-call          │                            │
      │                               │<──────────────────────────────┼────────────────────────────┤
      │ 5. emit: call-accepted        │                               │                            │
      ├──────────────────────────────>│                               │                            │
      │                               │                               │                            │
      │ 6. Query IP/Port mappings     │                               │                            │
      ├───────────────────────────────┼──────────────────────────────>│                            │
      │                               │                               │<───────────────────────────┤
      │ 7. Return ICE Candidates      │                               │                            │
      │<──────────────────────────────┼───────────────────────────────┤                            │
      │                               │                               │ 8. Return ICE Candidates   │
      │                               │                               ├───────────────────────────>│
      │                               │                               │                            │
      │ 9. ice-candidate (trickled via Socket signaling server)       │                            │
      ├──────────────────────────────>│                               │                            │
      │                               │ 10. ice-candidate (trickled)  │                            │
      │                               ├───────────────────────────────┼───────────────────────────>│
      │                               │                               │                            │
      │<==========================================================================================>│
      │                     11. ESTABLISH DIRECT PEER-TO-PEER MEDIA STREAM                        │
      │                         (Decoupled Voice / Video Transit Mesh)                             │
      │<==========================================================================================>│
      │                               │                               │                            │
      │                               │                               │    12. Click "Hang Up"     │
      │                               │                               │<───────────────────────────┤
      │                               │ 13. emit: call-ended          │                            │
      │                               │<──────────────────────────────┼────────────────────────────┤
      │ 14. emit: call-ended          │                               │                            │
      │<──────────────────────────────┤                               │                            │
      │                               │                               │                            │
      │ 15. Tear down Media Stream    │                               │                            │
      ├────────┐                      │                               │                            │
      │        │                      │                               │                            │
      │ Stop   │                      │                               │                            │
      │ Tracks │                      │                               │                            │
      │<───────┘                      │                               │                            │
      │                               │                               │ 16. Tear down Media Stream │
      │                               │                               │                            ├────────┐
      │                               │                               │                            │        │
      │                               │                               │                            │ Stop   │
      │                               │                               │                            │ Tracks │
      │                               │                               │                            │<───────┘
      │ 17. Save Log to CallHistory   │                               │                            │
      ├────────┐                      │                               │                            │
      │        │                      │                               │                            │
      │ Save   │                      │                               │                            │
      │ Record │                      │                               │                            │
      │<───────┘                      │                               │ 18. Save Log to CallHistory│
      │                               │                               │                            ├────────┐
      │                               │                               │                            │        │
      │                               │                               │                            │ Save   │
      │                               │                               │                            │ Record │
      │                               │                               │                            │<───────┘
```

---

### C. Auth & Multi-Device Registration
This workflow tracks user verification status, browser environment detection, and parallel multi-device binding.

```
 Client Browser                 Firebase Auth                  Express REST API               Socket Gateway
      │                               │                               │                              │
      │ 1. Submit Gmail & Password    │                               │                              │
      ├──────────────────────────────>│                               │                              │
      │                               │ 2. Email verification check   │                               │
      │                               │    (must be Verified)         │                              │
      │                               ├────────┐                      │                              │
      │                               │        │                      │                              │
      │                               │ Verify │                      │                              │
      │                               │<───────┘                      │                              │
      │ 3. Auth Success Token         │                               │                              │
      │<──────────────────────────────┤                               │                              │
      │                               │                               │                              │
      │ 4. Detect Device Profile      │                               │                              │
      │    (ua-parser-js OS/Browser)  │                               │                              │
      ├────────┐                      │                               │                              │
      │        │                      │                               │                              │
      │ Parse  │                      │                               │                              │
      │ Spec   │                      │                               │                              │
      │<───────┘                      │                               │                              │
      │                               │                               │                              │
      │ 5. POST /api/users            │                               │                              │
      │    (upsert user email record) │                               │                              │
      ├───────────────────────────────┼──────────────────────────────>│                              │
      │                               │                               │ 6. Find & Update User        │
      │                               │                               ├────────┐                     │
      │                               │                               │        │                     │
      │                               │                               │ Upsert │                     │
      │                               │                               │<───────┘                     │
      │ 7. HTTP Response 200 (Success)│                               │                              │
      │<──────────────────────────────┼───────────────────────────────┤                              │
      │                               │                               │                              │
      │ 8. Connect Socket with deviceId auth payload                  │                              │
      ├───────────────────────────────┼───────────────────────────────┼─────────────────────────────>│
      │                               │                               │                              │ 9. Save Socket to device mapping
      │                               │                               │                              ├────────┐
      │                               │                               │                              │        │
      │                               │                               │                              │ DB     │
      │                               │                               │                              │ Register│
      │                               │                               │                              │<───────┘
      │                               │                               │                              │
      │ 10. socket-emit: "device-registered" (with stable deviceId)   │                              │
      │<──────────────────────────────┼───────────────────────────────┼──────────────────────────────┤
```

---

### D. OTP-Secured Admin Login & JWT Pipeline
This pipeline ensures zero-password security for logging in to the auditing control panel.

```
 Admin Client                   Express API Controller               In-Memory TTL Cache           Email Service
   (Browser)                         (Server)                            (Node-Cache)           (Nodemailer/SendGrid)
      │                               │                                       │                           │
      │ 1. POST /admin/send-otp(email)│                                       │                           │
      ├──────────────────────────────>│                                       │                           │
      │                               │ 2. Validate email == ADMIN_EMAIL      │                           │
      │                               ├────────┐                              │                           │
      │                               │        │                              │                           │
      │                               │ Validate                              │                           │
      │                               │<───────┘                              │                           │
      │                               │                                       │                           │
      │                               │ 3. Generate 6-digit random PIN        │                           │
      │                               ├────────┐                              │                           │
      │                               │        │                              │                           │
      │                               │ PIN Gen│                              │                           │
      │                               │<───────┘                              │                           │
      │                               │                                       │                           │
      │                               │ 4. Cache PIN under email (TTL: 5m)    │                           │
      │                               ├──────────────────────────────────────>│                           │
      │                               │                                       │                           │
      │                               │ 5. Send secure HTML email with OTP    │                           │
      │                               ├───────────────────────────────────────┼──────────────────────────>│
      │                               │                                       │                           │ [Deliver Inbox Email]
      │                               │                                       │                           │
      │ 6. Receive Success Response   │                                       │                           │
      │<──────────────────────────────┤                                       │                           │
      │                               │                                       │                           │
      │ 7. POST /admin/verify-otp     │                                       │                           │
      │    { email, otp }             │                                       │                           │
      ├──────────────────────────────>│                                       │                           │
      │                               │ 8. Request Cached OTP                 │                           │
      │                               ├──────────────────────────────────────>│                           │
      │                               │                                       │                           │
      │                               │ 9. Return cached OTP value            │                           │
      │                               │<──────────────────────────────────────┤                           │
      │                               │                                       │                           │
      │                               │ 10. Compare & Verify                  │                           │
      │                               ├────────┐                              │                           │
      │                               │        │                              │                           │
      │                               │ Verify │                              │                           │
      │                               │<───────┘                              │                           │
      │                               │                                       │                           │
      │                               │ 11. Evict OTP from Cache              │                           │
      │                               ├──────────────────────────────────────>│                           │
      │                               │                                       │                           │
      │                               │ 12. Sign JWT Token with JWT_SECRET    │                           │
      │                               ├────────┐                              │                           │
      │                               │        │                              │                           │
      │                               │ Sign   │                              │                           │
      │                               │<───────┘                              │                           │
      │                               │                                       │                           │
      │ 13. Return Success JWT Bearer │                                       │                           │
      │<──────────────────────────────┤                                       │                           │
      │                               │                                       │                           │
      │                               │                                       │                           │
      │ 14. GET /api/admin/messages   │                                       │                           │
      │     Header: Bearer <JWT>      │                                       │                           │
      ├──────────────────────────────>│                                       │                           │
      │                               │ 15. Verify Sign and issue decryption  │                           │
      │                               │     audits of DB messages             │                           │
      │                               ├────────┐                              │                           │
      │                               │        │                              │                           │
      │                               │ Decrypt│                              │                           │
      │                               │ Messages│                             │                           │
      │                               │<───────┘                              │                           │
      │ 16. Returns Audit Payload     │                                       │                           │
      │<──────────────────────────────┤                                       │                           │
```

---

## 📁 Repository Structure Map

Detailed visual outline of structural layers and assets:

```
C:\rohan\chat\
├── .gitignore                      # Git tracking ignores
├── .vercelignore                   # Vercel deployment ignores
├── package.json                    # Workspace orchestrator tasks
├── render.yaml                     # Render.com Blueprint spec
├── vercel.json                     # Vercel configuration override
├── client\                         # --- FRONTEND (REACT) APPLICATION ---
│   ├── .env.development            # Local dev environmental overrides
│   ├── .env.production             # Prod server target overrides
│   ├── vercel.json                 # Vercel route rewrites & build parameters
│   ├── package.json                # Frontend package dependencies
│   ├── tailwind.config.js          # Utility CSS config definitions
│   ├── postcss.config.js           # PostCSS configuration file
│   ├── public\                     # Static asset folder
│   │   ├── manifest.json           # Web PWA specifications
│   │   ├── robots.txt              # SEO crawler guide
│   │   └── sw.js                   # Web Push Notifications Service Worker
│   └── src\                        # Source scripts
│       ├── index.js                # Frontend entry anchor
│       ├── App.js                  # Master Router & Session state listener
│       ├── firebase.js             # Firebase auth core initialization
│       ├── components\             # React components subsystem
│       │   ├── Chat.js             # Consolidated Main Chat Panel
│       │   ├── UsersSidebar.js     # Contact, Profile, and Request sidebar
│       │   ├── Message.js          # Status indicators & decrypted bubble renderer
│       │   ├── LastSeen.js         # Last seen / online status component
│       │   ├── TypingIndicator.js  # Typing status indicator
│       │   ├── Avatar.js           # Letter-avatars / loaded profile images
│       │   ├── Login.js            # User signup/login forms with canvas scaling
│       │   ├── Admin.js            # Admin portal verification flow
│       │   ├── AdminLogin.js       # Admin OTP verify step component
│       │   ├── AdminDashboard.js   # Telemetry & compliance decrypted audits
│       │   ├── Feedback.js         # User review submittals form
│       │   ├── NotificationBell.jsx# Push subscription manager
│       │   ├── ErrorBoundary.js    # Global exception wrapper
│       │   └── call\               # WebRTC calling subsystem
│       │       ├── ActiveCall.jsx  # Fullscreen call streams & toggler
│       │       ├── CallControls.jsx# Call floating action controllers
│       │       ├── CallHistory.jsx # Logged logs representation
│       │       ├── IncomingCall.jsx# Alert panel + ringtone play controller
│       │       └── GlobalCallOverlay.jsx # App-wide calling state modal portal
│       ├── context\                # Global Context Pools
│       │   ├── CallContext.jsx     # WebRTC dialing and calling state engine
│       │   └── SocketContext.js    # Singleton socket delivery pipe
│       ├── hooks\                  # Client Custom hooks
│       │   ├── useWebRTC.js        # Simple-Peer connection setup hook
│       │   ├── useCallTimer.js     # Duration computer
│       │   ├── useLastSeen.js      # Heartbeat polling state listener
│       │   └── useSocket.js        # Custom Socket context wrapper
│       └── utils\                  # Help utilities
│           ├── callHelpers.js      # Call history persistence in localStorage
│           ├── callSounds.js       # Audio synthesizer (ringtones/hangup tones)
│           ├── deviceDetector.js   # Client OS and browser parser
│           ├── imageUtils.js       # In-browser Canvas downsampler
│           ├── pushHelper.js       # Service worker registers & subscriber
│           └── timeFormatter.js    # Dynamic calendar visual relative dates
└── server\                         # --- BACKEND (NODE.JS) SERVICE ---
    ├── index.js                    # Web server init & database bootstrap
    ├── package.json                # Server package requirements
    ├── config\                     # Static config managers
    │   ├── database.js             # Mongoose connection layer
    │   ├── env.js                  # CORS Origin mapper & environmental guards
    │   └── mail.js                 # Nodemailer configuration
    ├── controllers\                # REST Request Executors
    │   ├── adminAuthController.js  # OTP generation/verification & JWT issuing
    │   ├── adminController.js      # Decrypted databases & metrics queries
    │   ├── feedbackController.js   # Submissions handlers
    │   ├── messageController.js    # Database logs retrievers
    │   ├── requestController.js    # Friendships management & push actions
    │   └── userController.js       # Upserts, accounts deletion, profile updates
    ├── middleware\                 # Express Interceptors
    │   └── adminAuthMiddleware.js  # Bearer token verification
    ├── models\                     # Database Entity Schemas
    │   ├── ChatRequest.js          # Chat Request approvals
    │   ├── ClearedChat.js          # Soft-wipe chat markers
    │   ├── Device.js               # User's active hardware loggers
    │   ├── Feedback.js             # Reviews submissions data
    │   ├── Message.js              # Encrypted message items
    │   └── PushSubscription.js     # Web Push subscription registers
    ├── modules\                    # Shared schemas
    │   └── User.js                 # User profile record
    ├── routes\                     # Route-endpoints routers
    │   ├── adminRoutes.js          # /api/admin/*
    │   ├── feedbackRoutes.js       # /api/feedback/*
    │   ├── messageRoutes.js        # /api/messages/*
    │   ├── requestRoutes.js        # /api/requests/*
    │   └── userRoutes.js           # /api/users/*
    ├── services\                   # External communications engines
    │   ├── emailService.js         # Nodemailer SMTP dispatcher
    │   └── pushService.js          # Web-Push notification dispatcher
    ├── socket\                     # WebSocket Event handlers
    │   ├── socket.js               # Primary connector & heartbeats cleaner
    │   ├── presence.js             # Online, profiles, and offline markers
    │   ├── typing.js               # Typing toggles
    │   ├── message.js              # Encrypting persistence, seen ticks, clears
    │   ├── call.js                 # Audio/Video signaling & trickle ICE
    │   ├── requests.js             # Live request sync alerts
    │   └── firebase.js             # Firebase service attachments
    └── utils\                      # Technical components
        ├── messageCrypto.js        # AES-256-GCM cipher engines
        ├── socketAuth.js           # Socket validations and room utilities
        └── time.js                 # Format converters
```

---

## ⚙️ Environment Variables Reference

To successfully initialize Connect It, supply a `.env` file within the `/server` directory, and specify configuration values inside Vercel production variables for the client.

### Backend (`/server/.env`)
Create `/server/.env` based on the provided `/server/.env.example`:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| `MONGO_URI` | `mongodb+srv://...` | MongoDB database connection URI |
| `PORT` | `5000` | Port for the Express backend server |
| `NODE_ENV` | `development` | Environment mode (`development` or `production`) |
| `JWT_SECRET` | `02b4e318eb35f...` | 256-bit secret key used to sign Admin access JWTs |
| `ADMIN_EMAIL` | `admin@example.com` | Email address permitted to request Admin OTPs |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend base URL allowed for CORS clearance |
| `MESSAGE_ENCRYPTION_KEY` | `7d8b66ea24e...` | 32+ character key for AES-256-GCM message encryption |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP host used to dispatch Admin OTPs |
| `SMTP_PORT` | `587` | SMTP port (usually 587 for TLS, or 465 for SSL) |
| `SMTP_USER` | `user@gmail.com` | Username for SMTP email authentication |
| `SMTP_PASS` | `abcd efgh ijkl mnop` | Password (or App Password) for SMTP authentication |
| `VAPID_PUBLIC_KEY` | `BFvI7eTDgI...` | VAPID public key for web push signatures |
| `VAPID_PRIVATE_KEY` | `u6yYpSOUkC...` | VAPID private key for web push encryption |
| `VAPID_EMAIL` | `mailto:admin@gmail.com` | Contact email associated with push notifications |

### Frontend (`/client/.env.local`)
Create inside `/client/.env.local` to point to your backend:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| `REACT_APP_SOCKET_URL` | `http://localhost:5000` | Target URL pointing to the backend Socket server |

---

## 🛠️ Setup, Operations & Deployment

### Quickstart (Local Monorepo Run)

Ensure **Node.js v18+** and a running **MongoDB** cluster are ready.

1.  **Install all dependencies**:
    From the root directory, execute:
    ```bash
    npm run install-all
    ```
    This triggers nested installations across the root, `/client`, and `/server` automatically.

2.  **Populate Configs**:
    *   Create `/server/.env` and insert your MongoDB, JWT, AES, SMTP, and VAPID credentials.
    *   Create `/client/.env.local` and configure `REACT_APP_SOCKET_URL`.

3.  **Boot Up the Server**:
    ```bash
    npm run server
    ```
    Runs Express and WebSockets on `http://localhost:5000`.

4.  **Boot Up the Client**:
    ```bash
    npm run client
    ```
    Spins up the React application locally on `http://localhost:3000`.

---

## 🩺 Telemetry & Diagnostics Endpoints

Connect It features internal diagnostics endpoints to simplify deployment monitoring and operational tracking:

*   **Server Health Check (`/api/health`)**:
    Returns status of MongoDB connection, validation indicators of key environment setups (whether Gmail, VAPID, JWT, and Encryption Keys are set), and current database state strings.
    *Example Response*:
    ```json
    {
      "ok": true,
      "mongoState": 1,
      "mongoStateLabel": "connected",
      "config": {
        "MONGO_URI_SET": true,
        "JWT_SECRET_SET": true,
        "EMAIL_USER_SET": true,
        "EMAIL_PASSWORD_SET": true,
        "ADMIN_EMAIL_SET": true,
        "FRONTEND_URL_SET": true
      }
    }
    ```

*   **Telemetry Analytics (`/api/analytics`)**:
    An authorized public telemetric gateway displaying operational analytics metrics.
    *Example Response*:
    ```json
    {
      "success": true,
      "totalUsers": 128,
      "totalMessages": 14052,
      "acceptedRequests": 94
    }
    ```

---

*Document created in June 2026 for developer reference.*
