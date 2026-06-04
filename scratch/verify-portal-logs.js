const http = require('http');
const fs = require('fs');
const path = require('path');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/portal-logs?bypassAuth=true',
  method: 'GET'
};

console.log('Requesting portal logs scraper at /api/portal-logs?bypassAuth=true...');
const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      console.log('SUCCESS:', data.success);
      if (data.success) {
        console.log(`Successfully scraped ${data.logs.length} logs.`);
        // Check if scratch diagnostic file was written
        const diagPath = path.join(__dirname, 'scraped_logs.json');
        if (fs.existsSync(diagPath)) {
          console.log(`Verified diagnostic log file exists at: ${diagPath}`);
        } else {
          console.log('Warning: diagnostic log file not found in scratch directory.');
        }
      } else {
        console.error('Error response:', data);
      }
    } catch (e) {
      console.error('Failed to parse response body:', body);
    }
  });
});

req.on('error', (e) => {
  console.error(`Scraper request failed: ${e.message}`);
});

req.end();
