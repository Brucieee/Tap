import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/utils/encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Extend serverless execution limit to 60 seconds

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate User Session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    // 2. Fetch User Profile credentials
    const { data: profile, error: dbError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (dbError || !profile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    const encryptedEmployeeId = profile.employee_id;
    const encryptedPassword = profile.company_password;

    if (!encryptedEmployeeId || !encryptedPassword) {
      return NextResponse.json({ error: 'Corporate credentials are not configured.' }, { status: 400 });
    }

    const decryptedEmployeeId = decrypt(encryptedEmployeeId);
    const decryptedPassword = decrypt(encryptedPassword);

    if (!decryptedEmployeeId || !decryptedPassword) {
      return NextResponse.json({ error: 'Failed to decrypt credentials.' }, { status: 500 });
    }

    // 3. Connect to Browserless or local browser (Bypass remote service in local development to avoid IP block/geo-restrictions on corporate portal)
    const remoteUrl = process.env.NODE_ENV === 'development' ? null : process.env.PLAYWRIGHT_SERVICE_URL;
    let playwright;
    try {
      playwright = await import('playwright-core');
    } catch (err) {
      playwright = await import('playwright');
    }

    const { chromium } = playwright;
    let browser;

    if (remoteUrl) {
      let formattedUrl = remoteUrl;
      if (remoteUrl.includes('browserless.io') && !remoteUrl.includes('/playwright') && !remoteUrl.includes('/chromium')) {
        try {
          const urlObj = new URL(remoteUrl);
          urlObj.pathname = '/chromium/playwright';
          formattedUrl = urlObj.toString();
        } catch (urlErr) {
          console.error('Failed to parse remoteUrl, keeping raw:', remoteUrl, urlErr);
        }
      }

      console.log('Connecting to remote Playwright service for scraper...');
      try {
        if (formattedUrl.includes('/playwright')) {
          browser = await chromium.connect({ 
            wsEndpoint: formattedUrl,
            timeout: 15000
          });
        } else {
          browser = await chromium.connectOverCDP(formattedUrl, {
            timeout: 15000
          });
        }
      } catch (connErr: any) {
        console.error('Browser connection failed:', connErr);
        return NextResponse.json({ error: `Browser service unreachable: ${connErr.message}` }, { status: 502 });
      }
    } else {
      console.log('Launching local Chromium browser for scraper...');
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    }

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // 4. Log in to Portal
    const loginUrl = process.env.COMPANY_PORTAL_LOGIN_URL || 'https://timelog.cocogen.com.ph/Login';
    console.log(`Scraper navigating to: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId, { timeout: 10000 });
    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword, { timeout: 10000 });
    
    console.log('Submitting credentials form in scraper...');
    await Promise.all([
      page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton', { timeout: 10000 }),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {
        console.log('Navigation wait timed out, continuing flow...');
      })
    ]);

    // Ensure we are on the members Home page
    const currentUrl = page.url();
    if (!currentUrl.includes('/members/Home') && !currentUrl.includes('Home')) {
      console.log(`Redirecting/Navigating to members home page: ${currentUrl}`);
      await page.goto('https://timelog.cocogen.com.ph/members/Home', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }

    // 5. Scrape all tables on the page
    console.log('Extracting tables and rows from portal home page...');
    const rawTableRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        return cells.map(c => c.textContent?.trim() || '');
      }).filter(r => r.length > 0);
    });

    await context.close();
    await browser.close();

    // 6. Robust cell-content-based regex log extraction
    const parsedLogs: Array<{
      date: string;
      time: string;
      mode: string;
      status: string;
      raw: string[];
    }> = [];

    console.log(`Total raw table rows extracted: ${rawTableRows.length}`);

    for (const row of rawTableRows) {
      if (row.length < 3) continue;

      // Find if any cell matches a date pattern: MM/DD/YYYY, M/D/YYYY, MM/DD/YY, M/D/YY
      const dateCellIndex = row.findIndex(cell => /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(cell));
      if (dateCellIndex === -1) continue; // Skip header, buttons, or unrelated rows

      const dateVal = row[dateCellIndex];

      // Find the cell representing mode/type (In, Out, Time In, Time Out, Correction, etc.)
      let modeVal = 'Unknown';
      const inOutCell = row.find(cell => /\b(in|out|login|logout|time-in|time-out|correction)\b/i.test(cell));
      if (inOutCell) {
        modeVal = inOutCell;
      }

      // Find a time-like cell (e.g. 08:00 AM, 17:00, 5:00 PM, 08:00:00)
      let timeVal = 'N/A';
      const timeCell = row.find(cell => /\b\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?\b/i.test(cell));
      if (timeCell) {
        timeVal = timeCell;
      }

      // Status cell (Approved, Pending, Submitted, etc.)
      let statusVal = 'Submitted';
      const statusCell = row.find(cell => /\b(approved|pending|cancel|rejected|submitted|active)\b/i.test(cell));
      if (statusCell) {
        statusVal = statusCell;
      }

      parsedLogs.push({
        date: dateVal,
        time: timeVal,
        mode: modeVal,
        status: statusVal,
        raw: row
      });
    }

    console.log(`Scraped and parsed ${parsedLogs.length} timelog records from portal.`);
    return NextResponse.json({
      success: true,
      logs: parsedLogs
    });

  } catch (err: any) {
    console.error('Scraper API Exception:', err);
    return NextResponse.json({ error: `Portal scraper failed: ${err.message}` }, { status: 500 });
  }
}
