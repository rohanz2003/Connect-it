# Deployment Guide — Connect It

## Prerequisites
- Node.js 18+
- MongoDB Atlas account
- Firebase project (with Authentication enabled)
- Vercel account (frontend)
- Render account (backend)
- GitHub repository

---

## 1. MongoDB Atlas Setup

1. Create cluster (M0 free tier is sufficient)
2. Create database user with read/write permissions
3. Get connection string:
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/chatapp?retryWrites=true&w=majority
   ```
4. Enable Network Access → Allow access from anywhere (0.0.0.0/0) for Render deployment

---

## 2. Firebase Setup

1. Go to Firebase Console → Create Project
2. Enable Authentication:
   - Email/Password
   - Google
   - Phone (enable recaptcha)
3. Create Web App → Copy Firebase config
4. Go to Project Settings → Service Accounts
5. Generate new private key → Download JSON
6. Note: `project_id`, `client_email`, `private_key`

---

## 3. Backend (Render) Deployment

### Render Dashboard Setup
1. New Web Service → Connect GitHub repo
2. Settings:
   - Name: `connect-it-server`
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `node index.js`
   - Root Directory: `server`

### Environment Variables (Render Dashboard)
```
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/chatapp
JWT_SECRET=<64-char-random-hex>
JWT_REFRESH_SECRET=<64-char-random-hex-different>
MESSAGE_ENCRYPTION_KEY=<64-char-random-hex>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN_MS=604800000

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=<gmail-app-password>
FROM_EMAIL=your-email@gmail.com

ADMIN_EMAIL=admin@example.com
FRONTEND_URL=https://connect-it.vercel.app

FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_CLIENT_EMAIL=<firebase-adminsdk-xxx@project.iam.gserviceaccount.com>
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nKEY_CONTENT\n-----END PRIVATE KEY-----"

VAPID_PUBLIC_KEY=<webpush-public-key>
VAPID_PRIVATE_KEY=<webpush-private-key>
VAPID_SUBJECT=mailto:your-email@example.com

NODE_ENV=production
RENDER=true
PORT=10000
```

### Generate Keys
```bash
# JWT secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# VAPID keys
npx web-push generate-vapid-keys
```

---

## 4. Frontend (Vercel) Deployment

### Vercel Dashboard Setup
1. New Project → Import GitHub repo
2. Root Directory: `client`
3. Framework: Create React App
4. Build Command: `npm run build`
5. Output Directory: `build`

### Environment Variables (Vercel Dashboard)
```
REACT_APP_API_URL=https://connect-it-server.onrender.com
REACT_APP_SOCKET_URL=https://connect-it-server.onrender.com
REACT_APP_FIREBASE_API_KEY=<firebase-api-key>
REACT_APP_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=<project-id>
REACT_APP_FIREBASE_STORAGE_BUCKET=<project>.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
REACT_APP_FIREBASE_APP_ID=<app-id>
REACT_APP_FIREBASE_MEASUREMENT_ID=<measurement-id>
REACT_APP_VAPID_PUBLIC_KEY=<webpush-public-key>
```

---

## 5. CI/CD Pipeline

### GitHub Actions (Recommended)
Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm audit --production
      - run: npm install
      - run: npm test

  deploy:
    needs: security-scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      # Vercel deploys automatically via git integration
      # Render deploys automatically via git integration
```

---

## 6. Post-Deployment Checklist

- [ ] Health check: `GET /api/health` returns 200
- [ ] Firebase authentication works (Google + Email + Phone)
- [ ] JWT tokens issued with 15-min expiry
- [ ] Refresh tokens issued and rotation works
- [ ] Socket.IO connection established (check browser console)
- [ ] End-to-end encryption working (keys generated, messages encrypted)
- [ ] File upload works (test with valid and invalid files)
- [ ] Rate limiting working (test with rapid requests)
- [ ] CORS allows frontend origin, blocks others
- [ ] Helmet headers present (check with curl -I)
- [ ] CSP not blocking valid resources (check browser console)
- [ ] Audit log entries created on login/logout
