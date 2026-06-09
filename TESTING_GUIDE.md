# Profile Picture Feature - Testing Guide

## Quick Test Checklist

### ✅ Basic Upload Functionality
- [ ] Click settings icon in chat
- [ ] Click "Change Photo" button
- [ ] Select an image from file system
- [ ] Verify crop modal appears (not error page)
- [ ] Zoom in/out on the image
- [ ] Drag to reposition image
- [ ] Click "Crop & Save"
- [ ] Verify profile picture updates in UI

### ✅ Profile Picture Display
- [ ] Profile picture shows in settings modal
- [ ] Profile picture shows in chat header (when viewing own profile)
- [ ] Profile picture shows in user sidebar
- [ ] Profile picture shows for other users in their sidebar
- [ ] Clicking avatar opens profile preview modal

### ✅ Real-time Updates (Multi-Device)
**Setup:** Open the app in 2+ browser tabs/devices with the same user account

- [ ] Upload profile picture in Tab 1
- [ ] Verify it appears in Tab 2 without refresh
- [ ] Remove profile picture in Tab 1
- [ ] Verify removal reflects in Tab 2 without refresh
- [ ] Close and reopen Tab 2
- [ ] Verify profile picture persists after reconnection

### ✅ Profile Picture Removal
- [ ] Open settings
- [ ] Click "Remove" button
- [ ] Verify profile picture is removed
- [ ] Verify fallback initials appear
- [ ] Verify removal syncs to other devices
- [ ] Verify removal persists after page refresh

### ✅ Error Handling
- [ ] Try to upload a non-image file (should show error)
- [ ] Try to upload a file >5MB (should show error)
- [ ] Try to upload a corrupted image (should show error, not crash)
- [ ] Test with no internet connection (should show error gracefully)

### ✅ Other Users' Perspective
**Setup:** Have 2 different users logged in

- [ ] User A uploads profile picture
- [ ] User B sees User A's new profile picture in user list
- [ ] User A removes profile picture
- [ ] User B sees fallback initials for User A
- [ ] Both users can see each other's profile pictures

## Detailed Test Scenarios

### Scenario 1: First-time Profile Picture Upload
1. Login to the app
2. Click settings icon (gear icon)
3. In settings modal, click "Change Photo" button
4. Select an image from your computer (JPG, PNG, etc.)
5. **Expected:** Crop modal appears with image loaded
6. Adjust zoom slider and drag to position image
7. Click "Crop & Save"
8. **Expected:** Settings modal closes, profile picture appears everywhere

### Scenario 2: Replacing Existing Profile Picture
1. Already have a profile picture set
2. Click settings icon
3. Click "Change Photo"
4. Select a different image
5. Crop and save
6. **Expected:** Old picture replaced with new one everywhere

### Scenario 3: Removing Profile Picture
1. Have a profile picture set
2. Click settings icon
3. Click "Remove" button
4. **Expected:** Profile picture disappears, initials shown instead
5. Refresh the page
6. **Expected:** Initials still shown (removal persisted)

### Scenario 4: Multi-device Sync (Same User)
1. Open app in Chrome as User A
2. Open app in Firefox as User A (same account)
3. In Chrome: Upload a profile picture
4. **Expected:** Firefox shows the profile picture immediately
5. In Firefox: Remove the profile picture
6. **Expected:** Chrome shows initials immediately

### Scenario 5: Cross-user Visibility
1. Login as User A in Browser 1
2. Login as User B in Browser 2
3. User A: Upload profile picture
4. **Expected:** User B sees User A's profile picture in user list
5. User A: Remove profile picture
6. **Expected:** User B sees User A's initials

### Scenario 6: Network Issues
1. Upload a profile picture (works normally)
2. Disconnect internet
3. Try to upload another picture
4. **Expected:** Error message shown, old picture remains
5. Reconnect internet
6. Try again
7. **Expected:** Works normally

### Scenario 7: Large File Handling
1. Try to upload an image larger than 5MB
2. **Expected:** Error message: "Image must be under 5MB"
3. Try to upload an image under 5MB
4. **Expected:** Works normally

### Scenario 8: Invalid File Types
1. Try to upload a PDF file
2. **Expected:** Error message: "Please select an image file"
3. Try to upload a video file
4. **Expected:** Error message: "Please select an image file"
5. Try to upload an actual image
6. **Expected:** Works normally

## Common Issues & Solutions

### Issue: Crop modal shows "Loading..." forever
**Cause:** Image failed to load due to corruption or format issue
**Solution:** Click Cancel, try a different image file

### Issue: Profile picture not syncing to other devices
**Cause:** Socket connection issue or browser cache
**Solution:** 
1. Check browser console for socket errors
2. Hard refresh the page (Ctrl+Shift+R)
3. Check server logs for socket broadcasting

### Issue: Profile picture appears as initials after refresh
**Cause:** localStorage cleared or quota exceeded
**Solution:**
1. Check browser localStorage quota
2. Upload profile picture again
3. Check if browser is in private/incognito mode

### Issue: "Failed to crop image" error
**Cause:** Canvas API issue or memory constraint
**Solution:**
1. Try a smaller image file
2. Refresh the page and try again
3. Try a different browser

## Browser Console Commands (for debugging)

Check if user has profile picture stored:
```javascript
localStorage.getItem('profilePic_' + JSON.parse(localStorage.getItem('user')).email)
```

Check all stored profiles:
```javascript
JSON.parse(localStorage.getItem('userProfiles_' + JSON.parse(localStorage.getItem('user')).email))
```

Check current user data:
```javascript
JSON.parse(localStorage.getItem('user'))
```

Clear profile picture (for testing):
```javascript
localStorage.removeItem('profilePic_' + JSON.parse(localStorage.getItem('user')).email)
```

## Performance Benchmarks

- Profile picture upload: < 2 seconds
- Crop modal load: < 1 second  
- Real-time sync: < 500ms
- Profile picture display: Instant

## Browser Compatibility

Tested and working on:
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile Chrome (Android)
- ✅ Mobile Safari (iOS)

## Server Logs to Monitor

Watch for these log messages:
- `✅ Profile updated in DB for [email]`
- `✅ Profile picture removed from DB for [email]`
- `📡 Broadcasting profile update for [email] to all clients`
- `📡 Broadcasting profile pic removal for [email] to all clients`
- `📡 Joining socket with data: { email, hasProfilePic }`

## Report Issues

If you encounter any issues, collect:
1. Browser console errors
2. Server console logs
3. Steps to reproduce
4. Screenshots/screen recording
5. Device/browser information
