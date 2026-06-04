const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/cron/run-timelog?schedule=hourly&test=true&stream=true&dryRun=true',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    // Parse event stream chunk
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('data: ')) {
        try {
          const data = JSON.parse(line.trim().substring(6));
          if (data.status === 'final') {
            console.log('\nFINAL DATA:', JSON.stringify(data.data, null, 2));
          } else {
            console.log(`[Stream Log] ${data.status.toUpperCase()}: ${data.message}`);
          }
        } catch (e) {
          // not json
          console.log(`[Raw Chunk Line] ${line}`);
        }
      }
    }
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.end();
