const http = require('http');

async function testHour(hour) {
  return new Promise((resolve) => {
    console.log(`\n=================== Testing Hour: ${hour} ===================`);
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/cron/run-timelog?schedule=hourly&dryRun=true&userId=581f44dd-ee1b-4c93-8ead-0d292a994ed5&hour=${hour}&stream=true`,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(line.trim().substring(6));
              if (data.status === 'final') {
                console.log('FINAL RESULT:', JSON.stringify(data.data, null, 2));
              } else {
                console.log(`[Stream Log] ${data.status.toUpperCase()}: ${data.message}`);
              }
            } catch (e) {
              // not json
            }
          }
        }
      });
      res.on('end', () => {
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(`Error requesting for hour ${hour}: ${e.message}`);
      resolve();
    });

    req.end();
  });
}

async function run() {
  // Test hour 8: Should skip because of morning leave (8-12)
  await testHour(8);
  
  // Test hour 9: Should skip because it's not a scheduled hour
  await testHour(9);

  // Test hour 13 (1 PM): Should login (Morning leave over)
  await testHour(13);

  // Test hour 17 (5 PM): Should logout
  await testHour(17);
}

run().catch(console.error);
