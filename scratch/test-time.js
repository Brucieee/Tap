const d = new Date();
// Simulate 11:09 AM
d.setUTCHours(3); // 3 AM UTC is 11 AM PHT
d.setUTCMinutes(9);

const currentPhtHour = parseInt(
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    hour12: false
  }).format(d),
  10
);

console.log('Simulated Date:', d.toISOString());
console.log('Formatted Hour String:', new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  hour: 'numeric',
  hour12: false
}).format(d));
console.log('Parsed currentPhtHour:', currentPhtHour);
