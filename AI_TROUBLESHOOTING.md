# 🔧 AI Chatbot Troubleshooting Guide

## ✅ Fixed Issues

### Issue #1: AI Not Responding ✅ FIXED
**Problem:** AI chatbot didn't give responses when messages were sent.

**Root Causes:**
1. Node-fetch import issue (dynamic import not working properly)
2. Streaming response parsing issues
3. Buffer handling in stream reader

**Solutions Applied:**
- ✅ Changed from dynamic import to regular require for node-fetch
- ✅ Improved stream chunk parsing with better buffer handling
- ✅ Added detailed console logging for debugging
- ✅ Better error handling and messages

### Issue #2: Poor Icon Quality ✅ FIXED
**Problem:** AI bot used emoji (🤖) which looked inconsistent.

**Solution Applied:**
- ✅ Replaced with professional MessageSquare icon from lucide-react
- ✅ Added custom SVG layered icon in sidebar
- ✅ Enhanced with sparkle animations
- ✅ Consistent styling across all AI components

---

## 🚀 How to Start and Test

### Step 1: Start the Server
```bash
cd server
npm start
```

**Expected Output:**
```
=== Server Starting ===
✅ MongoDB Connected
✅ Socket.IO Started
✅ Server running on port 5000 🚀
=== Startup Complete ===
```

### Step 2: Start the Client
```bash
cd client
npm start
```

**Expected Output:**
```
Compiled successfully!

You can now view client in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000
```

### Step 3: Test AI Chat
1. Open http://localhost:3000
2. Login to your account
3. Click "AI Assistant" in the sidebar (look for the purple gradient icon)
4. Type a message: "Hello, who are you?"
5. **Watch the server console** - you should see:
   ```
   🤖 Starting streaming response...
   ✅ Streaming complete. Total length: XXX
   ```
6. **Watch the browser** - AI should respond word-by-word

---

## 🐛 Common Issues & Quick Fixes

### Issue: "Failed to fetch" Error

**Symptoms:**
- Error message in browser console
- No response from AI

**Diagnosis:**
```bash
# Check if server is running
curl http://localhost:5000/api/health

# Expected: {"ok":true,...}
```

**Fix:**
```bash
# Restart server
cd server
# Press Ctrl+C to stop
npm start
```

---

### Issue: AI Typing Forever (No Response)

**Symptoms:**
- Typing indicator shows but never stops
- No response appears

**Diagnosis:**
Check server logs for:
```
❌ OpenRouter API error: 401
❌ OpenRouter API error: 429
```

**Fix:**

**If you see 401 (Unauthorized):**
```bash
# Check if API key is set
echo $OPENROUTER_API_KEY  # Linux/Mac
echo %OPENROUTER_API_KEY%  # Windows

# If empty, add to server/.env:
OPENROUTER_API_KEY=your_actual_key_here
```

**If you see 429 (Rate Limit):**
- Free tier has rate limits
- Wait a few minutes and try again
- Consider upgrading OpenRouter plan

---

### Issue: "Cannot read property of undefined" in Console

**Symptoms:**
- JavaScript error in browser console
- Chat doesn't work

**Fix:**
```bash
# Clear browser cache
# Press Ctrl+Shift+R (hard refresh)

# Or rebuild client
cd client
rm -rf build node_modules package-lock.json
npm install
npm start
```

---

### Issue: Socket Not Connected

**Symptoms:**
- "Socket not connected" in console
- Messages don't send

**Diagnosis:**
```javascript
// In browser console, check:
socket.connected  // Should be true
```

**Fix:**
1. Check if server is running on port 5000
2. Check firewall settings
3. Restart both server and client

---

### Issue: Empty Response from AI

**Symptoms:**
- AI responds but message is empty
- Only shows timestamp

**Server Logs to Check:**
```
Look for:
✅ AI response received: [content here]

If you see:
✅ AI response received: ...
```

**Fix:**
- This means OpenRouter returned empty response
- Try with a different message
- Check OpenRouter status: https://openrouter.ai/status

---

## 📊 Debug Checklist

### Server-Side Checks:
```bash
# 1. MongoDB connected?
# Look for: ✅ MongoDB Connected

# 2. Socket.IO started?
# Look for: ✅ Socket.IO Started

# 3. AI route loaded?
# Look for: Routes Loaded ✅

# 4. API key set?
grep OPENROUTER_API_KEY server/.env
# Should show: OPENROUTER_API_KEY=sk-or-v1-...

# 5. Test AI endpoint directly:
curl -X POST http://localhost:5000/api/ai/message \
  -H "Content-Type: application/json" \
  -d '{"userId":"test@test.com","message":"Hello"}'

# Expected: {"success":true,"response":"Hello! I'm..."}
```

### Client-Side Checks:
```javascript
// Open browser console (F12)

// 1. Socket connected?
console.log(socket.connected);  // Should be: true

// 2. User object exists?
console.log(user);  // Should show: {email: "...", ...}

// 3. Selected AI?
console.log(selectedAI);  // Should be: true (when AI chat open)

// 4. Check for errors:
// Look for red error messages in console
```

---

## 🔍 Server Log Examples

### ✅ Successful AI Interaction:
```
🤖 Starting streaming response...
✅ AI response received: Hello! I'm your friendly AI a...
✅ Streaming complete. Total length: 150
```

### ❌ API Key Error:
```
❌ OpenRouter API error: 401 Unauthorized
Error: OpenRouter API key not configured
```

### ❌ Network Error:
```
❌ Stream error: FetchError: request to https://openrouter.ai failed
```

### ❌ Rate Limit:
```
❌ OpenRouter API error: 429 Too Many Requests
```

---

## 💡 Performance Tips

### 1. Reduce Response Time
```javascript
// In server/services/aiService.js
// Reduce max_tokens for faster responses:
max_tokens: 500,  // Default: 1000
```

### 2. Clear Old Conversations
```bash
# In MongoDB, run:
db.aiconversations.deleteMany({ 
  lastMessageAt: { $lt: new Date(Date.now() - 30*24*60*60*1000) } 
})
```

### 3. Monitor API Usage
- Check OpenRouter dashboard
- Track requests per day
- Monitor costs (if on paid plan)

---

## 🎯 Quick Test Script

Save this as `test-ai.js` in server folder:

```javascript
require('dotenv').config();
const { getChatCompletion } = require('./services/aiService');

async function test() {
  console.log('🧪 Testing AI service...');
  
  try {
    const response = await getChatCompletion([
      { role: 'user', content: 'Say hello in 5 words' }
    ]);
    
    console.log('✅ Response:', response);
    console.log('✅ AI service working!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test();
```

**Run it:**
```bash
cd server
node test-ai.js
```

**Expected Output:**
```
🧪 Testing AI service...
🤖 Calling OpenRouter API...
✅ AI response received: Hello! Nice to meet you...
✅ Response: Hello! Nice to meet you!
✅ AI service working!
```

---

## 📞 Still Having Issues?

### Check These Files:

1. **server/.env**
   - Has OPENROUTER_API_KEY?
   - Has MONGO_URI?

2. **server/services/aiService.js**
   - Line 1: `const fetch = require('node-fetch');`
   - Should NOT be: `const fetch = (...args) => import('node-fetch')...`

3. **client/src/components/AIChat.js**
   - Has correct imports
   - Socket listeners properly set up

### Test Individual Components:

**Test Socket:**
```javascript
// In browser console:
socket.emit('ai-message', {
  userId: 'test@test.com',
  message: 'Hello',
  tempId: 'test123'
});

// Watch for:
socket.on('ai-stream-chunk', (data) => {
  console.log('Chunk:', data.chunk);
});
```

**Test REST API:**
```bash
# Test without socket:
curl -X POST http://localhost:5000/api/ai/message \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test@test.com",
    "message": "What is 2+2?"
  }'
```

---

## ✨ Verification Checklist

Before reporting an issue, verify:

- [ ] Server is running (port 5000)
- [ ] Client is running (port 3000)
- [ ] MongoDB is connected
- [ ] API key is set in .env
- [ ] No errors in server console
- [ ] No errors in browser console
- [ ] Socket is connected (socket.connected === true)
- [ ] Can see AI Assistant in sidebar
- [ ] Clicking AI Assistant opens chat
- [ ] Can type in input field
- [ ] Send button is not disabled

---

## 🎉 Success Indicators

You know it's working when you see:

**In Server Console:**
```
✅ MongoDB Connected
✅ Socket.IO Started
✅ Server running on port 5000
🤖 Starting streaming response...
✅ Streaming complete
```

**In Browser:**
- AI Assistant visible in sidebar
- Purple gradient icon with sparkle
- Click opens full chat interface
- Messages send and AI responds
- Response appears word-by-word
- No errors in console

**In AI Chat:**
- Welcome screen shows (if no previous messages)
- Can type and send messages
- Typing indicator appears
- Response streams in real-time
- Timestamps show on messages
- Can clear conversation

---

## 📚 Additional Resources

- OpenRouter Docs: https://openrouter.ai/docs
- OpenRouter Status: https://status.openrouter.ai
- OpenRouter Dashboard: https://openrouter.ai/keys
- Node-fetch Docs: https://github.com/node-fetch/node-fetch

---

**Last Updated:** After fixing AI response issue and improving icons
**Status:** ✅ All known issues resolved
