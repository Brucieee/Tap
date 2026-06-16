const playwright = require('playwright');

async function run() {
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    console.log('1. Navigating to login...');
    await page.goto('https://myportal.cocogen.com.ph/', { waitUntil: 'domcontentloaded' });
    
    await page.fill('#LoginMain_UserName', '200002006');
    await page.fill('#LoginMain_Password', 'cocog#n');
    await page.click('#LoginMain_LoginButton');
    
    await page.waitForURL((url) => url.href.includes('/members/') || url.href.includes('aspx'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    console.log('Successfully logged in.');

    const summaryUrl = 'https://myportal.cocogen.com.ph/members/myp_reqs.aspx?ID=LV&SNODE=201&T=Leaves';
    await page.goto(summaryUrl, { waitUntil: 'domcontentloaded' });

    // Set date filter to current/adjacent years
    const currentYear = new Date().getFullYear();
    const startDateVal = `01/01/${currentYear}`;
    const endDateVal = `12/31/${currentYear}`;

    const startFilter = page.locator('#ctl00_MainPlaceHolder_summ1_dtr_Start_textBox');
    const endFilter = page.locator('#ctl00_MainPlaceHolder_summ1_dtr_End_textBox');
    const refreshBtn = page.locator('#ctl00_MainPlaceHolder_summ1_Refresh_btn');

    if (await startFilter.count() > 0) {
      await startFilter.fill(startDateVal);
      await endFilter.fill(endDateVal);
      await refreshBtn.click();
      await page.waitForTimeout(3000);
    }

    const rowsLocator = page.locator('#ctl00_MainPlaceHolder_summ1_gvRequest tr');
    const rowCount = await rowsLocator.count();
    console.log(`Total rows in request grid: ${rowCount}`);

    for (let i = 1; i < rowCount; i++) {
      const row = rowsLocator.nth(i);
      const cells = row.locator('td');
      const cellCount = await cells.count();
      if (cellCount < 6) continue;

      // Status
      const statusImg = cells.nth(0).locator('img').first();
      let status = 'Unknown';
      if (await statusImg.count() > 0) {
        const src = await statusImg.getAttribute('src') || '';
        if (src.toLowerCase().includes('/a.png')) status = 'Approved';
        else if (src.toLowerCase().includes('/1.png')) status = 'Pending';
        else if (src.toLowerCase().includes('/r.png')) status = 'Rejected';
        else if (src.toLowerCase().includes('/d.png')) status = 'Deleted';
      }

      const docNo = (await cells.nth(1).innerText()).trim();
      const type = (await cells.nth(3).innerText()).trim();
      const start = (await cells.nth(4).innerText()).trim();
      const end = (await cells.nth(5).innerText()).trim();

      console.log(`Row ${i}: DocNo=${docNo}, Status=${status}, Type=${type}, Date=${start} to ${end}`);
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

run();
