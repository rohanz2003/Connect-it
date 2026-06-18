const fs = require('fs');
let content = fs.readFileSync('client/src/components/Chat.js', 'utf8');

// Find the loadProfiles section - the key marker is the single-email fetch
const oldFetch = 'const res = await fetch(`${API_URL}/api/users/profiles?emails=${encodeURIComponent(user.email)}`);';

// Check if it's already been fixed
if (content.includes('knownEmails')) {
  console.log('loadProfiles already fixed');
  process.exit(0);
}

const idx = content.indexOf(oldFetch);
if (idx < 0) {
  console.error('Could not find loadProfiles fetch URL');
  process.exit(1);
}

// Show context around the fetch
const contextStart = Math.max(0, idx - 300);
const contextEnd = Math.min(content.length, idx + 200);
console.log('Context around fetch URL:');
console.log(content.substring(contextStart, contextEnd));

// Replace the section that just fetches user.email with one that fetches all partners
const beforeSection = content.substring(contextStart, idx);
const afterSection = content.substring(idx);

// Find the start of the try block
const tryStart = beforeSection.lastIndexOf('try {');
if (tryStart < 0) {
  console.error('Could not find try block start');
  process.exit(1);
}

// Find the closing of the loadProfiles function  
// Look for "loadProfiles();" after our section
const loadProfilesCall = content.indexOf('loadProfiles();', idx);
if (loadProfilesCall < 0) {
  console.error('Could not find loadProfiles() call');
  process.exit(1);
}

// Find the closing of the useEffect after loadProfiles()
const useEffectClose = content.indexOf('}, [user]);', loadProfilesCall);
let sectionEnd = useEffectClose;
if (sectionEnd < 0) {
  console.error('Could not find useEffect closing');
  process.exit(1);
}
// Include the closing
sectionEnd += '}, [user]);'.length;

const oldSection = content.substring(tryStart, sectionEnd);

const newSection = `      try {\n        // Load profile for current user and all known partners from localStorage\n        const savedHistory = localStorage.getItem(\`chatHistory_\${user.email}\`);\n        let knownEmails = [user.email];\n        if (savedHistory) {\n          try {\n            const parsed = JSON.parse(savedHistory);\n            const partnerEmails = Object.keys(parsed).filter(e => e !== user.email.toLowerCase());\n            knownEmails = [...new Set([...knownEmails, ...partnerEmails])];\n          } catch {}\n        }\n        \n        const res = await fetch(\`\${API_URL}/api/users/profiles?emails=\${encodeURIComponent(knownEmails.join(","))}\`);\n        const data = await res.json();\n        if (data.success && data.profiles) {\n          const newLastSeen = {};\n          Object.entries(data.profiles).forEach(([email, profile]) => {\n            if (profile.avatarUrl) {\n              setUserProfiles(prev => ({ ...prev, [email]: profile.avatarUrl }));\n              try { localStorage.setItem(\`profilePic_\${email}\`, profile.avatarUrl); } catch {}\n            }\n            if (profile.displayName) {\n              setUserNames(prev => ({ ...prev, [email]: profile.displayName }));\n            }\n            if (profile.lastSeen) {\n              newLastSeen[email] = profile.lastSeen;\n            }\n          });\n          if (Object.keys(newLastSeen).length > 0) {\n            setLastSeen(prev => ({ ...prev, ...newLastSeen }));\n          }\n        }\n      } catch (e) {\n        console.warn("Failed to load profiles from server");\n      }\n    };\n    loadProfiles();\n  }, [user]);`;

content = content.substring(0, tryStart) + newSection + content.substring(sectionEnd);

fs.writeFileSync('client/src/components/Chat.js', content, 'utf8');
console.log('✅ loadProfiles fixed to fetch all partners');
