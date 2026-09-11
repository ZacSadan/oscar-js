/* ============================================================================
 * scan.js — turn a picked folder into parsed nights.
 *
 * Accepts either source:
 *   - showDirectoryPicker() handle (Chromium)
 *   - <input type="file" webkitdirectory> FileList (everyone else)
 * and normalises both into a flat list of { path, file } entries.
 *
 * Layout expected on a prisma card:
 *   config.pscfg
 *   statistic.psstat
 *   <serial>/<YYYYMMDD>/<session>/event_NNN.xml
 *                               /signal_NNN.wmedf
 *                               /trendCurves.tc
 * The YYYYMMDD folder IS the night (the device applies a noon-to-noon
 * boundary before choosing it), so we never re-derive the night from a
 * session timestamp.
 * ========================================================================== */

import {
  parseWmedf, parseEventXml, parseConfig, parseStatistics, parseTrendCurves,
  parsePsCloud, parseDeviceLog
} from './parsers.js';
import { buildSession, buildNight, buildReport } from './analysis.js';

const DAY_RE = /(?:^|\/)(\d{8})\//;
const EVENT_RE = /event_(\d+)\.xml$/i;
const SIGNAL_RE = /signal_(\d+)\.wmedf$/i;

/** Flatten a FileList from <input webkitdirectory>. */
export function entriesFromFileList (fileList) {
  return Array.from(fileList).map(f => ({
    path: (f.webkitRelativePath || f.name).replace(/\\/g, '/'),
    file: f
  }));
}

/** Recursively flatten a File System Access directory handle. */
export async function entriesFromDirHandle (dirHandle) {
  const out = [];
  async function walk (handle, prefix) {
    for await (const [name, child] of handle.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (child.kind === 'file') {
        out.push({ path, getFile: () => child.getFile() });
      } else if (child.kind === 'directory') {
        // System Volume Information and similar are unreadable; skip quietly.
        if (/^(System Volume Information|\$RECYCLE\.BIN|\.Spotlight-V100|\.Trashes)$/i.test(name)) continue;
        await walk(child, path);
      }
    }
  }
  await walk(dirHandle, '');
  return out;
}

async function readEntry (entry) {
  const file = entry.file ?? await entry.getFile();
  return file;
}

/** Quick check so we can fail with a helpful message instead of a stack trace. */
export function looksLikePrismaCard (entries) {
  return entries.some(e =>
    /config\.ps?cfg$/i.test(e.path) ||
    /statistic\.psstat$/i.test(e.path) ||
    EVENT_RE.test(e.path) ||
    SIGNAL_RE.test(e.path)
  );
}

/**
 * Parse everything. Waveforms are deliberately NOT decoded here — only their
 * headers are read, and the File handle is kept so a night's waveform can be
 * decoded on demand. Decoding 15 nights x 640 KB up front would be wasted work
 * for a report that shows aggregates.
 */
export async function scanCard (entries, onProgress = () => {}) {
  const errors = [];
  const byNight = new Map();
  let config = null;
  let statistics = null;
  let trendMeta = [];

  // ---- top-level metadata -------------------------------------------------
  const configEntry = entries.find(e => /(?:^|\/)config\.ps?cfg$/i.test(e.path));
  if (configEntry) {
    try {
      config = parseConfig(await (await readEntry(configEntry)).text());
    } catch (e) { errors.push({ path: configEntry.path, error: e.message }); }
  }

  const statEntry = entries.find(e => /(?:^|\/)statistic\.psstat$/i.test(e.path));
  if (statEntry) {
    try {
      statistics = parseStatistics(await (await readEntry(statEntry)).text());
    } catch (e) { errors.push({ path: statEntry.path, error: e.message }); }
  }

  // ---- group session files into sessions -----------------------------------
  // One night folder holds MANY sessions (mask on/off segments), all in the
  // same directory and distinguished only by the NNN sequence number in the
  // filename: event_047.xml pairs with signal_047.wmedf. Keying by directory
  // would collapse a 7-session night into one, so the key is day + sequence.
  const sessionFiles = new Map();
  for (const entry of entries) {
    const dayMatch = entry.path.match(DAY_RE);
    if (!dayMatch) continue;
    const day = dayMatch[1];
    const dir = entry.path.slice(0, entry.path.lastIndexOf('/'));

    const ev = entry.path.match(EVENT_RE);
    const sg = entry.path.match(SIGNAL_RE);
    const isTrend = /trendCurves\.tc$/i.test(entry.path);
    if (!ev && !sg && !isTrend) continue;

    // trendCurves.tc is per-folder, not per-session; park it under "trend".
    const seq = ev ? ev[1] : sg ? sg[1] : 'trend';
    const key = `${day}|${dir}|${seq}`;
    if (!sessionFiles.has(key)) sessionFiles.set(key, { day, dir, seq });
    const slot = sessionFiles.get(key);
    if (ev) slot.eventEntry = entry;
    else if (sg) slot.signalEntry = entry;
    else slot.trendEntry = entry;
  }

  const slots = [...sessionFiles.values()].filter(s => s.eventEntry || s.signalEntry);
  slots.sort((a, b) =>
    (a.day + a.dir).localeCompare(b.day + b.dir) || Number(a.seq) - Number(b.seq));

  // Trend files are folder-level; collect them separately.
  const trendSlots = [...sessionFiles.values()].filter(s => s.trendEntry);

  // ---- parse each session -------------------------------------------------
  let done = 0;
  for (const slot of slots) {
    // Awaited so a caller can yield to the renderer and keep a spinner moving.
    await onProgress(++done, slots.length);

    let parsedEvents = { startedAt: null, events: [], deviceEvents: [], sessionDuration: null };
    if (slot.eventEntry) {
      try {
        parsedEvents = parseEventXml(await (await readEntry(slot.eventEntry)).text());
      } catch (e) { errors.push({ path: slot.eventEntry.path, error: e.message }); }
    }

    // Header-only read of the waveform: enough for duration, channels and
    // sampling rates, without decoding any samples.
    let signalInfo = null;
    if (slot.signalEntry) {
      try {
        const file = await readEntry(slot.signalEntry);
        const head = await file.slice(0, 256).arrayBuffer();
        const ns = parseInt(
          new TextDecoder('latin1').decode(new Uint8Array(head, 252, 4)).trim(), 10
        );
        if (Number.isFinite(ns) && ns > 0) {
          const headerBytes = 256 * (ns + 1);
          const full = await file.slice(0, headerBytes).arrayBuffer();
          // Parse the headers only (no sample data is present in this slice),
          // then derive the true record count from the real file size. The
          // header's own num_data_records is unreliable on some firmware, and
          // parseWmedf cannot see the data region from a header-only slice.
          const info = parseWmedf(padTo(full, headerBytes), { channels: [], maxRecords: 0 });
          const records = Math.max(0,
            Math.floor((file.size - headerBytes) / info.recordBytes));
          signalInfo = {
            ...info,
            records,
            durationSec: records * info.recordDuration,
            fileSize: file.size,
            entry: slot.signalEntry   // kept for on-demand decoding
          };
        }
      } catch (e) { errors.push({ path: slot.signalEntry.path, error: e.message }); }
    }

    const session = buildSession(parsedEvents, signalInfo, {
      day: slot.day,
      dir: slot.dir,
      path: (slot.eventEntry || slot.signalEntry).path
    });

    if (!byNight.has(slot.day)) byNight.set(slot.day, []);
    byNight.get(slot.day).push(session);
  }

  // ---- trend curve headers (payload encoding is undocumented) -------------
  for (const slot of trendSlots) {
    try {
      const buf = await (await readEntry(slot.trendEntry)).arrayBuffer();
      const tc = parseTrendCurves(buf);
      tc.day = tc.day || slot.day;
      trendMeta.push(tc);
    } catch { /* header-only value; a failure here is not worth reporting */ }
  }

  // ---- remaining files, for the appendix ----------------------------------
  const extras = await readExtras(entries, errors);

  // ---- index statistics by night, using the noon-to-noon rule -------------
  const statByDay = new Map();
  if (statistics) {
    for (const d of statistics.days) {
      if (!d.sessionStart) continue;
      const shifted = new Date(d.sessionStart.getTime() - 12 * 3600 * 1000);
      statByDay.set(dayKey(shifted), d);
    }
  }

  const nights = [...byNight.keys()].sort().map(day =>
    buildNight(day, byNight.get(day), statByDay.get(day))
  );

  const device = {
    serial: config?.serial ?? statistics?.device?.sn ?? null,
    deviceId: config?.deviceId ?? statistics?.device?.devid ?? null,
    model: modelName(config?.deviceId ?? statistics?.device?.devid),
    firmware: config?.firmware ?? statistics?.device?.fwversion ?? null,
    firmwareName: config?.firmwareName ?? statistics?.device?.fwname ?? null,
    setVersion: config?.setVersion ?? statistics?.version ?? null,
    platform: trendMeta[0]?.platform ?? null,
    config
  };

  const report = buildReport(nights, device);
  report.errors = errors;
  report.trendMeta = trendMeta;
  report.statistics = statistics;
  report.extras = extras;
  report.inventory = buildInventory(entries, trendMeta);
  return report;
}

/**
 * Read the files that carry no therapy data but are worth showing: the cloud
 * upload bundle and the device logs. Everything here is best-effort — a
 * failure leaves the section out rather than failing the import.
 */
async function readExtras (entries, errors) {
  const out = { psCloud: null, logs: [] };

  const cloudEntry = entries.find(e => /Upload_[^/]*\.pscloud$/i.test(e.path));
  if (cloudEntry) {
    try {
      const file = await readEntry(cloudEntry);
      out.psCloud = parsePsCloud(await file.text());
      out.psCloud.path = cloudEntry.path;
      out.psCloud.size = file.size;
    } catch (e) { errors.push({ path: cloudEntry.path, error: e.message }); }
  }

  for (const entry of entries.filter(e => /\.log$/i.test(e.path))) {
    try {
      const file = await readEntry(entry);
      // Logs can run to hundreds of KB; the tail holds the recent activity.
      const MAX = 512 * 1024;
      const slice = file.size > MAX ? file.slice(file.size - MAX) : file;
      const parsed = parseDeviceLog(await slice.text());
      parsed.path = entry.path;
      parsed.size = file.size;
      parsed.truncated = file.size > MAX;
      out.logs.push(parsed);
    } catch { /* logs are optional */ }
  }

  return out;
}

/**
 * A complete accounting of the picked folder: every file, whether the report
 * used it, and why not when it didn't. This is what makes the appendix honest
 * — a reader can see nothing was quietly skipped.
 */
function buildInventory (entries, trendMeta) {
  const CATEGORIES = [
    { id: 'signal',  test: SIGNAL_RE,                          use: 'full' },
    { id: 'event',   test: EVENT_RE,                           use: 'full' },
    { id: 'config',  test: /config\.ps?cfg$/i,                 use: 'full' },
    { id: 'stat',    test: /statistic\.psstat$/i,              use: 'full' },
    { id: 'trend',   test: /trendCurves\.tc$/i,                use: 'partial' },
    { id: 'cloud',   test: /\.pscloud$/i,                      use: 'partial' },
    { id: 'log',     test: /\.log$/i,                          use: 'partial' },
    { id: 'dcm',     test: /dcm\.zip$/i,                       use: 'none' },
    { id: 'system',  test: /(System Volume Information|WPSettings|IndexerVolumeGuid|\$RECYCLE)/i, use: 'none' }
  ];

  const groups = new Map();
  const unknown = [];

  for (const e of entries) {
    const cat = CATEGORIES.find(c => c.test.test(e.path));
    if (!cat) { unknown.push(e.path); continue; }
    if (!groups.has(cat.id)) groups.set(cat.id, { id: cat.id, use: cat.use, count: 0, bytes: 0, paths: [] });
    const g = groups.get(cat.id);
    g.count++;
    const size = e.file?.size;
    if (Number.isFinite(size)) g.bytes += size;
    if (g.paths.length < 4) g.paths.push(e.path);
  }

  if (unknown.length) {
    groups.set('other', {
      id: 'other', use: 'none', count: unknown.length, bytes: 0,
      paths: unknown.slice(0, 6)
    });
  }

  return {
    totalFiles: entries.length,
    groups: [...groups.values()],
    trendDays: trendMeta.length
  };
}

/**
 * Decode selected channels of one session's waveform, on demand.
 * `maxSeconds` caps the decode so opening a long night stays responsive.
 */
export async function decodeWaveform (session, channels, maxSeconds = 3600) {
  const info = session.signalInfo;
  if (!info?.entry) throw new Error('no waveform file for this session');
  const file = info.entry.file ?? await info.entry.getFile();
  const headerBytes = 256 * (info.signals.length + 1);
  const records = Math.min(info.records, Math.ceil(maxSeconds / info.recordDuration));
  const bytes = headerBytes + records * info.recordBytes;
  const buf = await file.slice(0, Math.min(bytes, file.size)).arrayBuffer();
  return parseWmedf(buf, { channels });
}

/* -------------------------------------------------------------------------*/

function padTo (buf, size) {
  if (buf.byteLength >= size) return buf;
  const out = new Uint8Array(size);
  out.set(new Uint8Array(buf));
  return out.buffer;
}

function dayKey (d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Device id -> marketing name. Only ids confirmed in the wild are named. */
function modelName (devid) {
  const map = {
    '0x92': 'prisma SMART',
    '0x91': 'prisma SOFT',
    '0x16': 'prisma 25S',
    '0x17': 'prisma 25ST'
  };
  return devid ? (map[String(devid).toLowerCase()] ?? null) : null;
}
