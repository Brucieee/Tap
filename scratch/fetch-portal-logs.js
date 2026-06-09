const http = require('http');

http.get('http://localhost:3000/api/portal-logs?bypassAuth=true', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('API Response Success:', json.success);
      if (json.logs) {
        console.log(`Successfully fetched ${json.logs.length} logs!`);
        console.log('First 5 logs:', JSON.stringify(json.logs.slice(0, 5), null, 2));
      } else {
        console.log('No logs found, response:', json);
      }
    } catch (e) {
      console.error('Failed to parse JSON response:', e.message);
      console.log('Raw data received:', data);
    }
  });
}).on('error', (err) => {
  console.error('HTTP request failed:', err.message);
});
