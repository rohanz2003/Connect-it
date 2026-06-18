const fs = require('fs');
let content = fs.readFileSync('client/src/components/Chat.js', 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);

// ============================================================
// FIX A: Fix broken setChatHistory callback
// Find lines containing the broken code and replace them
// ============================================================

// Find the line with "Fetch profiles for server-based partners too"
let serverProfilesLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Fetch profiles for server-based partners too')) {
    serverProfilesLine = i;
    break;
  }
}
console.log('Server profiles line:', serverProfilesLine);

if (serverProfilesLine >= 0) {
  // Work backwards to find the setChatHistory(prev => { line
  let setStateLine = -1;
  for (let i = serverProfilesLine; i >= 0; i--) {
    if (lines[i].includes('setChatHistory(prev => {')) {
      setStateLine = i;
      break;
    }
  }
  console.log('setChatHistory line:', setStateLine);
  
  // Find the closing of the setChatHistory callback
  let endStateLine = serverProfilesLine;
  for (let i = serverProfilesLine; i < lines.length; i++) {
    if (lines[i].trim() === '}' || lines[i].trim() === '}' || lines[i].trim() === '}') {
      // Check if this closes the setChatHistory callback
      // It should be followed by nothing or another }
      const nextLineTrim = (lines[i+1] || '').trim();
      if (nextLineTrim === '' || nextLineTrim === '}' || nextLineTrim.startsWith('//') || nextLineTrim.startsWith('const')) {
        endStateLine = i;
        break;
      }
    }
  }
  console.log('End state line:', endStateLine);
  
  if (setStateLine >= 0 && endStateLine > setStateLine) {
    // Build the replacement lines
    const replacement = [
      '          // Merge with existing localStorage data, preferring localStorage for full histories',
      '          setChatHistory(prev => {',
      '            const merged = { ...historyFromServer, ...prev };',
      '            persistHistory(merged, user.email);',
      '            return merged;',
      '          });',
      '          ',
      '          // Fetch profiles for server-based partners',
      '          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);',
      '          if (serverPartnerEmails.length > 0) {',
      '            fetchProfilesForPartners(serverPartnerEmails);',
      '          }',
    ];
    
    // Remove old lines and insert new ones
    const before = lines.slice(0, setStateLine);
    const after = lines.slice(endStateLine + 1);
    const newLines = [...before, ...replacement, ...after];
    lines.length = 0;
    lines.push(...newLines);
    console.log('FIX A: Fixed setChatHistory callback. New total lines:', lines.length);
  }
}

// ============================================================
// FIX B: Add the missing fetchProfilesForPartners helper function
// ============================================================

// Check if the function already exists
let hasHelper = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('async function fetchProfilesForPartners')) {
    hasHelper = true;
    break;
  }
}

if (!hasHelper) {
  // Find the line where loadChatHistory(); is called
  let loadChatLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('loadChatHistory();')) {
      loadChatLine = i;
      break;
    }
  }
  console.log('loadChatHistory(); line:', loadChatLine);
  
  if (loadChatLine >= 0) {
    // Find where the useEffect ends (the line with "], [user]);")
    let effectEndLine = -1;
    for (let i = loadChatLine; i < lines.length; i++) {
      if (lines[i].includes('], [user]);')) {
        effectEndLine = i;
        break;
      }
    }
    console.log('useEffect end line:', effectEndLine);
    
    if (effectEndLine >= 0 && effectEndLine > loadChatLine) {
      const helperFn = [
        '',
        '        // Helper to fetch profiles for a list of partner emails',
        '        async function fetchProfilesForPartners(emails) {',
        '          if (!emails || emails.length === 0) return;',
        '          try {',
        '            const profilesRes = await fetch(`${API_URL}/api/users/profiles?emails=${encodeURIComponent(emails.join(","))}`);',
        '            const profilesData = await profilesRes.json();',
        '            if (profilesData.success && profilesData.profiles) {',
        '              const newLastSeen = {};',
        '              Object.entries(profilesData.profiles).forEach(([email, profile]) => {',
        '                if (profile.avatarUrl) {',
        '                  setUserProfiles(prev => ({ ...prev, [email]: profile.avatarUrl }));',
        '                }',
        '                if (profile.displayName) {',
        '                  setUserNames(prev => ({ ...prev, [email]: profile.displayName }));',
        '                }',
        '                if (profile.lastSeen) {',
        '                  newLastSeen[email] = profile.lastSeen;',
        '                }',
        '              });',
        '              if (Object.keys(newLastSeen).length > 0) {',
        '                setLastSeen(prev => ({ ...prev, ...newLastSeen }));',
        '              }',
        '            }',
        '          } catch (e) {',
        '            console.warn("Failed to load profiles for partners");',
        '          }',
        '        }',
      ];
      
      // Insert the helper function before the useEffect closing
      const before = lines.slice(0, effectEndLine);
      const after = lines.slice(effectEndLine);
      const newLines = [...before, ...helperFn, ...after];
      lines.length = 0;
      lines.push(...newLines);
      console.log('FIX B: Added fetchProfilesForPartners function');
    }
  }
} else {
  console.log('FIX B: fetchProfilesForPartners already exists, skipping');
}

// ============================================================
// FIX C: Fix the typing handler console.log with extra newline
// ============================================================

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('Typing indicator set for') && line.includes('\\n')) {
    // Fix the extra newline in the console.log
    lines[i] = line.replace(
      'Typing indicator set for ${normalizedFrom}\\n        \\n',
      'Typing indicator set for ${normalizedFrom}'
    );
    console.log('FIX C: Fixed typing handler console.log at line', i);
    break;
  }
}

// ============================================================
// Save
// ============================================================

content = lines.join('\n');
fs.writeFileSync('client/src/components/Chat.js', content, 'utf8');
console.log('\n✅ File saved. Total chars:', content.length);
