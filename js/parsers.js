/* ============================================================================
 * parsers.js — Löwenstein / Weinmann prisma SD-card parsers (pure browser JS)
 *
 * All parsing is done client-side with DataView over ArrayBuffers.
 * No network, no dependencies.
 *
 * Formats handled:
 *   signal_NNN.wmedf  Weinmann-modified EDF (per-channel 1 or 2 byte samples)
 *   event_NNN.xml     RespEvent / DeviceEvent records
 *   config.pscfg      JSON device configuration
 *   statistic.psstat  JSON per-day statistics
 *   trendCurves.tc    JSON header + (undecoded) binary payload
 *
 * Field maps were derived by measurement against a real prisma SMART card
 * (devid 0x92, fw 3.17.0008), not copied from GPL sources.
 * ========================================================================== */

const ASCII = new TextDecoder('latin1');

/** Read a fixed-width ASCII field and trim it. */
function ascii (buf, off, len) {
  return ASCII.decode(new Uint8Array(buf, off, len)).trim();
}

/* ---------------------------------------------------------------------------
 * EDF / WMEDF
 * -------------------------------------------------------------------------*/

/**
 * Parse a .wmedf (or plain .edf) file.
 *
 * Standard EDF is 256 bytes of general header followed by ns*256 bytes of
 * per-signal header, then interleaved data records. Weinmann's variant differs
 * in one respect: the per-signal `reserved` field carries a byte-width tag,
 * "#1" (1 byte/sample) or "#2" (2 bytes/sample). Standard EDF is always 2.
 * Signed-ness is inferred from digital_min: < 0 means signed.
 *
 * num_data_records in the header is often -1 (streaming/unknown), so the true
 * record count is always recomputed from the actual file size.
 */
export function parseWmedf (buffer, { channels = null, maxRecords = Infinity } = {}) {
  if (buffer.byteLength < 256) throw new Error('file too small to be EDF');

  const ns = parseInt(ascii(buffer, 252, 4), 10);
  if (!Number.isFinite(ns) || ns <= 0 || ns > 512) {
    throw new Error(`implausible signal count: ${ascii(buffer, 252, 4)}`);
  }
  const headerBytes = 256 * (ns + 1);
  if (buffer.byteLength < headerBytes) throw new Error('truncated EDF header');

  const startDate = ascii(buffer, 168, 8);   // dd.mm.yy
  const startTime = ascii(buffer, 176, 8);   // hh.mm.ss
  const declaredRecords = parseInt(ascii(buffer, 236, 8), 10);
  const recordDuration = parseFloat(ascii(buffer, 244, 8)) || 1;

  // Per-signal header fields are stored column-wise: all labels, then all
  // transducers, etc. Walk the cursor field by field.
  let p = 256;
  const col = (width) => {
    const out = [];
    for (let i = 0; i < ns; i++) out.push(ascii(buffer, p + i * width, width));
    p += ns * width;
    return out;
  };
  const labels        = col(16);
  /* transducer */      col(80);
  const units         = col(8);
  const physMin       = col(8).map(Number);
  const physMax       = col(8).map(Number);
  const digMin        = col(8).map(Number);
  const digMax        = col(8).map(Number);
  /* prefiltering */    col(80);
  const samplesPerRec = col(8).map(n => parseInt(n, 10));
  const reserved      = col(32);

  const signals = [];
  let recordBytes = 0;
  for (let i = 0; i < ns; i++) {
    const bytes = reserved[i] === '#1' ? 1 : 2;
    const n = samplesPerRec[i];
    if (!Number.isFinite(n) || n < 0) throw new Error(`bad sample count for ${labels[i]}`);
    const dMin = digMin[i], dMax = digMax[i];
    const span = dMax - dMin;
    signals.push({
      index: i,
      label: labels[i],
      unit: units[i],
      samplesPerRecord: n,
      bytesPerSample: bytes,
      signed: dMin < 0,
      physMin: physMin[i], physMax: physMax[i],
      digMin: dMin, digMax: dMax,
      // Identity digital->physical maps mean the axis is NOT calibrated.
      // On prisma, RespFlow/FlowFull declare l/min but map 1:1, so values
      // are arbitrary units; only the waveform shape is meaningful.
      gain: span === 0 ? 1 : (physMax[i] - physMin[i]) / span,
      calibrated: !(physMin[i] === dMin && physMax[i] === dMax),
      byteOffsetInRecord: recordBytes
    });
    recordBytes += n * bytes;
  }

  if (recordBytes <= 0) throw new Error('zero-length data record');

  const dataBytes = buffer.byteLength - headerBytes;
  const actualRecords = Math.floor(dataBytes / recordBytes);
  const records = Math.min(actualRecords, maxRecords);

  const view = new DataView(buffer, headerBytes);
  const wanted = channels
    ? signals.filter(s => channels.includes(s.label))
    : signals;

  const series = {};
  for (const s of wanted) {
    const total = records * s.samplesPerRecord;
    const out = new Float32Array(total);
    let w = 0;
    for (let r = 0; r < records; r++) {
      let o = r * recordBytes + s.byteOffsetInRecord;
      for (let k = 0; k < s.samplesPerRecord; k++) {
        let raw;
        if (s.bytesPerSample === 1) {
          raw = s.signed ? view.getInt8(o) : view.getUint8(o);
          o += 1;
        } else {
          raw = view.getInt16(o, true); // EDF is little-endian
          o += 2;
        }
        out[w++] = s.physMin + (raw - s.digMin) * s.gain;
      }
    }
    series[s.label] = out;
  }

  return {
    startDate, startTime,
    startedAt: edfStartToDate(startDate, startTime),
    recordDuration,
    declaredRecords,
    records: actualRecords,
    recordBytes,
    durationSec: actualRecords * recordDuration,
    signals,
    series,
    /** Sampling rate in Hz for a channel. */
    hz (label) {
      const s = signals.find(x => x.label === label);
      return s ? s.samplesPerRecord / recordDuration : 0;
    }
  };
}

/** EDF stores dd.mm.yy + hh.mm.ss in local device time. */
function edfStartToDate (d, t) {
  const dm = d.match(/^(\d{2})\D(\d{2})\D(\d{2})$/);
  const tm = t.match(/^(\d{2})\D(\d{2})\D(\d{2})$/);
  if (!dm || !tm) return null;
  let yy = +dm[3];
  const year = yy + (yy < 70 ? 2000 : 1900);
  return new Date(year, +dm[2] - 1, +dm[1], +tm[1], +tm[2], +tm[3]);
}

/* ---------------------------------------------------------------------------
 * Event XML
 * -------------------------------------------------------------------------*/

/**
 * Respiratory event IDs.
 *
 * `epoch: true` marks IDs that are NOT discrete events but 2-minute analysis
 * windows whose Duration expresses a proportion of that window. Counting them
 * toward AHI is wrong — they are reported as % of therapy time instead.
 */
export const RESP_EVENTS = {
  1:   { key: 'severeObstruction', epoch: true },
  2:   { key: 'mildObstruction',   epoch: true },
  3:   { key: 'flowLimitEpoch',    epoch: true },
  4:   { key: 'snoreEpoch',        epoch: true },
  5:   { key: 'periodicEpoch',     epoch: true },
  101: { key: 'obstructiveApnea',  scores: 'apnea' },
  102: { key: 'centralApnea',      scores: 'apnea' },
  103: { key: 'apneaLeak' },
  105: { key: 'apneaHighPressure' },
  106: { key: 'apneaMovement' },
  111: { key: 'obstructiveHypopnea', scores: 'hypopnea' },
  112: { key: 'centralHypopnea',     scores: 'hypopnea' },
  113: { key: 'hypopneaLeak' },
  121: { key: 'rera' },
  131: { key: 'snore' },
  141: { key: 'artifact' },
  151: { key: 'flowLimitation' },
  161: { key: 'criticalLeak' },
  171: { key: 'periodicBreathing' },
  181: { key: 'csr' },
  221: { key: 'timedBreath' },
  231: { key: 'sessionDuration', structural: true },
  241: { key: 'sessionEnd',      structural: true },
  261: { key: 'deepSleep',       epoch: true },
  262: { key: 'pressureChange',  structural: true },
  306: { key: 'maskOff',         structural: true },
  307: { key: 'maskOn',          structural: true },
  330: { key: 'largeLeak' },
  1230: { key: 'flagAhiValid',   flag: true },
  1240: { key: 'flagAiValid',    flag: true },
  1241: { key: 'flagHiValid',    flag: true }
};

const RESP_RE = /<RespEvent\b([^>]*)\/?>/g;
const DEV_RE  = /<DeviceEvent\b([^>]*)\/?>/g;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;

function attrs (s) {
  const o = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(s))) o[m[1]] = m[2];
  return o;
}

/**
 * Parse event_NNN.xml.
 *
 * CRITICAL: EndTime and Duration are DECISECONDS (tenths of a second) relative
 * to session start. Treating them as seconds inflates every event 10x.
 * Pressure is in Pascals; divide by 100 for cmH2O.
 */
export function parseEventXml (text) {
  const events = [];
  const deviceEvents = [];
  let m;

  RESP_RE.lastIndex = 0;
  while ((m = RESP_RE.exec(text))) {
    const a = attrs(m[1]);
    const id = parseInt(a.RespEventID, 10);
    const endDs = parseInt(a.EndTime, 10) || 0;
    const durDs = parseInt(a.Duration, 10) || 0;
    const meta = RESP_EVENTS[id] || { key: `unknown_${id}` };
    events.push({
      id,
      key: meta.key,
      epoch: !!meta.epoch,
      structural: !!meta.structural,
      flag: !!meta.flag,
      scores: meta.scores || null,
      start: (endDs - durDs) / 10,   // seconds from session start
      end: endDs / 10,
      duration: durDs / 10,          // seconds
      pressure: (parseInt(a.Pressure, 10) || 0) / 100,  // Pa -> cmH2O
      strength: parseInt(a.Strength, 10) || 0,
      visible: a.Visible === undefined ? true : a.Visible !== '0'
    });
  }

  DEV_RE.lastIndex = 0;
  while ((m = DEV_RE.exec(text))) {
    const a = attrs(m[1]);
    deviceEvents.push({
      id: parseInt(a.DeviceEventID, 10),
      time: (parseInt(a.Time, 10) || 0) / 10,
      parameterId: parseInt(a.ParameterID, 10),
      value: Number(a.NewValue)
    });
  }

  const started = text.match(/<!--\s*started\s+(\d+)\s*-->/);

  return {
    startedAt: started ? new Date(+started[1] * 1000) : null,
    events,
    deviceEvents,
    // 231 carries the authoritative session length when present.
    sessionDuration: (() => {
      const e = events.find(x => x.id === 231);
      return e ? e.duration : null;
    })()
  };
}

/* ---------------------------------------------------------------------------
 * config.pscfg  /  statistic.psstat  /  trendCurves.tc
 * -------------------------------------------------------------------------*/

/** Therapy-mode codes seen in prisma configs. */
export const THERAPY_MODES = {
  0: 'CPAP', 1: 'APAP', 2: 'APAP+', 3: 'BiLevel', 4: 'ASV', 5: 'iVAPS'
};

/**
 * config.pscfg is JSON on current firmware (older prismaLINE ships a ZIP
 * named .pcfg). Pressure-valued cfg entries are Pascals.
 */
export function parseConfig (text) {
  const raw = JSON.parse(stripBom(text));
  const cfg = raw.cfg || {};
  const num = (k) => (cfg[k] === undefined ? null : Number(cfg[k]));
  const pressure = (k) => (cfg[k] === undefined ? null : Number(cfg[k]) / 100);
  return {
    raw,
    setVersion: raw.dev?.setversion ?? raw.version ?? null,
    firmware: raw.dev?.fwversion ?? null,
    firmwareName: raw.dev?.fwname ?? null,
    serial: raw.dev?.sn ?? null,
    deviceId: raw.dev?.devid ?? raw.devid ?? null,
    hardwareVersion: raw.dev?.hwversion ?? null,
    modeCode: num('6'),
    mode: THERAPY_MODES[num('6')] ?? null,
    // Pressure fields, in Pascals, as observed on prisma SMART fw 3.17.0008:
    //   7/8   therapy pressure range (400/2000 Pa = 4.0/20.0 cmH2O) — the
    //         device's permitted span, which is what an auto mode titrates in
    //   9     starting / fixed pressure
    //   10    soft ceiling
    //   11/12 a narrower pair that read equal on the observed card, so they
    //         are exposed but not treated as the range
    pressureSet: pressure('9'),
    pressureMin: pressure('7'),
    pressureMax: pressure('8'),
    pressureCeiling: pressure('10'),
    pressureLimitLow: pressure('11'),
    pressureLimitHigh: pressure('12'),
    rampMinutes: num('21'),
    humidifier: num('15'),
    cfg
  };
}

/**
 * statistic.psstat is JSON: { version, dev, use, days: [ {day:{...}}, ... ] }.
 *
 * Per-day keys are numeric strings. Mapping below was established by exact
 * cross-validation against event XML counts over 14 nights on a prisma SMART:
 *   18 == count of RespEventID 121 (RERA)
 *   37 == count of RespEventID 101 (obstructive apnea)
 *   38 == count of RespEventID 102 (central apnea)
 *   6  == therapy minutes
 *   5  == session start (unix seconds)
 * Fields 16/17 track hypopneas but run HIGHER than XML 111/112 counts (they
 * appear to include sub-threshold events the XML omits), so they are exposed
 * as-is and never used for scoring. 47/49/50 are lifetime cumulative counters.
 *
 * Because the device's own published indices cannot be reproduced exactly,
 * all indices in this app are computed from event XML and labelled as ours.
 */
export const PSSTAT_FIELDS = {
  '5':  'sessionStartUnix',
  '6':  'therapyMinutes',
  '7':  'unknown7',
  '9':  'unknown9',
  '10': 'histogramA',
  '15': 'unknown15',
  '16': 'hypopneaObstructiveStat',
  '17': 'hypopneaCentralStat',
  '18': 'reraCount',
  '19': 'snoreRelated',
  '20': 'unknown20',
  '21': 'histogramB',
  '37': 'obstructiveApneaCount',
  '38': 'centralApneaCount',
  '41': 'unknown41',
  '42': 'unknown42',
  '44': 'unknown44',
  '46': 'unknown46',
  '47': 'cumulativeMinutesA',
  '48': 'unknown48',
  '49': 'cumulativeMinutesB',
  '50': 'cumulativeMinutesC',
  '51': 'therapyMinutesAlt'
};

export function parseStatistics (text) {
  const raw = JSON.parse(stripBom(text));
  const days = (raw.days || []).map(entry => {
    const d = entry.day || entry;
    const out = { raw: d };
    for (const [k, name] of Object.entries(PSSTAT_FIELDS)) {
      if (d[k] !== undefined) out[name] = d[k];
    }
    if (out.sessionStartUnix) out.sessionStart = new Date(out.sessionStartUnix * 1000);
    // Each day embeds the config that was active that night.
    if (typeof d.cfg === 'string') {
      try { out.config = parseConfig(d.cfg); } catch { /* tolerate */ }
    }
    return out;
  });
  return {
    raw,
    version: raw.version ?? null,
    device: raw.dev ?? null,
    days
  };
}

/**
 * trendCurves.tc: one line of JSON metadata, then a packed binary payload
 * beginning at the byte offset given by the `Offset` field.
 *
 * The payload encoding is not publicly documented and is not decoded here;
 * the header is still useful (session id, day, type/platform code) and the
 * raw bytes are exposed for experimentation.
 */
export function parseTrendCurves (buffer) {
  const head = ASCII.decode(new Uint8Array(buffer, 0, Math.min(512, buffer.byteLength)));
  const brace = head.indexOf('}');
  if (brace < 0) throw new Error('no JSON header in trendCurves');
  let meta;
  try { meta = JSON.parse(head.slice(0, brace + 1)); }
  catch (e) { throw new Error('unparseable trendCurves header'); }
  const offset = parseInt(meta.Offset, 10);
  const start = Number.isFinite(offset) && offset > 0 && offset < buffer.byteLength
    ? offset : brace + 1;
  return {
    meta,
    platform: meta.Type ?? null,   // e.g. "P28" -> P2_8 parameter set
    serial: meta.SN ?? null,
    day: meta.Day ?? null,
    sessionId: meta.SessionId ?? null,
    payloadOffset: start,
    payload: buffer.slice(start),
    decoded: false
  };
}

function stripBom (s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/* ---------------------------------------------------------------------------
 * Upload_*.pscloud
 * -------------------------------------------------------------------------*/

/**
 * The cloud-upload bundle. Plain JSON with four string fields:
 *   configuration  an escaped copy of config.pscfg
 *   statistics     an escaped copy of statistic.psstat (byte-identical on the
 *                  observed card)
 *   signature      base64 ECDSA signature over the payload
 *   certificate    PEM device certificate issued by the manufacturer
 *
 * Nothing here is therapy data that isn't already on the card, but the
 * certificate is the one place the card names its own manufacturer and
 * platform in plain text, which is useful for confirming device identity.
 */
export function parsePsCloud (text) {
  const raw = JSON.parse(stripBom(text));
  let config = null;
  let statistics = null;
  try { if (raw.configuration) config = parseConfig(raw.configuration); } catch { /* tolerate */ }
  try { if (raw.statistics) statistics = parseStatistics(raw.statistics); } catch { /* tolerate */ }
  return {
    raw,
    config,
    statistics,
    signature: raw.signature ?? null,
    certificate: raw.certificate ?? null,
    certificateInfo: raw.certificate ? readCertificate(raw.certificate) : null,
    fieldSizes: Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v.length : null])
    )
  };
}

/**
 * Pull the human-readable names out of a PEM certificate without a full ASN.1
 * parser: decode the base64 body and collect printable runs. Crude, but the
 * issuer/subject strings in these certificates are plain PrintableString, and
 * this avoids shipping an X.509 library for four labels.
 *
 * Returns { subject, issuer, serial, names[] } on a best-effort basis. No
 * signature verification is attempted — the app makes no trust claim.
 */
export function readCertificate (pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  let bytes;
  try {
    const bin = atob(body);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch { return null; }

  const names = [];
  let run = '';
  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) {
      run += String.fromCharCode(b);
    } else {
      if (run.length >= 4) names.push(run);
      run = '';
    }
  }
  if (run.length >= 4) names.push(run);

  // Heuristics: the organisation name contains letters and spaces; validity
  // dates look like YYMMDDHHMMSSZ. ASN.1 length/tag bytes sometimes land in
  // the printable range and get glued onto the end of a name, so trailing
  // non-letter debris is trimmed.
  // The organisation name ends at its last letter or dot ("…Technology1" ->
  // "…Technology"). The platform label keeps its trailing digits, which are
  // part of the name ("LMT SUB P28 - 10"), so only whitespace is trimmed.
  const orgRaw = names.find(s => /[A-Za-z]{3,}\s+[A-Za-z]/.test(s));
  const org = orgRaw ? (orgRaw.match(/^.*[A-Za-z.]/) || [orgRaw])[0].trim() : null;
  const platform = names.find(s => /\bSUB\b/i.test(s))?.trim() || null;
  const dates = names.filter(s => /^\d{12}Z$/.test(s));
  return {
    derBytes: bytes.length,
    organisation: org,
    platform,
    validFrom: dates[0] ? certDate(dates[0]) : null,
    validTo: dates[1] ? certDate(dates[1]) : null,
    names
  };
}

/** YYMMDDHHMMSSZ -> Date (UTC). */
function certDate (s) {
  const m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return null;
  const yy = +m[1];
  return new Date(Date.UTC(yy + (yy < 70 ? 2000 : 1900), +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

/* ---------------------------------------------------------------------------
 * log/*.log
 * -------------------------------------------------------------------------*/

const LOG_LINE = /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2})\.(\d{2})\.(\d{2})\|\s*(\d+)\s+(\d+)\s+(\S+)\s*\|([A-Z]):\s*(.*)$/;

/**
 * Device firmware logs. The first line is an identity banner; the rest are
 * timestamped entries of the form
 *   2026.04.29 11.17.46|   0    84 SourceFile.h   |D: message
 * where the single letter is a severity (D debug, I info, W warning, E error).
 *
 * These contain no therapy data, but they record when the card was written,
 * and warnings/errors are worth surfacing.
 */
export function parseDeviceLog (text) {
  const lines = stripBom(text).split(/\r?\n/);
  const banner = lines[0] && !LOG_LINE.test(lines[0]) ? lines[0].trim() : null;
  const entries = [];
  const bySeverity = {};

  for (const line of lines) {
    const m = line.match(LOG_LINE);
    if (!m) continue;
    const sev = m[10];
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    entries.push({
      at: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]),
      source: m[9],
      severity: sev,
      message: m[11].trim()
    });
  }

  const identity = {};
  if (banner) {
    for (const part of banner.split(',')) {
      const kv = part.trim().match(/^(.*?)\s+(\S+)$/);
      if (kv) identity[kv[1].trim()] = kv[2];
    }
  }

  return {
    banner,
    identity,
    entries,
    bySeverity,
    notable: entries.filter(e => e.severity === 'W' || e.severity === 'E'),
    firstAt: entries.length ? entries[0].at : null,
    lastAt: entries.length ? entries[entries.length - 1].at : null
  };
}
