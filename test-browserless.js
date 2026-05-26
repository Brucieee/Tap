const { chromium } = require('playwright-core');

async function run() {
  const wsUrl = 'wss://chrome.browserless.io/chromium/playwright?token=2UaO0zyjIEeghXQca7747aa543e72c640391f95f4d9d91a25';
  console.log('Testing Browserless connection to:', wsUrl);
  
  const startTime = Date.now();
  try {
    const browser = await chromium.connect({
      wsEndpoint: wsUrl,
      timeout: 10000 // 10 seconds
    });
    console.log(`Successfully connected in ${Date.now() - startTime}ms!`);
    await browser.close();
    console.log('Browser closed successfully.');
  } catch (err) {
    console.error(`Connection failed after ${Date.now() - startTime}ms:`, err.message);
  }
}

run();
