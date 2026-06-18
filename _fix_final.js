const fs = require('fs');
let content = fs.readFileSync('client/src/components/Chat.js', 'utf8');

// ============================================================
// FIX A: Replace the broken setChatHistory callback
// ============================================================

const brokenPattern = `          // Merge with existing localStorage data, preferring localStorage for full histories
          setChatHistory(prev => {
            const merged = { ...historyFromServer, ...prev };
          // Fetch profiles for server-based partners too
          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);
          if (serverPartnerEmails.length > 0) {
            fetchProfilesForPartners(serverPartnerEmails);
          }
          }
        }`;

const fixedReplacement = `          // Merge with existing localStorage data, preferring localStorage for full histories
          setChatHistory(prev => {
            const merged = { ...historyFromServer, ...prev };
            persistHistory(merged, user.email);
            return merged;
          });
          
          // Fetch profiles for server-based partners
          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);
          if (serverPartnerEmails.length > 0) {
            fetchProfilesForPartners(serverPartnerEmails);
          }
        }`;

const brokenIdx = content.indexOf(brokenPattern);

if (brokenIdx >= 0) {
  content = content.substring(0, brokenIdx) + fixedReplacement + content.substring(brokenIdx + brokenPattern.length);
  console.log('FIX A: Fixed broken setChatHistory callback');
} else {
  console.error('FIX A: Could not find broken setChatHistory pattern');
  // Try alternative: check for slightly different whitespace
  const altPattern = `          setChatHistory(prev => {\n            const merged = { ...historyFromServer, ...prev };\n          // Fetch profiles for server-based partners too\n          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);\n          if (serverPartnerEmails.length > 0) {\n            fetchProfilesForPartners(serverPartnerEmails);\n          }\n          }`;
  const altIdx = content.indexOf(altPattern);
  if (altIdx >= 0) {
    const altReplacement = `          setChatHistory(prev => {\n            const merged = { ...historyFromServer, ...prev };\n            persistHistory(merged, user.email);\n            return merged;\n          });\n          \n          // Fetch profiles for server-based partners\n          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);\n          if (serverPartnerEmails.length > 0) {\n            fetchProfilesForPartners(serverPartnerEmails);\n          }`;
    content = content.substring(0, altIdx) + altReplacement + content.substring(altIdx + altPattern.length);
    console.log('FIX A: Applied alt fix for setChatHistory');
  } else {
    console.log('FIX A alt: Trying to find closing braces pattern...');
    // Find the text "Fetch profiles for server-based partners too" and work from there
    const marker = 'Fetch profiles for server-based partners too';
    const mIdx = content.indexOf(marker);
    if (mIdx >= 0) {
      console.log('Found marker at', mIdx);
      console.log('Context:', content.substring(mIdx - 100, mIdx + 250));
    }
  }
}

// ============================================================
// FIX B: Add the missing fetchProfilesForPartners function
// It needs to be inside the useEffect scope (after loadChatHistory definition)
// ============================================================

const helperFn = `
        // Helper to fetch profiles for a list of partner emails
        async function fetchProfilesForPartners(emails) {
          if (!emails || emails.length === 0) return;
          try {
            const profilesRes = await fetch(\`\${API_URL}/api/users/profiles?emails=\${encodeURIComponent(emails.join(","))}\`);
            const profilesData = await profilesRes.json();
            if (profilesData.success && profilesData.profiles) {
              const newLastSeen = {};
              Object.entries(profilesData.profiles).forEach(([email, profile]) => {
                if (profile.avatarUrl) {
                  setUserProfiles(prev => ({ ...prev, [email]: profile.avatarUrl }));
                }
                if (profile.displayName) {
                  setUserNames(prev => ({ ...prev, [email]: profile.displayName }));
                }
                if (profile.lastSeen) {
                  newLastSeen[email] = profile.lastSeen;
                }
              });
              if (Object.keys(newLastSeen).length > 0) {
                setLastSeen(prev => ({ ...prev, ...newLastSeen }));
              }
            }
          } catch (e) {
            console.warn("Failed to load profiles for partners");
          }
        }
`;

// Check if the function exists
if (content.includes('async function fetchProfilesForPartners(emails)')) {
  console.log('FIX B: fetchProfilesForPartners already exists, skipping');
} else {
  // Find the insertion point: after loadChatHistory() call, before the useEffect closing
  const marker = 'loadChatHistory();\n  }, [user]);';
  const mIdx = content.indexOf(marker);
  if (mIdx >= 0) {
    const insertionPoint = mIdx + marker.length;
    content = content.substring(0, insertionPoint) + '\n' + helperFn + content.substring(insertionPoint);
    console.log('FIX B: Added fetchProfilesForPartners function');
  } else {
    console.error('FIX B: Could not find insertion point');
  }
}

// ============================================================
// FIX C: Fix the typing handler console.log with extra whitespace
// ============================================================

const oldLog = 'console.log(`✅ Typing indicator set for ${normalizedFrom}\n        \n`);';
const newLog = 'console.log(`✅ Typing indicator set for ${normalizedFrom}`);';

const logIdx = content.indexOf(oldLog);
if (logIdx >= 0) {
  content = content.substring(0, logIdx) + newLog + content.substring(logIdx + oldLog.length);
  console.log('FIX C: Fixed typing handler console.log');
} else {
  console.log('FIX C: Pattern not found, might already be fixed');
}

// ============================================================
// Save
// ============================================================

fs.writeFileSync('client/src/components/Chat.js', content, 'utf8');
console.log('\n✅ All fixes applied. File saved.');
