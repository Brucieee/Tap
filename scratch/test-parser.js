const fs = require('fs');

const tables = JSON.parse(fs.readFileSync('scratch/scraped_tables_dump.json', 'utf8'));
const firstTable = tables.find(t => t.id === 'ctl00_ContentPlaceHolder1_grdvw_posts');
if (!firstTable) {
  console.error('Target table not found in dump');
  process.exit(1);
}

const parsedLogs = [];
for (const item of firstTable.rowsData) {
  const row = item.cellsText;
  if (row.length < 3) continue;

  const dateCellIndex = row.findIndex((cell) => /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(cell));
  if (dateCellIndex === -1) continue;

  const dateVal = row[dateCellIndex];

  let modeVal = 'Unknown';
  const inOutCell = row.find((cell) => {
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

  let timeVal = 'N/A';
  const timeCell = row.find((cell) => /\b\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?\b/i.test(cell));
  if (timeCell) {
    timeVal = timeCell;
  }

  let statusVal = 'Submitted';
  const statusCell = row.find((cell) => /\b(approved|pending|cancel|rejected|submitted|active)\b/i.test(cell));
  if (statusCell) {
    statusVal = statusCell;
  }

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

  let docNo = null;
  if (row[0] && /^\d{5,15}$/.test(row[0])) {
    docNo = row[0];
  }

  parsedLogs.push({
    date: cleanDate,
    time: cleanTime,
    mode: modeVal,
    status: statusVal,
    docNo: docNo
  });
}

console.log('Parsed Logs Result:');
console.log(JSON.stringify(parsedLogs, null, 2));
