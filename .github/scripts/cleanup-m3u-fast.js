const fs = require('fs');

function cleanM3u(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Split into lines and process each line
  content = content.split('\n')
    .map(line => {
      // Trim any whitespace
      line = line.trim();
      
      if (line.startsWith('#EXTINF')) {
        // Replace multiple spaces with single space
        line = line.replace(/\s+/g, ' ');
        
        // Instead of splitting by comma, find the position of the first comma
        // This preserves the channel name and any commas it might contain
        const firstCommaPos = line.indexOf(',');
        
        if (firstCommaPos !== -1) {
          const extinf = line.substring(0, firstCommaPos);
          const title = line.substring(firstCommaPos + 1).trim(); // Trim space after comma
          
          return `${extinf},${title}`;
        }
      } else {
        // For non-EXTINF lines, just replace multiple spaces with single space
        line = line.replace(/\s+/g, ' ');
      }
      
      return line;
    })
    .filter(line => line) // Remove empty lines
    .join('\n');
    
  // Ensure single newline at end of file
  content = content.trim() + '\n';
  
  fs.writeFileSync(filePath, content);
  console.log('Basic cleanup of StreamOn-T1.m3u completed');
}

const filePath = process.argv[2];

if (!filePath) {
  console.error('Please provide the path to StreamOn-T1.m3u');
  process.exit(1);
}

try {
  cleanM3u(filePath);
} catch (error) {
  console.error('Error cleaning StreamOn-T1.m3u:', error.message);
  process.exit(1);
}
