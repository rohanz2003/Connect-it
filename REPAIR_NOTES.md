# Mobile, Stories, and application repair

## Delivery status

The repaired source builds and passes the automated regression checks. This is
not a claim that every application bug has been eliminated or that deployment
has been fully validated. Backend Firebase configuration has now been validated
and the updated backend restarted. A real signed-in, two-device end-to-end test
is still outstanding.

## What changed

- **Mobile chat:** shrinkable grid/flex content, consistent bottom-navigation
  spacing, visible Back/menu controls, keyboard-aware viewport sizing, bounded
  emoji picker and story dialogs, and long-name/message wrapping.
- **Navigation:** selecting a conversation from the mobile sidebar/profile flow
  opens the chat; Back returns to Recent; resizing to desktop restores the list.
- **Stories:** fixed stale next-story callbacks and pause/resume timing; wait for
  media readiness; pause while commenting or inspecting viewers; synchronize
  confirmed reactions/comments; preserve failed drafts; clean up file previews;
  prevent duplicate submissions and show upload errors.
- **Upload limits:** story picker accepts up to 3 MB raw media so its base64 JSON
  fits the existing 5 MB API limit. Chat attachments accept up to 5 MB instead of
  advertising 25 MB files that exceed the 10 MB socket transport limit.
- **Session/chat correctness:** late profile responses cannot restore a signed-out
  session; API calls have a timeout; stale chat-history errors cannot replace the
  currently selected conversation; receipt matching requires real message IDs;
  friend-removal listeners are cleaned up; display-name search is case-insensitive.
- **Socket lifecycle:** refresh Firebase tokens for each handshake, cancel pending
  connections on logout/account switches, settle failed connection promises, and
  avoid duplicate connection attempts.
- **Backend:** removed unsigned-token/raw-email authentication fallbacks, bound
  socket identities and friendship operations to the authenticated actor, enforced
  story expiration/private access, filtered viewer/reply metadata, and corrected
  parser/sanitization/error handling and duplicate Story TTL indexing.
- **Checks:** replaced the obsolete starter test with routing/session regressions;
  added targeted chat/story/socket/API tests and working root/server test scripts.
- **Firebase Admin SDK compatibility:** migrated initialization and token
  verification to the modular v14 SDK APIs and updated the related admin deletion
  callsite. Added mocked regressions; no live user-deletion test was performed.

Primary source areas: `client/src/App.js`, `client/src/components/Chat.*`,
`client/src/components/story/`, `client/src/context/`, `client/src/services/`,
`server/controllers/`, `server/socket/`, and `server/middleware/firebaseAuth.js`.

## Actual verification

Run from the repository root:

```powershell
npm test
npm run build
git diff --check
```

- `npm test`: **47 client tests + 88 server tests passed**.
- `npm run build`: passed; output is `client/build/`. Existing ESLint warnings
  remain in Chat, Login, Admin, ProfileViewer, GlobalCallOverlay, and CallContext.
  There is no separate project lint or typecheck script.
- `node --check`: passed for the modified backend production JavaScript files.
- `git diff --check`: passed.
- Runtime used for these checks: Node 24.19.0. The root manifest still lists older
  Node engine ranges; toolchain/engine alignment is not addressed in this patch.
- HTTP smoke check: frontend returned 200 at `http://localhost:3000`;
  updated backend health returned 200 with MongoDB connected at
  `http://localhost:5001/api/health`.
- After the owner supplied the private local configuration, all required Firebase
  variables were present, the service account matched the configured project,
  initialization succeeded, and Google's credential exchange succeeded. No key
  or access-token values were printed or copied into repository files.
- The updated backend was restarted on port 5001 and confirmed Firebase Admin
  initialized at startup. An invalid test token now returns 401, `Invalid token`,
  rather than the previous 503, `Authentication service unavailable`.
- Browser opening timed out. No visual real-device or signed-in browser check
  is claimed. Automated UI tests use jsdom, not a real mobile layout engine.

Server regressions mock Firebase/MongoDB where needed. A connected health check
does not prove message persistence, notifications, calls, or authenticated uploads.

## Run locally

The session started a frontend on port 3000 and the updated backend on port 5001,
leaving the pre-existing process on port 5000 untouched. Do not start duplicate
listeners if these processes are still running.

To reproduce after stopping those local preview processes, open two PowerShell
terminals in the repository root.

Backend:

```powershell
$env:PORT="5001"
npm run server
```

Frontend:

```powershell
$env:PORT="3000"
$env:REACT_APP_API_URL="http://localhost:5001"
$env:REACT_APP_SOCKET_URL="http://localhost:5001"
npm run client
```

## Remaining live verification

The owner configured `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and
`FIREBASE_PRIVATE_KEY` in the private local `server/.env`. That file is ignored
and untracked in git. Keep credentials out of chat and git. The agent did not
change the credential values. Deployment hosts need their own private environment
configuration; a code push will not transfer the local `.env`.

Check with two test accounts on a phone and desktop:

1. Sign in, send/accept a request, exchange messages, and reload both sessions.
2. Open Recent, People, Stories, Calls, Archive, and Settings; open the keyboard
   in chat/story inputs; rotate the device and check for overlap or clipped controls.
3. Upload an image and a short video within the limits; check preview, caption,
   privacy, pause/resume, navigation, reactions, comments, and viewer list.
4. Check private stories from a friend and a non-friend; test network failures.
5. Exercise reconnect, signout, account switching, and voice/video calls.

## Known follow-ups outside the verified repair

- Device registration/activity queries still need a separate ownership review:
  some use a client-supplied `deviceId` without an owner condition.
- Opposite-direction simultaneous friendship sends can still race against the
  directional database unique index. A canonical pair constraint needs migration
  planning and live-database testing.
- Auxiliary endpoints such as test email, subscription registration, and device
  listing need a broader authorization review before public deployment.
- Story comments' direct-message fan-out and at-rest encryption behavior, large
  story-feed performance, and real WebRTC/push delivery were not fully audited.

The requested GitHub push is currently blocked: `gh auth status` still reports
signed out in the agent's Windows session, even after the owner reported signing
in. Complete GitHub CLI authentication in that same Windows account before
committing/pushing. No push or deployment is claimed.

No commits, deployment, dependency upgrades, or agent-made credential changes were made.
The pre-existing deletion of `client/abc.js` was preserved.
