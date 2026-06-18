const fs = require('fs');
let content = fs.readFileSync('client/src/components/Chat.js', 'utf8');

// Helper: find all occurrences of a string
function findAll(content, str) {
  const positions = [];
  let pos = content.indexOf(str, 0);
  while (pos !== -1) {
    positions.push(pos);
    pos = content.indexOf(str, pos + 1);
  }
  return positions;
}

// Find key markers
const marker1 = 'setChatHistory(parsed)';
const marker2 = 'fetchRecentChats(user.email)';
const marker3 = 'Fetch profiles (including lastSeen)';
const marker4 = 'Failed to load recent chat profiles';
const marker5 = 'Error loading chat history';

const pos1 = content.indexOf(marker1);
const pos2 = content.lastIndexOf(marker2, pos1 + 5000);
const pos3 = content.indexOf(marker3);
const pos4 = content.indexOf(marker4);
const pos5 = content.indexOf(marker5);

console.log('Marker positions:');
console.log('setChatHistory(parsed):', pos1);
console.log('fetchRecentChats(user.email):', pos2);
console.log('Fetch profiles (including lastSeen):', pos3);
console.log('Failed to load recent chat profiles:', pos4);
console.log('Error loading chat history:', pos5);

if (pos1 === -1 || pos3 === -1 || pos4 === -1) {
  console.error('Could not find all required markers');
  process.exit(1);
}

// Find the section to replace
// From "Fetch profiles (including lastSeen)" to the end of the inner try/catch
const startReplace = content.indexOf('\n', pos3 - 200);
const endReplace = content.indexOf('\n', pos4);
// Find the closing of the if block (the next })
const afterPos4 = content.substring(pos4);
let depth = 0;
let endPos = 0;
for (let i = 0; i < afterPos4.length; i++) {
  if (afterPos4[i] === '{') depth++;
  if (afterPos4[i] === '}') {
    depth--;
    if (depth < 0) {
      endPos = pos4 + i + 1;
      break;
    }
  }
}

console.log('Replacing from', startReplace, 'to', endPos);
const oldSection = content.substring(startReplace, endPos);
console.log('OLD SECTION:', oldSection.substring(0, 200) + '...');

// Now let's also fix the localStorage section to add partner profile fetch
const afterChatHistory = content.substring(pos1);
let lsPartnerInsertEnd = 0;
for (let i = 0; i < afterChatHistory.length; i++) {
  if (afterChatHistory[i] === '}') {
    depth--;
    if (depth < 0) {
      lsPartnerInsertEnd = pos1 + i + 1;
      break;
    }
  }
  if (afterChatHistory[i] === '{') depth++;
}

// Create the new sections
const newServerSection = `
          // Fetch profiles for server-based partners too
          const serverPartnerEmails = recentChats.map(c => c.userEmail).filter(Boolean);
          if (serverPartnerEmails.length > 0) {
            fetchProfilesForPartners(serverPartnerEmails);
          }`;

const localStorageProfiles = `
            // Fetch profiles for partners from localStorage right away (always)
            const localPartnerEmails = Object.keys(parsed).filter(
              email => email !== user.email.toLowerCase()
            );
            if (localPartnerEmails.length > 0) {
              fetchProfilesForPartners(localPartnerEmails);
            }`;

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
        }`;

// Step 1: Replace the old server-side profile fetch with just the call
content = content.substring(0, startReplace) + newServerSection + content.substring(endPos);

// Step 2: Add localStorage partner fetch after setChatHistory(parsed);
// Find the first closing brace after setChatHistory(parsed)
const afterSet = content.indexOf('setChatHistory(parsed)');
const firstBrace = content.indexOf('}', afterSet);
const newlineAfterBrace = content.indexOf('\n', firstBrace);

content = content.substring(0, newlineAfterBrace + 1) + localStorageProfiles + content.substring(newlineAfterBrace + 1);

// Step 3: Add the helper function before the catch of the outer try
const errorLoading = content.lastIndexOf('Error loading chat history');
if (errorLoading > 0) {
  // Find the closing brace of the try block, before this catch
  const beforeCatch = content.lastIndexOf('}', errorLoading - 50);
  if (beforeCatch > 0) {
    content = content.substring(0, beforeCatch + 1) + helperFn + content.substring(beforeCatch + 1);
  }
}

fs.writeFileSync('client/src/components/Chat.js', content, 'utf8');
console.log('File updated successfully');
console.log('File size:', content.length);
