const fs = require('fs');

function sortM3uByGroupTitle(filePath) {
  // Read the file
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // First line should be #EXTM3U
  const header = lines[0];
  if (!header.startsWith('#EXTM3U')) {
    throw new Error('Invalid M3U file: Missing #EXTM3U header');
  }
  
  // Group the entries
  const entries = [];
  let currentEntry = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    if (line.startsWith('#EXTINF')) {
      // If we have a previous entry that's complete (has a URL), add it
      if (currentEntry.length > 0 && !currentEntry[currentEntry.length - 1].startsWith('#')) {
        entries.push(currentEntry);
        currentEntry = [];
      }
      
      // Start a new entry
      currentEntry = [line];
    } else if (line.startsWith('#')) {
      // This is another directive line (like #EXTVLCOPT), add it to the current entry
      if (currentEntry.length > 0) {
        currentEntry.push(line);
      }
    } else {
      // This is a URL line, add it to complete the current entry
      if (currentEntry.length > 0) {
        currentEntry.push(line);
        entries.push(currentEntry);
        currentEntry = [];
      }
    }
  }
  
  // Add the last entry if complete
  if (currentEntry.length > 0 && !currentEntry[currentEntry.length - 1].startsWith('#')) {
    entries.push(currentEntry);
  }
  
  // Sort entries by group-title
  entries.sort((a, b) => {
    const groupTitleA = (a[0].match(/group-title="([^"]*)"/) || [])[1] || '';
    const groupTitleB = (b[0].match(/group-title="([^"]*)"/) || [])[1] || '';
    return groupTitleA.localeCompare(groupTitleB);
  });
  
  // Rebuild the file content
  const sortedContent = [
    header,
    ...entries.flatMap(entry => entry)
  ].join('\n');
  
  // Write back to file
  fs.writeFileSync(filePath, sortedContent);
  console.log('M3U file has been sorted by group-title');
}

// Get file path from command line argument
const filePath = process.argv[2];
if (!filePath) {
  console.error('Please provide a file path');
  process.exit(1);
}

try {
  sortM3uByGroupTitle(filePath);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}