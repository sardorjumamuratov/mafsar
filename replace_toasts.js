const fs = require('fs');
let content = fs.readFileSync('src/ui/panel.js', 'utf8');

// Toasts replacements
content = content.replace(/toast\("Exam saved — cards will resurface before it"\)/g, 'toast("Exam date set. Cards will resurface before it.")');
content = content.replace(/toast\("Study set ready!"\)/g, 'toast("Your flashcards are ready")');
content = content.replace(/toast\("Nothing due right now 🎉"\)/g, 'toast("Nothing due right now — you\'re all caught up")');
content = content.replace(/toast\("No cards to code against."\)/g, 'toast("This set has no cards to practise with yet.")');
content = content.replace(/toast\("Session ended."\)/g, 'toast("Practice stopped.")');
content = content.replace(/toast\(\`Submissions are capped at \$\{MAX_CODE_CHARS\} characters\.\`\)/g, 'toast(`That\\\'s too long — keep it under ${MAX_CODE_CHARS} characters.`)');
content = content.replace(/toast\("No cards to practice."\)/g, 'toast("This set has no cards yet.")');
content = content.replace(/toast\("No cards in this set."\)/g, 'toast("This set has no cards yet.")');
content = content.replace(/toast\("No cards to export."\)/g, 'toast("This set has no cards yet.")');
content = content.replace(/toast\("Nothing to import — check separators."\)/g, 'toast("Couldn\'t read that. Check there\\\'s one card per line.")');
content = content.replace(/toast\("The front is required."\)/g, 'toast("Add a question first.")');
content = content.replace(/toast\(\`Signed in as \$\{user\.email\} — syncing…\`\)/g, 'toast("Signed in")');
content = content.replace(/toast\(\`Synced · \$\{r\.pulled\} item\\(s\\) from cloud\`\)/g, 'toast(r.pulled === 0 ? "Up to date" : "Updated from your other devices")');
content = content.replace(/toast\("Syncing…"\);\n\s*/g, ''); 
content = content.replace(/toast\(r\.pulled \|\| r\.pushed \? \`Synced · \$\{r\.pushed\} up, \$\{r\.pulled\} down\` : "Up to date"\);/g, 'toast("Up to date");');
content = content.replace(/toast\("No active tab."\)/g, 'toast("Open a page to capture first.")');
content = content.replace(/toast\(\`Saved · \$\{r\.cards\} cards generated\`\)/g, 'toast(`${r.cards} flashcards ready`)');
content = content.replace(/toast\("Saved — generation failed; open the set to retry"\)/g, 'toast("Saved, but we couldn\\\'t make flashcards. Open the set to try again.")');
content = content.replace(/toast\("Signed out — data stays on this device"\)/g, 'toast("Signed out. Your sets stay on this device.")');

// Non-toast strings
content = content.replace(/"Syncing to the cloud"/g, '"Your sets are backed up"');
content = content.replace(/"Studying locally on this device"/g, '"Everything stays on this device"');
content = content.replace(/"Never synced"/g, '"Not backed up yet"');
content = content.replace(/"Last synced " \+ user\.lastSync\.toLocaleString\(\)/g, '\`Last backed up ${new Date(user.lastSync).toLocaleDateString(undefined, { month: "short", day: "numeric" })}\`');
content = content.replace(/>Cloud sync</g, '>Back up and sync<');

fs.writeFileSync('src/ui/panel.js', content);
