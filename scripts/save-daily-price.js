// Fetches today's official PVPC prices (Madrid time) from ESIOS, plus that day's weather
// (cloud cover % and temperature, hourly) from Open-Meteo for three regions — Barcelona,
// Madrid (centro) and Sevilla (sur) — and appends them together to data/pvpc-history.csv,
// one row per hour. Safe to run more than once a day — it skips the write if that date is
// already in the file. Also migrates the CSV header if it was written before the extra
// weather columns existed, so old and new rows stay aligned.
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'data', 'pvpc-history.csv');
const MADRID_TZ = 'Europe/Madrid';

// Spain's PVPC price is driven by NATIONAL solar/wind production, concentrated mostly in
// the south and centre — so one city's weather is an imperfect signal on its own. Sampling
// three spread-out regions gives a better rough proxy for national cloud cover.
const REGIONS = [
  { key: 'bcn', label: 'Barcelona', lat: 41.3874, lon: 2.1686 },
  { key: 'mad', label: 'Madrid (centro)', lat: 40.4168, lon: -3.7038 },
  { key: 'sev', label: 'Sevilla (sur)', lat: 37.3891, lon: -5.9845 },
];

const EXPECTED_HEADER = 'date,weekday,hour,price_eur_mwh,price_eur_kwh,' +
  REGIONS.map(r => `cloud_${r.key},temp_${r.key}`).join(',');

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

// Fetches one region's hourly weather for a given date. Returns map hour -> {cloudPct, tempC}.
async function fetchRegionWeather(region, dateStr){
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${region.lat}&longitude=${region.lon}` +
    `&start_date=${dateStr}&end_date=${dateStr}&hourly=cloud_cover,temperature_2m&timezone=Europe%2FMadrid`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`HTTP ${res.status} fetching weather (${region.key}) for ${dateStr}`);
  const json = await res.json();
  const times = (json.hourly && json.hourly.time) || [];
  const clouds = (json.hourly && json.hourly.cloud_cover) || [];
  const temps = (json.hourly && json.hourly.temperature_2m) || [];
  const map = {};
  times.forEach((t, i) => {
    const hour = parseInt(t.slice(11, 13), 10);
    if(Number.isFinite(hour)) map[hour] = { cloudPct: clouds[i], tempC: temps[i] };
  });
  return map;
}

// Returns { bcn: {hour:{cloudPct,tempC}}, mad: {...}, sev: {...} }. Any region that fails
// is simply left out — its columns are saved empty for that day rather than blocking the
// whole run (the price data is the priority).
async function fetchAllWeather(dateStr){
  const result = {};
  await Promise.all(REGIONS.map(async region => {
    try{
      result[region.key] = await fetchRegionWeather(region, dateStr);
    }catch(err){
      console.warn(`No se pudo obtener el clima de ${region.label} para ${dateStr}, se guarda sin esa columna:`, err.message);
      result[region.key] = {};
    }
  }));
  return result;
}

function alreadySaved(dateStr){
  if(!fs.existsSync(CSV_PATH)) return false;
  const content = fs.readFileSync(CSV_PATH, 'utf8');
  return content.includes(`\n${dateStr},`) || content.startsWith(`${dateStr},`);
}

// Creates the CSV with the current header if it doesn't exist yet, or migrates an older
// header (fewer weather columns) to the current one, padding old rows with empty values
// for whatever new columns didn't exist when they were written.
function ensureHeaderAndMigrate(){
  if(!fs.existsSync(CSV_PATH)){
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    fs.writeFileSync(CSV_PATH, EXPECTED_HEADER + '\n');
    return;
  }

  const content = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = content.split('\n');
  const currentHeader = lines[0];
  if(currentHeader === EXPECTED_HEADER) return; // already up to date

  console.log('Migrando cabecera del CSV al nuevo formato con 3 regiones de clima...');
  const oldCols = currentHeader.split(',');
  const dataLines = lines.slice(1).filter(Boolean);
  const migrated = dataLines.map(line => {
    const values = line.split(',');
    const byName = {};
    oldCols.forEach((col, i) => { byName[col] = values[i] != null ? values[i] : ''; });
    return EXPECTED_HEADER.split(',').map(col => byName[col] != null ? byName[col] : '').join(',');
  });
  fs.writeFileSync(CSV_PATH, EXPECTED_HEADER + '\n' + migrated.join('\n') + (migrated.length ? '\n' : ''));
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

  console.log(`Descargando clima de ${REGIONS.map(r => r.label).join(', ')} para ${dateStr}...`);
  const weather = await fetchAllWeather(dateStr);

  ensureHeaderAndMigrate();
  const weekday = madridWeekday(dateStr); // 0=Mon..6=Sun
  const lines = hours.map(h => {
    const weatherCols = REGIONS.map(region => {
      const w = (weather[region.key] && weather[region.key][h.hour]) || {};
      const cloud = Number.isFinite(w.cloudPct) ? w.cloudPct : '';
      const temp = Number.isFinite(w.tempC) ? w.tempC.toFixed(1) : '';
      return `${cloud},${temp}`;
    }).join(',');
    return `${dateStr},${weekday},${h.hour},${h.priceMwh.toFixed(2)},${h.priceKwh.toFixed(5)},${weatherCols}`;
  });
  fs.appendFileSync(CSV_PATH, lines.join('\n') + '\n');
  console.log(`Guardadas ${lines.length} horas de ${dateStr} en ${CSV_PATH}`);
}

main().catch(err => {
  console.error('Error guardando el precio diario:', err);
  process.exit(1);
});
