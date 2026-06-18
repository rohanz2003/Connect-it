const fs = require('fs');
let content = fs.readFileSync('client/src/components/Chat.js', 'utf8');

// ============================================================
// FIX 1: Fix the broken catch block in localStorage parsing
// The injected code is inside the catch block — move it to try
// ============================================================

// Find: the broken catch block where injected code + console.error are on same line
const catchFixPattern = `          } catch (e) {\n\n            // Fetch profiles for partners from localStorage right away (always)\n            const localPartnerEmails = Object.keys(parsed).filter(\n              email => email !== user.email.toLowerCase()\n            );\n            if (localPartnerEmails.length > 0) {\n              fetchProfilesForPartners(localPartnerEmails);\n            }            console.error("Failed to parse saved chat history", e);`;

const catchFixReplacement = `            // Fetch profiles for partners from localStorage right away
            const localPartnerEmails = Object.keys(parsed).filter(
              email => email !== user.email.toLowerCase()
            );
            if (localPartnerEmails.length > 0) {
              fetchProfilesForPartners(localPartnerEmails);
            }
          } catch (e) {
            console.error("Failed to parse saved chat history", e);`;

const catchFixIndex = content.indexOf(catchFixPattern);

if (catchFixIndex === -1) {
  console.error('FIX 1: Could not find the broken catch block pattern');
  console.log('First match attempt...');
  // Try alternative: find the injected code location
  const altPattern = `            // Fetch profiles for partners from localStorage right away (always)`;
  const altIdx = content.indexOf(altPattern);
  if (altIdx >= 0) {
    console.log('Found alternative pattern at index', altIdx);
    // Show surrounding context
    console.log('Context:', content.substring(altIdx - 200, altIdx + 300));
  }
} else {
  content = content.substring(0, catchFixIndex) + catchFixReplacement + content.substring(catchFixIndex + catchFixPattern.length);
  console.log('FIX 1: Applied catch block fix');
}

// ============================================================
// FIX 2: Fix the broken setChatHistory callback with side effects
// ============================================================

// Find the broken setChatHistory pattern
const setStateFixPattern = `          setChatHistory(prev => {\n            const merged = { ...historyFromServer, ...prev };\n          // Fetch profiles for server-based partners too\n          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);\n          if (serverPartnerEmails.length > 0) {\n            fetchProfilesForPartners(serverPartnerEmails);\n          }\n          }`;

const setStateFixReplacement = `          setChatHistory(prev => {\n            const merged = { ...historyFromServer, ...prev };\n            persistHistory(merged, user.email);\n            return merged;\n          });\n          \n          // Fetch profiles for server-based partners\n          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);\n          if (serverPartnerEmails.length > 0) {\n            fetchProfilesForPartners(serverPartnerEmails);\n          }`;

const setStateFixIndex = content.indexOf(setStateFixPattern);

if (setStateFixIndex === -1) {
  console.error('FIX 2: Could not find the broken setChatHistory pattern');
} else {
  content = content.substring(0, setStateFixIndex) + setStateFixReplacement + content.substring(setStateFixIndex + setStateFixPattern.length);
  console.log('FIX 2: Applied setChatHistory fix');
}

// ============================================================
// FIX 3: Move fetchProfilesForPartners helper function outside the try block
// Currently it's inside the try block of loadChatHistory
// ============================================================

// The function is currently between the if(recentChats) closing and the catch block
// We need to move it to after the catch block but before loadChatHistory() call

const helperFnStart = `        // Helper to fetch profiles for a list of partner emails\n        async function fetchProfilesForPartners(emails) {`;
let helperFnStartIdx = content.indexOf(helperFnStart);

if (helperFnStartIdx === -1) {
  console.error('FIX 3: Could not find fetchProfilesForPartners function start');
} else {
  // Find the closing of the function - count braces
  let depth = 0;
  let foundStart = false;
  let helperEndIdx = helperFnStartIdx;
  for (let i = helperFnStartIdx; i < content.length; i++) {
    if (content[i] === '{') { depth++; foundStart = true; }
    if (content[i] === '}') {
      depth--;
      if (foundStart && depth === 0) {
        helperEndIdx = i + 1;
        break;
      }
    }
  }
  
  const helperFnText = content.substring(helperFnStartIdx, helperEndIdx);
  console.log(`FIX 3: Found fetchProfilesForPartners from ${helperFnStartIdx} to ${helperEndIdx}`);
  console.log('First 80 chars of helper:', helperFnText.substring(0, 80));
  
  // Find the closing of the try block (after the helper function)
  // Find the catch block that comes after the function
  const afterHelper = content.substring(helperEndIdx);
  const catchIdx = afterHelper.indexOf('} catch (error)');
  
  if (catchIdx >= 0) {
    // Remove the function from inside the try block
    content = content.substring(0, helperFnStartIdx) + content.substring(helperEndIdx);
    
    // Find where to insert it - after the try/catch block in loadChatHistory
    // Find the loadChatHistory closing (after the catch block)
    const afterCatch = content.indexOf('} catch (error) {');
    if (afterCatch >= 0) {
      // Find the closing } of the catch block
      let catchDepth = 0;
      let catchEndIdx = afterCatch;
      let foundCatchStart = false;
      for (let i = afterCatch; i < content.length; i++) {
        if (content[i] === '{') { catchDepth++; foundCatchStart = true; }
        if (content[i] === '}') {
          catchDepth--;
          if (foundCatchStart && catchDepth === 0) {
            catchEndIdx = i + 1;
            break;
          }
        }
      }
      
      // Insert the helper function after the catch block
      content = content.substring(0, catchEndIdx) + '\n' + helperFnText + '\n' + content.substring(catchEndIdx);
      console.log(`FIX 3: Moved fetchProfilesForPartners after catch block at index ${catchEndIdx}`);
    } else {
      console.error('FIX 3: Could not find catch block');
    }
  } else {
    console.error('FIX 3: Could not find catch after helper function');
  }
}

// ============================================================
// FIX 4: Fix the on-mount loadProfiles to also fetch profiles for
// known chat partners (not just the current user)
// ============================================================

// The current loadProfiles only fetches the current user's own profile
// We need it to also fetch profiles for partners from localStorage
const loadProfilesPattern = `  // Load profiles from server on mount
  useEffect(() => {
    if (!user) return;
    const loadProfiles = async () => {
      try {
        const res = await fetch(\`\${API_URL}/api/users/profiles?emails=\${encodeURIComponent(user.email)}\`);
        const data = await res.json();
        if (data.success && data.profiles) {
          const newLastSeen = {};
          Object.entries(data.profiles).forEach(([email, profile]) => {
            if (profile.avatarUrl) {
              setUserProfiles(prev => ({ ...prev, [email]: profile.avatarUrl }));
              try { localStorage.setItem(\`profilePic_\${email}\`, profile.avatarUrl); } catch {}
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
        console.warn("Failed to load profiles from server");
      }
    };
    loadProfiles();
  }, [user]);`;

const loadProfilesReplacement = `  // Load profiles from server on mount
  useEffect(() => {
    if (!user) return;
    const loadProfiles = async () => {
      try {
        // Load profile for current user and all known partners
        const savedHistory = localStorage.getItem(\`chatHistory_\${user.email}\`);
        let knownEmails = [user.email];
        if (savedHistory) {
          try {
            const parsed = JSON.parse(savedHistory);
            const partnerEmails = Object.keys(parsed).filter(e => e !== user.email.toLowerCase());
            knownEmails = [...new Set([...knownEmails, ...partnerEmails])];
          } catch {}
        }
        
        const res = await fetch(\`\${API_URL}/api/users/profiles?emails=\${encodeURIComponent(knownEmails.join(","))}\`);
        const data = await res.json();
        if (data.success && data.profiles) {
          const newLastSeen = {};
          Object.entries(data.profiles).forEach(([email, profile]) => {
            if (profile.avatarUrl) {
              setUserProfiles(prev => ({ ...prev, [email]: profile.avatarUrl }));
              try { localStorage.setItem(\`profilePic_\${email}\`, profile.avatarUrl); } catch {}
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
        console.warn("Failed to load profiles from server");
      }
    };
    loadProfiles();
  }, [user]);`;

const loadProfilesIdx = content.indexOf(loadProfilesPattern);

if (loadProfilesIdx === -1) {
  console.error('FIX 4: Could not find loadProfiles pattern. Searching for partial match...');
  // Try to find partial match
  const partialPattern = `const res = await fetch(\`\${API_URL}/api/users/profiles?emails=\${encodeURIComponent(user.email)}\`)`;
  const partialIdx = content.indexOf(partialPattern);
  if (partialIdx >= 0) {
    console.log('Found partial match at index', partialIdx);
    console.log('Context:', content.substring(partialIdx - 300, partialIdx));
  } else {
    console.error('Could not find partial match either');
  }
} else {
  content = content.substring(0, loadProfilesIdx) + loadProfilesReplacement + content.substring(loadProfilesIdx + loadProfilesPattern.length);
  console.log('FIX 4: Applied loadProfiles fix');
}

// ============================================================
// Save the file
// ============================================================

fs.writeFileSync('client/src/components/Chat.js', content, 'utf8');
console.log('\n✅ All fixes applied. File saved.');
console.log('File size:', content.length, 'chars');
