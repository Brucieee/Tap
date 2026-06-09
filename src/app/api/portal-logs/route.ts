import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/utils/encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Extend serverless execution limit to 300 seconds

export async function GET(request: NextRequest) {
  let browser: any = null;
  let context: any = null;
  try {
    const { searchParams } = new URL(request.url);
    const bypassAuth = searchParams.get('bypassAuth') === 'true';

    // 1. Authenticate User Session
    const supabase = await createClient();
    let user = null;
    if (bypassAuth) {
      user = { id: '581f44dd-ee1b-4c93-8ead-0d292a994ed5' }; // Bruce
    } else {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser) {
        return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
      }
      user = authUser;
    }

    // 2. Fetch User Profile credentials
    let profileData = null;
    let dbError = null;
    if (bypassAuth) {
      const { createClient: createAdminClient } = await import('@supabase/supabase-js');
      const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data, error } = await adminClient
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      profileData = data;
      dbError = error;
    } else {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      profileData = data;
      dbError = error;
    }

    const profile = profileData;

    if (dbError || !profile) {
      return NextResponse.json({ error: 'User profile not found.', details: dbError }, { status: 404 });
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
    browser = null;

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
      const maxConnRetries = 12; // Wait up to 30 seconds for concurrent slots to open up
      let connAttempt = 0;
      let connSuccess = false;
      
      while (connAttempt < maxConnRetries && !connSuccess) {
        connAttempt++;
        try {
          if (connAttempt > 1) {
            const backoffMs = 2500;
            console.log(`[Scraper Browser Queue] Slot occupied. Attempt ${connAttempt}/${maxConnRetries}: Retrying remote connection in ${backoffMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }

          if (formattedUrl.includes('/playwright')) {
            console.log(`Connecting via Playwright native chromium.connect (Attempt ${connAttempt})...`);
            browser = await chromium.connect({ 
              wsEndpoint: formattedUrl,
              timeout: 20000
            });
          } else {
            console.log(`Connecting via CDP chromium.connectOverCDP (Attempt ${connAttempt})...`);
            browser = await chromium.connectOverCDP(formattedUrl, {
              timeout: 20000
            });
          }
          connSuccess = true;
          console.log('Successfully established connection to Playwright Remote Browser for scraper!');
        } catch (connErr: any) {
          console.error(`[Scraper Browser Connection Attempt ${connAttempt} Failed]:`, connErr.message);
          if (connAttempt >= maxConnRetries) {
            return NextResponse.json({ error: `Browser service unreachable after ${maxConnRetries} attempts: ${connErr.message}` }, { status: 502 });
          }
        }
      }
    } else {
      console.log('Launching local Chromium browser for scraper...');
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    }

    context = await browser!.newContext({
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
    await page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton', { timeout: 10000 });
    
    console.log('Waiting for portal dashboard/home page to load...');
    await page.waitForURL((url: any) => url.href.includes('/members/Home') || url.href.includes('Home'), {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    }).catch(async () => {
      console.log('waitForURL timed out, checking/forcing navigation to Home page...');
      const currentUrl = page.url();
      if (!currentUrl.includes('/members/Home') && !currentUrl.includes('Home')) {
        await page.goto('https://timelog.cocogen.com.ph/members/Home', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      }
    });

    // 5. Scrape all tables on the page
    console.log('Extracting tables and rows from portal home page...');
    const rawTableRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const cellsText = cells.map(c => c.textContent?.trim() || '');
        const link = row.querySelector('a[href*="docno="]');
        const href = link ? link.getAttribute('href') : null;
        return { cells: cellsText, href };
      }).filter(r => r.cells.length > 0);
    });

    // 6. Robust cell-content-based regex log extraction
    const parsedLogs: Array<{
      date: string;
      time: string;
      mode: string;
      status: string;
      docNo: string | null;
      raw: string[];
    }> = [];

    console.log(`Total raw table rows extracted: ${rawTableRows.length}`);

    for (const item of rawTableRows) {
      const row = item.cells;
      if (row.length < 3) continue;

      // Find if any cell matches a date pattern: MM/DD/YYYY, M/D/YYYY, MM/DD/YY, M/D/YY
      const dateCellIndex = row.findIndex((cell: string) => /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(cell));
      if (dateCellIndex === -1) continue; // Skip header, buttons, or unrelated rows

      const dateVal = row[dateCellIndex];

      // Find the cell representing mode/type (I for In, O for Out, or full strings)
      let modeVal = 'Unknown';
      const inOutCell = row.find((cell: string) => {
        const c = cell.trim().toUpperCase();
        return c === 'I' || c === 'O' || /\b(in|out|login|logout|time-in|time-out|correction)\b/i.test(c);
      });
      if (inOutCell) {
        const trimmed = inOutCell.trim().toUpperCase();
        if (trimmed === 'I') {
          modeVal = 'Time In';
        } else if (trimmed === 'O') {
          modeVal = 'Time Out';
        } else {
          modeVal = inOutCell;
        }
      }

      // Find a time-like cell (e.g. 08:00 AM, 17:00, 5:00 PM, 08:00:00)
      let timeVal = 'N/A';
      const timeCell = row.find((cell: string) => /\b\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?\b/i.test(cell));
      if (timeCell) {
        timeVal = timeCell;
      }

      // Status cell (Approved, Pending, Submitted, etc.)
      let statusVal = 'Pending Approval';
      if (row.length >= 6) {
        const rawStatus = row[5].trim();
        if (rawStatus === 'A') {
          statusVal = 'Approved';
        } else if (rawStatus === '1') {
          statusVal = 'Pending Approval';
        } else {
          statusVal = rawStatus;
        }
      } else {
        const statusCell = row.find((cell: string) => /\b(approved|pending|cancel|rejected|submitted|active)\b/i.test(cell));
        if (statusCell) {
          statusVal = statusCell;
        }
      }

      // Isolate date and time parts if they contain concatenated timestamps
      let cleanDate = dateVal.trim();
      let cleanTime = timeVal.trim();

      if (cleanDate.includes(' ')) {
        cleanDate = cleanDate.split(/\s+/)[0];
      }

      if (cleanTime.includes('/')) {
        const parts = cleanTime.split(/\s+/);
        if (parts.length > 1) {
          cleanTime = parts.slice(1).join(' ');
        }
      }

      // Remove seconds for a cleaner look while keeping minutes (e.g. 5:00 PM instead of 5 PM)
      try {
        const timeParts = cleanTime.split(/\s+/);
        const ampm = timeParts.find(p => /AM|PM/i.test(p));
        const justTime = timeParts.find(p => p.includes(':'));
        if (justTime) {
          const subParts = justTime.split(':');
          if (subParts.length >= 2) {
            const hh = subParts[0];
            const mm = subParts[1];
            cleanTime = `${hh}:${mm}${ampm ? ' ' + ampm.toUpperCase() : ''}`;
          }
        }
      } catch (e) {
        console.error('Failed to clean seconds in API:', e);
      }

      let docNo = null;
      if (row[0] && /^\d{5,15}$/.test(row[0])) {
        docNo = row[0];
      }

      parsedLogs.push({
        date: cleanDate,
        time: cleanTime,
        mode: modeVal,
        status: statusVal,
        docNo: docNo,
        raw: row
      });
    }

    console.log(`Scraped and parsed ${parsedLogs.length} timelog records from portal.`);

    // Group logs by date and mode to detect duplicates
    const groups: Record<string, typeof parsedLogs> = {};
    for (const log of parsedLogs) {
      if (log.docNo) {
        const key = `${log.date}-${log.mode}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(log);
      }
    }

    const docNosToDelete: string[] = [];
    for (const key in groups) {
      const group = groups[key];
      if (group.length > 1) {
        // Sort ascending by docNo (oldest first, latest last)
        group.sort((a, b) => {
          const numA = parseInt(a.docNo || '0', 10);
          const numB = parseInt(b.docNo || '0', 10);
          return numA - numB;
        });
        
        // Keep the oldest one (index 0), delete the rest
        for (let i = 1; i < group.length; i++) {
          docNosToDelete.push(group[i].docNo!);
        }
      }
    }

    if (docNosToDelete.length > 0) {
      console.log(`Auto-Recovery duplicate cleanup. Deleting docNos: ${docNosToDelete.join(', ')}`);
      for (const docNo of docNosToDelete) {
        try {
          const viewUrl = `https://timelog.cocogen.com.ph/members/view?docno=${docNo}`;
          console.log(`Navigating to view page for deletion: ${viewUrl}`);
          await page.goto(viewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          page.once('dialog', async (dialog: any) => {
            console.log(`Accepting deletion dialog: ${dialog.message()}`);
            await dialog.accept().catch(() => {});
          });

          const deleteBtn = '#ctl00_ContentPlaceHolder1_Button1, input[name="ctl00$ContentPlaceHolder1$Button1"][value="Delete"]';
          await page.waitForSelector(deleteBtn, { timeout: 10000 });
          await Promise.all([
            page.click(deleteBtn),
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
          ]);
          console.log(`Successfully deleted duplicate docNo: ${docNo}`);
        } catch (delErr: any) {
          console.error(`Failed to delete duplicate docNo ${docNo}:`, delErr.message);
        }
      }

      // Re-scrape portal home page to get the final clean logs list
      console.log('Re-scraping home page after duplicate log cleanup...');
      await page.goto('https://timelog.cocogen.com.ph/members/Home', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      
      const reScrapedTableRows = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tr'));
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td, th'));
          const cellsText = cells.map(c => c.textContent?.trim() || '');
          const link = row.querySelector('a[href*="docno="]');
          const href = link ? link.getAttribute('href') : null;
          return { cells: cellsText, href };
        }).filter(r => r.cells.length > 0);
      });

      parsedLogs.length = 0;
      for (const item of reScrapedTableRows) {
        const row = item.cells;
        if (row.length < 3) continue;

        const dateCellIndex = row.findIndex((cell: string) => /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(cell));
        if (dateCellIndex === -1) continue;

        const dateVal = row[dateCellIndex];

        let modeVal = 'Unknown';
        const inOutCell = row.find((cell: string) => {
          const c = cell.trim().toUpperCase();
          return c === 'I' || c === 'O' || /\b(in|out|login|logout|time-in|time-out|correction)\b/i.test(c);
        });
        if (inOutCell) {
          const trimmed = inOutCell.trim().toUpperCase();
          if (trimmed === 'I') modeVal = 'Time In';
          else if (trimmed === 'O') modeVal = 'Time Out';
          else modeVal = inOutCell;
        }

        let timeVal = 'N/A';
        const timeCell = row.find((cell: string) => /\b\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?\b/i.test(cell));
        if (timeCell) timeVal = timeCell;

        let statusVal = 'Pending Approval';
        if (row.length >= 6) {
          const rawStatus = row[5].trim();
          if (rawStatus === 'A') {
            statusVal = 'Approved';
          } else if (rawStatus === '1') {
            statusVal = 'Pending Approval';
          } else {
            statusVal = rawStatus;
          }
        } else {
          const statusCell = row.find((cell: string) => /\b(approved|pending|cancel|rejected|submitted|active)\b/i.test(cell));
          if (statusCell) statusVal = statusCell;
        }

        let cleanDate = dateVal.trim();
        let cleanTime = timeVal.trim();

        if (cleanDate.includes(' ')) cleanDate = cleanDate.split(/\s+/)[0];
        if (cleanTime.includes('/')) {
          const parts = cleanTime.split(/\s+/);
          if (parts.length > 1) cleanTime = parts.slice(1).join(' ');
        }

        try {
          const timeParts = cleanTime.split(/\s+/);
          const ampm = timeParts.find(p => /AM|PM/i.test(p));
          const justTime = timeParts.find(p => p.includes(':'));
          if (justTime) {
            const subParts = justTime.split(':');
            if (subParts.length >= 2) {
              cleanTime = `${subParts[0]}:${subParts[1]}${ampm ? ' ' + ampm.toUpperCase() : ''}`;
            }
          }
        } catch (e) {
          console.error('Failed to clean seconds in API:', e);
        }

        let docNo = null;
        if (row[0] && /^\d{5,15}$/.test(row[0])) {
          docNo = row[0];
        }

        parsedLogs.push({
          date: cleanDate,
          time: cleanTime,
          mode: modeVal,
          status: statusVal,
          docNo: docNo,
          raw: row
        });
      }
      console.log(`Re-scraped and parsed ${parsedLogs.length} clean timelog records.`);
    }

    // Diagnostic log capture to inspect exact Cocogen date values
    try {
      const fs = require('fs');
      const path = require('path');
      const scratchDir = path.join(process.cwd(), 'scratch');
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }
      fs.writeFileSync(path.join(scratchDir, 'scraped_logs.json'), JSON.stringify(parsedLogs, null, 2));
      console.log('Successfully saved scraped logs to diagnostic file.');
    } catch (fsErr) {
      console.error('Failed to save diagnostic logs:', fsErr);
    }

    return NextResponse.json({
      success: true,
      logs: parsedLogs
    });

  } catch (err: any) {
    console.error('Scraper API Exception:', err);
    return NextResponse.json({ error: `Portal scraper failed: ${err.message}` }, { status: 500 });
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
      console.log('Successfully closed and released Playwright Browser connection for scraper.');
    }
  }
}

export async function DELETE(request: NextRequest) {
  let browser: any = null;
  let context: any = null;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const docNo = searchParams.get('docNo');

    if (!docNo) {
      return NextResponse.json({ error: 'Missing docNo parameter' }, { status: 400 });
    }

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

    const remoteUrl = process.env.NODE_ENV === 'development' ? null : process.env.PLAYWRIGHT_SERVICE_URL;
    let playwright;
    try {
      playwright = await import('playwright-core');
    } catch (err) {
      playwright = await import('playwright');
    }

    const { chromium } = playwright;
    browser = null;

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

      console.log('Connecting to remote Playwright service for manual deletion...');
      if (formattedUrl.includes('/playwright')) {
        browser = await chromium.connect({ wsEndpoint: formattedUrl, timeout: 20000 });
      } else {
        browser = await chromium.connectOverCDP(formattedUrl, { timeout: 20000 });
      }
    } else {
      console.log('Launching local Chromium browser for manual deletion...');
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    }

    context = await browser!.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    const loginUrl = process.env.COMPANY_PORTAL_LOGIN_URL || 'https://timelog.cocogen.com.ph/Login';
    console.log(`Manual deletion navigating to: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId, { timeout: 10000 });
    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword, { timeout: 10000 });
    
    console.log('Submitting credentials form in manual deletion...');
    await page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton', { timeout: 10000 });
    
    console.log('Waiting for login redirection in manual deletion...');
    await page.waitForURL((url: any) => !url.href.includes('/Login') && !url.href.includes('Login'), {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    }).catch(() => {
      console.log('Login redirection wait timed out, proceeding to view page anyway...');
    });

    const viewUrl = `https://timelog.cocogen.com.ph/members/view?docno=${docNo}`;
    console.log(`Manual deletion navigating to view page: ${viewUrl}`);
    await page.goto(viewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const deleteBtn = '#ctl00_ContentPlaceHolder1_Button1, input[name="ctl00$ContentPlaceHolder1$Button1"][value="Delete"]';
    let deleteBtnExists = false;
    try {
      await page.waitForSelector(deleteBtn, { timeout: 3000 });
      deleteBtnExists = true;
    } catch (err) {
      console.log('Delete button selector timeout (3000ms). Checking page status/text...');
    }

    if (!deleteBtnExists) {
      const pageText = await page.innerText('body').catch(() => '');
      if (pageText.includes('Approved') || pageText.includes('APPROVED')) {
        return NextResponse.json({ error: 'This timelog record is already approved and cannot be deleted.' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Delete button not found on the portal. The record might be approved or already deleted.' }, { status: 400 });
    }

    page.once('dialog', async (dialog: any) => {
      console.log(`Accepting manual deletion dialog: ${dialog.message()}`);
      await dialog.accept().catch(() => {});
    });

    await Promise.all([
      page.click(deleteBtn),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    ]);

    console.log(`Successfully manually deleted docNo: ${docNo}`);
    return NextResponse.json({ success: true, message: `Successfully deleted log ${docNo}.` });

  } catch (err: any) {
    console.error('Delete API Exception:', err);
    return NextResponse.json({ error: `Portal log deletion failed: ${err.message}` }, { status: 500 });
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
      console.log('Successfully closed and released Playwright Browser connection for manual deletion.');
    }
  }
}
