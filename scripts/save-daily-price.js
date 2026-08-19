// Fetches today's official PVPC prices (Madrid time) from ESIOS and appends them
// to data/pvpc-history.csv, one row per hour. Safe to run more than once a day —
// it skips the write if that date is already in the file.
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'pvpc-history.csv');
const MADRID_TZ = 'Europe/Madrid';

function madridDateString(){
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = {};
  fmt.formatToParts(new Date()).forEach(p => { if(p.type !== 'literal') parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function madridWeekday(dateStr){
  // Returns 0=Monday..6=Sunday for the given YYYY-MM-DD, computed safely at UTC noon.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay(); // 0=Sun..6=Sat
  return (dow + 6) % 7; // shift to 0=Mon..6=Sun
}

async function fetchPVPC(dateStr){
  const url = `https://api.esios.ree.es/archives/70/download_json?locale=es&date=${dateStr}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if(!res.ok) throw new Error(`HTTP ${res.status} fetching PVPC for ${dateStr}`);
  const json = await res.json();
  const rows = json && json.PVPC;
  if(!rows || !rows.length) throw new Error(`Empty PVPC response for ${dateStr}`);
  return rows.map(row => {
    const hour = parseInt((row.Hora || '').split('-')[0], 10);
    const raw = parseFloat((row.PCB || '0').toString().replace(',', '.')); // €/MWh
    return { hour, priceMwh: raw, priceKwh: raw / 1000 };
  }).filter(r => Number.isFinite(r.hour) && Number.isFinite(r.priceKwh))
    .sort((a, b) => a.hour - b.hour);
}

function alreadySaved(dateStr){
  if(!fs.existsSync(CSV_PATH)) return false;
  const content = fs.readFileSync(CSV_PATH, 'utf8');
  return content.includes(`\n${dateStr},`) || content.startsWith(`${dateStr},`);
}

function ensureHeader(){
  if(!fs.existsSync(CSV_PATH)){
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    fs.writeFileSync(CSV_PATH, 'date,weekday,hour,price_eur_mwh,price_eur_kwh\n');
  }
}

async function main(){
  const dateStr = madridDateString();

  if(alreadySaved(dateStr)){
    console.log(`${dateStr} ya está guardado — no se hace nada (evita duplicados).`);
    return;
  }

  console.log(`Descargando PVPC oficial para ${dateStr}...`);
  const hours = await fetchPVPC(dateStr);

  if(hours.length < 20){
    console.warn(`Solo se recibieron ${hours.length} horas para ${dateStr} — se guarda igual, pero revísalo.`);
  }

  ensureHeader();
  const weekday = madridWeekday(dateStr); // 0=Mon..6=Sun
  const lines = hours.map(h =>
    `${dateStr},${weekday},${h.hour},${h.priceMwh.toFixed(2)},${h.priceKwh.toFixed(5)}`
  );
  fs.appendFileSync(CSV_PATH, lines.join('\n') + '\n');
  console.log(`Guardadas ${lines.length} horas de ${dateStr} en ${CSV_PATH}`);
}

main().catch(err => {
  console.error('Error guardando el precio diario:', err);
  process.exit(1);
});
