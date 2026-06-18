const fs = require('fs');
let content = fs.readFileSync('client/src/components/Chat.js', 'utf8');

// Check if function exists
if (content.includes('async function fetchProfilesForPartners(emails)')) {
  console.log('Function already exists, skipping');
  process.exit(0);
}

// Find the line with "  }, [user]);" that closes the loadChatHistory useEffect
// After loadChatHistory(); there should be a useEffect closing
const closeMarker = 'loadChatHistory();\n  }, [user]);';
let idx = content.indexOf(closeMarker);
if (idx < 0) {
  // Try with \r\n
  const closeMarker2 = 'loadChatHistory();\r\n  }, [user]);';
  idx = content.indexOf(closeMarker2);
}
if (idx < 0) {
  console.error('Could not find loadChatHistory closing');
  process.exit(1);
}

console.log('Found loadChatHistory closing at index', idx);

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

// Insert after the useEffect closing bracket
const insertPos = idx + closeMarker.length;
content = content.substring(0, insertPos) + helperFn + content.substring(insertPos);

fs.writeFileSync('client/src/components/Chat.js', content, 'utf8');
console.log('✅ Added fetchProfilesForPartners function');
