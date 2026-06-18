const fs = require('fs');
let content = fs.readFileSync('client/src/components/Chat.js', 'utf8');

// ============================================================
// Step 1: Show what we're working with - find key areas
// ============================================================

function logContext(label, startIdx, len = 300) {
  if (startIdx >= 0) {
    console.log(`\n=== ${label} at ${startIdx} ===`);
    console.log(content.substring(startIdx, startIdx + len));
  }
}

// Find the broken areas
const brokenCatchIdx = content.indexOf('Fetch profiles for partners from localStorage right away (always)');
const brokenSetStateIdx = content.indexOf('Fetch profiles for server-based partners too');
const helperFnIdx = content.indexOf('async function fetchProfilesForPartners(emails)');
const typingHandlerIdx = content.indexOf('Typing listener triggered');

logContext('Broken catch block', Math.max(0, brokenCatchIdx - 100));
logContext('Broken setState', Math.max(0, brokenSetStateIdx - 100));
logContext('Helper function current location', Math.max(0, helperFnIdx - 100));

// ============================================================
// Step 2: Fix 1 - Remove the injected code from the catch block
// and move it to the right place (inside the try block)
// ============================================================

const catchBlockFix = () => {
  // Find the exact pattern
  const pattern = `          } catch (e) {\n\n            // Fetch profiles for partners from localStorage right away (always)\n            const localPartnerEmails = Object.keys(parsed).filter(\n              email => email !== user.email.toLowerCase()\n            );\n            if (localPartnerEmails.length > 0) {\n              fetchProfilesForPartners(localPartnerEmails);\n            }            console.error("Failed to parse saved chat history", e);`;
  
  const idx = content.indexOf(pattern);
  if (idx === -1) {
    console.error('FIX 1: Pattern not found. Trying alternative...');
    // Try: the pattern after _fix_chat_v2.js ran (newlines might differ)
    const altPattern1 = `          } catch (e) {\r\n\n            // Fetch profiles for partners from localStorage right away (always)\n            const localPartnerEmails = Object.keys(parsed).filter(\n              email => email !== user.email.toLowerCase()\n            );\n            if (localPartnerEmails.length > 0) {\n              fetchProfilesForPartners(localPartnerEmails);\n            }            console.error("Failed to parse saved chat history", e);`;
    const idx2 = content.indexOf(altPattern1);
    if (idx2 >= 0) {
      const replacement2 = `            // Fetch profiles for partners from localStorage right away\n            const localPartnerEmails = Object.keys(parsed).filter(\n              email => email !== user.email.toLowerCase()\n            );\n            if (localPartnerEmails.length > 0) {\n              fetchProfilesForPartners(localPartnerEmails);\n            }\n          } catch (e) {\n            console.error("Failed to parse saved chat history", e);`;
      content = content.substring(0, idx2) + replacement2 + content.substring(idx2 + altPattern1.length);
      console.log('FIX 1a: Applied alt catch block fix');
      return true;
    }
    return false;
  }
  
  const replacement = `            // Fetch profiles for partners from localStorage right away
            const localPartnerEmails = Object.keys(parsed).filter(
              email => email !== user.email.toLowerCase()
            );
            if (localPartnerEmails.length > 0) {
              fetchProfilesForPartners(localPartnerEmails);
            }
          } catch (e) {
            console.error("Failed to parse saved chat history", e);`;
  
  content = content.substring(0, idx) + replacement + content.substring(idx + pattern.length);
  console.log('FIX 1: Applied catch block fix');
  return true;
};

catchBlockFix();

// ============================================================
// Step 3: Fix 2 - Fix the broken setChatHistory callback
// ============================================================

const setStateFix = () => {
  // Find the pattern: setChatHistory(prev => { ... without return, with side effects
  const patterns = [
    `          setChatHistory(prev => {\n            const merged = { ...historyFromServer, ...prev };\n          // Fetch profiles for server-based partners too\n          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);\n          if (serverPartnerEmails.length > 0) {\n            fetchProfilesForPartners(serverPartnerEmails);\n          }\n          }`,
    `          setChatHistory(prev => {\n            const merged = { ...historyFromServer, ...prev };\n          // Fetch profiles for server-based partners too\n          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);\n          if (serverPartnerEmails.length > 0) {\n            fetchProfilesForPartners(serverPartnerEmails);\n          }\n          }\n        }`
  ];
  
  for (const pattern of patterns) {
    const idx = content.indexOf(pattern);
    if (idx >= 0) {
      const replacement = `          setChatHistory(prev => {\n            const merged = { ...historyFromServer, ...prev };\n            persistHistory(merged, user.email);\n            return merged;\n          });\n          \n          // Fetch profiles for server-based partners\n          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);\n          if (serverPartnerEmails.length > 0) {\n            fetchProfilesForPartners(serverPartnerEmails);\n          }`;
      content = content.substring(0, idx) + replacement + content.substring(idx + pattern.length);
      console.log('FIX 2: Applied setChatHistory fix');
      return true;
    }
  }
  
  console.error('FIX 2: Could not find setChatHistory pattern');
  return false;
};

setStateFix();

// ============================================================
// Step 4: Fix 3 - Remove the wrongly placed fetchProfilesForPartners
// function from inside the typing handler's console.log string
// ============================================================

const removeMisplacedHelper = () => {
  // Find the misplaced function inside the console.log template string
  // It was injected after '✅ Typing indicator set for'
  const startMarker = '✅ Typing indicator set for ';
  const startIdx = content.indexOf(startMarker);
  if (startIdx < 0) {
    console.error('FIX 3: Could not find start marker');
    return false;
  }
  
  // Find the end of this console.log statement
  // The console.log starts with ` and ends with `);
  // But the function was injected inside the backtick string
  const afterStart = content.substring(startIdx);
  
  // Find the end: look for `);\n        setTypingUser
  const endMarker = '`);\n        setTypingUser(normalizedFrom);';
  const endIdx = afterStart.indexOf(endMarker);
  
  if (endIdx < 0) {
    console.error('FIX 3: Could not find end marker. EndIdx:', endIdx);
    console.log('Context:', afterStart.substring(0, 500));
    return false;
  }
  
  // Check if there's extra content (the helper function) between start and end
  const innerContent = afterStart.substring(0, endIdx);
  const hasHelper = innerContent.includes('async function fetchProfilesForPartners');
  
  if (hasHelper) {
    console.log('FIX 3: Found helper function in console.log. Length of inner:', innerContent.length);
    // Replace the corrupted console.log with the clean version
    // The original should be just: `✅ Typing indicator set for ${normalizedFrom}`
    const cleanContent = `✅ Typing indicator set for \${normalizedFrom}`;
    content = content.substring(0, startIdx) + cleanContent + content.substring(startIdx + endIdx);
    console.log('FIX 3: Removed misplaced helper function from console.log');
  } else {
    console.log('FIX 3: No helper function found in console.log, checking other locations...');
    return false;
  }
  return true;
};

removeMisplacedHelper();

// ============================================================
// Step 5: Fix 4 - Find the properly placed fetchProfilesForPartners
// (moved by FIX 3 from _fix_chat_v2.js) and move it to the right scope
// The function should be inside the loadChatHistory useEffect, 
// after the catch block, before loadChatHistory() call
// ============================================================

const findAndPlaceHelperCorrectly = () => {
  // First check if the helper is somewhere outside of string literals
  const workIdx = content.indexOf('// Helper to fetch profiles for a list of partner emails');
  
  if (workIdx >= 0) {
    // Find the function end by counting braces
    const fnStart = content.indexOf('async function fetchProfilesForPartners', workIdx);
    if (fnStart < 0) return false;
    
    let depth = 0;
    let fnEnd = fnStart;
    let started = false;
    for (let i = fnStart; i < content.length; i++) {
      if (content[i] === '{') { depth++; started = true; }
      if (content[i] === '}') {
        depth--;
        if (started && depth === 0) {
          fnEnd = i + 1;
          break;
        }
      }
    }
    
    const helperFn = content.substring(workIdx, fnEnd);
    console.log('FIX 4: Found helper function at', workIdx, 'to', fnEnd);
    
    // Remove it from current location
    content = content.substring(0, workIdx) + content.substring(fnEnd);
    
    // Find the right place to insert it:
    // After the closing of loadChatHistory useEffect's catch block
    // and before the loadChatHistory() call
    
    // Find the catch(error) block closing in loadChatHistory
    const catchBlockPattern = '} catch (error) {\n        console.error("Error loading chat history:", error);\n      }';
    const catchEndIdx = content.indexOf(catchBlockPattern) + catchBlockPattern.length;
    
    if (catchEndIdx > catchBlockPattern.length - 1) {
      console.log('FIX 4: Inserting helper after catch block at', catchEndIdx);
      content = content.substring(0, catchEndIdx) + '\n\n' + helperFn + content.substring(catchEndIdx);
      console.log('FIX 4: Helper function placed correctly');
    } else {
      console.error('FIX 4: Could not find catch block end');
      return false;
    }
    
    return true;
  } else {
    console.log('FIX 4: Helper function not found in loadChatHistory');
    return false;
  }
};

findAndPlaceHelperCorrectly();

// ============================================================
// Step 6: Fix 5 - Update the loadProfiles effect to fetch profiles
// for ALL known chat partners, not just the current user
// ============================================================

const fixLoadProfiles = () => {
  // Find the load profiles useEffect
  const pattern = `  // Load profiles from server on mount
  useEffect(() => {
    if (!user) return;
    const loadProfiles = async () => {
      try {
        \n        const res = await fetch(\`\${API_URL}/api/users/profiles?emails=\${encodeURIComponent(user.email)}\`);
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

  const replacement = `  // Load profiles from server on mount
  useEffect(() => {
    if (!user) return;
    const loadProfiles = async () => {
      try {
        // Load profile for current user and all known partners from localStorage
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

  const idx = content.indexOf(pattern);
  if (idx >= 0) {
    content = content.substring(0, idx) + replacement + content.substring(idx + pattern.length);
    console.log('FIX 5: Updated loadProfiles to fetch all partners');
    return true;
  }
  
  // Try alternative: the actual file might have a slightly different pattern
  const altPattern = `  // Load profiles from server on mount\n  useEffect(() => {\n    if (!user) return;\n    const loadProfiles = async () => {\n      try {\n        const res = await fetch(\`\${API_URL}/api/users/profiles?emails=\${encodeURIComponent(user.email)}\`);`;
  const altIdx = content.indexOf(altPattern);
  if (altIdx >= 0) {
    console.log('FIX 5: Found alt pattern at', altIdx);
    console.log('Context:', content.substring(altIdx, altIdx + 500));
  }
  
  return false;
};

fixLoadProfiles();

// ============================================================
// Save
// ============================================================

fs.writeFileSync('client/src/components/Chat.js', content, 'utf8');
console.log('\n✅ File saved successfully');
