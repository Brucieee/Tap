const playwright = require('playwright');

async function run() {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // Register dialog handler to auto-accept the confirmation popup
  page.on('dialog', async (dialog) => {
    console.log(`[Dialog] opened: [${dialog.type()}] "${dialog.message()}". Accepting...`);
    await dialog.accept();
  });

  try {
    console.log('1. Navigating to login...');
    await page.goto('https://myportal.cocogen.com.ph/', { waitUntil: 'domcontentloaded' });
    
    await page.fill('#LoginMain_UserName', '200002006');
    await page.fill('#LoginMain_Password', 'cocog#n');
    console.log('2. Clicking login...');
    await page.click('#LoginMain_LoginButton');
    
    console.log('Waiting for URL after login...');
    await page.waitForURL((url) => url.href.includes('/members/') || url.href.includes('aspx'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    console.log('Successfully logged in. Current URL:', page.url());

    // We will navigate to a test document number. Let's use the one from the user's request.
    const docNo = '0002687393';
    const deleteUrl = `https://myportal.cocogen.com.ph/members/myp_reqd.aspx?ID=LV&DOCNO=${docNo}`;
    console.log(`3. Navigating to delete page: ${deleteUrl}`);
    await page.goto(deleteUrl, { waitUntil: 'domcontentloaded' });

    console.log('Page loaded. URL:', page.url());
    
    // Check if delete button is visible/present
    const deleteBtn = page.locator('#ctl00_MainPlaceHolder_appdtl1_RequestFormView_Delete_btn');
    const count = await deleteBtn.count();
    console.log(`Delete button count: ${count}`);
    
    if (count > 0) {
      const isVisible = await deleteBtn.isVisible();
      console.log(`Delete button is visible: ${isVisible}`);
      
      const text = await page.locator('body').innerText();
      console.log('--- Page text preview ---');
      console.log(text.substring(0, 500));
      console.log('-------------------------');

      console.log('4. Clicking delete button...');
      await deleteBtn.click();
      
      console.log('Waiting for postback/navigation...');
      await page.waitForTimeout(5000);
      
      console.log('Current URL after click:', page.url());
      const postText = await page.locator('body').innerText();
      console.log('--- Page text after delete click ---');
      console.log(postText.substring(0, 500));
      console.log('------------------------------------');
    } else {
      console.log('Delete button NOT found on this page. Let\'s see the text on the page:');
      const text = await page.locator('body').innerText();
      console.log(text.substring(0, 500));
    }

  } catch (err) {
    console.error('Error encountered:', err);
  } finally {
    await browser.close();
  }
}

run();
