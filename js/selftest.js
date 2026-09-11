/* ============================================================================
 * selftest.js — assertions on the arithmetic that fails silently.
 *
 * These are the conversions that produce plausible-looking but wrong numbers
 * when they break: unit scaling, byte widths, day boundaries, and index
 * definitions. Each test builds its input in memory — no patient data.
 *
 * Run in a browser console:   import('./js/selftest.js').then(m => m.run())
 * Run in Node:                node js/selftest.js
 * ========================================================================== */

import { parseWmedf, parseEventXml, parseConfig, parseStatistics } from './parsers.js';
import {
  buildSession, buildNight, buildReport, percentile, median, linearTrend,
  hoursFromNoon
} from './analysis.js';

const results = [];

function check (name, actual, expected, tolerance = 0) {
  const ok = typeof expected === 'number' && typeof actual === 'number'
    ? Math.abs(actual - expected) <= tolerance
    : JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, ok, actual, expected });
  return ok;
}

function checkTrue (name, value) {
  results.push({ name, ok: !!value, actual: value, expected: true });
}

/* ---------------------------------------------------------------------------
 * Build a synthetic wmedf in memory.
 * -------------------------------------------------------------------------*/

function pad (s, n) {
  const out = String(s).slice(0, n);
  return out + ' '.repeat(n - out.length);
}

/**
 * @param {Array} sigs  [{label, unit, physMin, physMax, digMin, digMax, n, reserved}]
 * @param {number} records
 * @param {function} sample (signalIndex, recordIndex, sampleIndex) -> raw int
 */
function makeWmedf (sigs, records, sample) {
  const ns = sigs.length;
  const headerBytes = 256 * (ns + 1);
  const recordBytes = sigs.reduce(
    (s, x) => s + x.n * (x.reserved === '#1' ? 1 : 2), 0);
  const total = headerBytes + records * recordBytes;
  const buf = new ArrayBuffer(total);
  const bytes = new Uint8Array(buf);
  const enc = (str, off) => {
    for (let i = 0; i < str.length; i++) bytes[off + i] = str.charCodeAt(i);
  };

  // General header
  enc(pad('0', 8), 0);
  enc(pad('Patient', 80), 8);
  enc(pad('Recording', 80), 88);
  enc(pad('07.09.26', 8), 168);
  enc(pad('22.57.56', 8), 176);
  enc(pad(String(headerBytes), 8), 184);
  enc(pad('', 44), 192);
  enc(pad('-1', 8), 236);          // deliberately unreliable record count
  enc(pad('1', 8), 244);
  enc(pad(String(ns), 4), 252);

  let p = 256;
  const col = (vals, w) => {
    vals.forEach((v, i) => enc(pad(v, w), p + i * w));
    p += ns * w;
  };
  col(sigs.map(s => s.label), 16);
  col(sigs.map(() => 'transducer'), 80);
  col(sigs.map(s => s.unit), 8);
  col(sigs.map(s => s.physMin), 8);
  col(sigs.map(s => s.physMax), 8);
  col(sigs.map(s => s.digMin), 8);
  col(sigs.map(s => s.digMax), 8);
  col(sigs.map(() => ''), 80);
  col(sigs.map(s => s.n), 8);
  col(sigs.map(s => s.reserved), 32);

  // Data
  const view = new DataView(buf);
  let o = headerBytes;
  for (let r = 0; r < records; r++) {
    sigs.forEach((s, si) => {
      for (let k = 0; k < s.n; k++) {
        const raw = sample(si, r, k);
        if (s.reserved === '#1') {
          if (s.digMin < 0) view.setInt8(o, raw); else view.setUint8(o, raw);
          o += 1;
        } else {
          view.setInt16(o, raw, true);
          o += 2;
        }
      }
    });
  }
  return buf;
}

/* ---------------------------------------------------------------------------
 * Tests
 * -------------------------------------------------------------------------*/

function testMixedByteWidths () {
  // A 2-byte signed flow channel at 5 Hz and a 1-byte unsigned pressure
  // channel at 2 Hz. A standard EDF reader assumes 2 bytes everywhere and
  // would compute 14 bytes/record instead of 12, misaligning everything.
  const sigs = [
    { label: 'RespFlow', unit: 'l/min', physMin: -32768, physMax: 32767,
      digMin: -32768, digMax: 32767, n: 5, reserved: '#2' },
    { label: 'Pressure', unit: 'hPa', physMin: 0, physMax: 25.5,
      digMin: 0, digMax: 255, n: 2, reserved: '#1' }
  ];
  const buf = makeWmedf(sigs, 10, (si, r, k) => (si === 0 ? (r * 10 + k) : (r + k)));
  const p = parseWmedf(buf);

  check('mixed widths: bytes per record', p.recordBytes, 5 * 2 + 2 * 1);
  check('mixed widths: record count from file size', p.records, 10);
  check('mixed widths: flow sample count', p.series.RespFlow.length, 50);
  check('mixed widths: pressure sample count', p.series.Pressure.length, 20);
  check('mixed widths: flow sampling rate', p.hz('RespFlow'), 5);
  check('mixed widths: pressure sampling rate', p.hz('Pressure'), 2);

  // Identity map => value equals raw. Sample 7 of a 5-per-record channel is
  // record 1, sample 2, so the generator produced 1*10 + 2 = 12. Getting this
  // index wrong is exactly the de-interleaving bug the test exists to catch.
  check('mixed widths: flow value passthrough', p.series.RespFlow[7], 12, 1e-6);
  check('mixed widths: flow de-interleaves across records', p.series.RespFlow[5], 10, 1e-6);
  // 0..255 -> 0..25.5 means gain 0.1.
  check('mixed widths: pressure gain applied', p.series.Pressure[3], 0.2, 1e-6);

  // Calibration detection: identity range is NOT calibrated.
  const flow = p.signals.find(s => s.label === 'RespFlow');
  const pres = p.signals.find(s => s.label === 'Pressure');
  check('flow flagged uncalibrated', flow.calibrated, false);
  check('pressure flagged calibrated', pres.calibrated, true);
}

function testSignedByteChannel () {
  // digital_min < 0 on a 1-byte channel must decode as signed.
  const sigs = [{
    label: 'Signed', unit: '-', physMin: -128, physMax: 127,
    digMin: -128, digMax: 127, n: 1, reserved: '#1'
  }];
  const buf = makeWmedf(sigs, 3, () => -5);
  const p = parseWmedf(buf);
  check('signed 1-byte channel decodes negative', p.series.Signed[0], -5, 1e-6);
}

function testDeclaredRecordsIgnored () {
  // Header says -1; the true count must come from the file size.
  const sigs = [{
    label: 'X', unit: '-', physMin: 0, physMax: 255,
    digMin: 0, digMax: 255, n: 1, reserved: '#1'
  }];
  const buf = makeWmedf(sigs, 42, () => 1);
  const p = parseWmedf(buf);
  check('unreliable header record count ignored', p.records, 42);
  check('declared count preserved for reference', p.declaredRecords, -1);
}

function testEventDeciseconds () {
  // EndTime/Duration are tenths of a second. Reading them as seconds turns a
  // 2.2-second apnea into 22 seconds.
  const xml = `<?xml version="1.0"?>
<!-- started 1788778675 -->
<desc>
<RespEvent RespEventID = "101" EndTime = "1000" Duration = "22" Pressure = "850" Strength = "0"/>
<RespEvent RespEventID = "112" EndTime = "2000" Duration = "150" Pressure = "900" Strength = "3"/>
<DeviceEvent DeviceEventID="0" Time="0" ParameterID="6" NewValue="2"/>
</desc>`;
  const p = parseEventXml(xml);
  check('event duration converted from deciseconds', p.events[0].duration, 2.2, 1e-9);
  check('event start derived correctly', p.events[0].start, 97.8, 1e-9);
  check('event end converted', p.events[0].end, 100, 1e-9);
  check('pressure converted from pascals', p.events[0].pressure, 8.5, 1e-9);
  check('device event parsed', p.deviceEvents.length, 1);
  check('started-at comment parsed', p.startedAt instanceof Date, true);
}

function testEventClassification () {
  // Epoch windows, structural markers and validity flags must not be counted
  // as discrete respiratory events.
  const xml = `<desc>
<RespEvent RespEventID = "101" EndTime = "100" Duration = "100" Pressure = "0" Strength = "0"/>
<RespEvent RespEventID = "112" EndTime = "200" Duration = "100" Pressure = "0" Strength = "0"/>
<RespEvent RespEventID = "121" EndTime = "300" Duration = "50" Pressure = "0" Strength = "0"/>
<RespEvent RespEventID = "4" EndTime = "400" Duration = "600" Pressure = "0" Strength = "0"/>
<RespEvent RespEventID = "231" EndTime = "500" Duration = "500" Pressure = "0" Strength = "0"/>
<RespEvent RespEventID = "1230" EndTime = "600" Duration = "10" Pressure = "0" Strength = "0"/>
<RespEvent RespEventID = "307" EndTime = "700" Duration = "10" Pressure = "0" Strength = "0"/>
</desc>`;
  const p = parseEventXml(xml);
  const s = buildSession(p, { durationSec: 3600 }, { day: '20260907' });

  check('discrete events exclude epoch/structural/flag', s.discrete.length, 3);
  check('apnea counted', s.apneaCount, 1);
  check('hypopnea counted', s.hypopneaCount, 1);
  check('rera counted', s.reraCount, 1);
  check('epoch duration accumulated separately', s.epochSec.snoreEpoch, 60, 1e-9);
}

function testIndexArithmetic () {
  // 2 apneas + 2 hypopneas over exactly 2 hours => AHI 2.0, RDI 2.5.
  const xml = `<desc>
<RespEvent RespEventID = "101" EndTime = "100" Duration = "100" Pressure = "0" Strength = "0"/>
<RespEvent RespEventID = "102" EndTime = "200" Duration = "100" Pressure = "0" Strength = "0"/>
<RespEvent RespEventID = "111" EndTime = "300" Duration = "100" Pressure = "0" Strength = "0"/>
<RespEvent RespEventID = "112" EndTime = "400" Duration = "100" Pressure = "0" Strength = "0"/>
<RespEvent RespEventID = "121" EndTime = "500" Duration = "100" Pressure = "0" Strength = "0"/>
</desc>`;
  const p = parseEventXml(xml);
  const s = buildSession(p, { durationSec: 7200 }, { day: '20260907' });
  const n = buildNight('20260907', [s]);

  check('AHI = (apnea+hypopnea)/hours', n.ahi, 2.0, 1e-9);
  check('AI = apnea/hours', n.ai, 1.0, 1e-9);
  check('HI = hypopnea/hours', n.hi, 1.0, 1e-9);
  check('RDI includes RERA', n.rdi, 2.5, 1e-9);
  check('central fraction', n.centralFraction, 0.5, 1e-9);
}

function testShortSessionExclusion () {
  // A 10-minute fragment with one apnea would imply AHI 6.0 on its own.
  // It must not drive the night's index when a real session exists.
  const mk = (durSec, ids) => buildSession(
    parseEventXml(`<desc>${ids.map((id, i) =>
      `<RespEvent RespEventID = "${id}" EndTime = "${(i + 1) * 100}" Duration = "100" Pressure = "0" Strength = "0"/>`
    ).join('')}</desc>`),
    { durationSec: durSec }, { day: '20260907' }
  );

  const long = mk(7200, ['101', '101']);      // 2 apneas in 2 h -> AHI 1.0
  const frag = mk(600, ['101']);              // 1 apnea in 10 min
  const night = buildNight('20260907', [long, frag]);

  check('short session excluded from index', night.ahi, 1.0, 1e-9);
  check('short session still counted in usage', night.totalSec, 7800);
  check('usable session count', night.usableSessionCount, 1);
  check('total session count reported', night.sessionCount, 2);

  // If ALL sessions are short, fall back to using them rather than report zero.
  const onlyShort = buildNight('20260908', [mk(600, ['101'])]);
  checkTrue('all-short night still produces an index', onlyShort.ahi > 0);
}

function testNoonBoundary () {
  // statistic.psstat rows carry a session-start timestamp. A session that
  // begins after midnight belongs to the PREVIOUS calendar day's folder.
  // The app shifts by 12 h before keying, which must land on the folder name.
  const shift = (iso) => {
    const d = new Date(iso);
    const s = new Date(d.getTime() - 12 * 3600 * 1000);
    return `${s.getFullYear()}${String(s.getMonth() + 1).padStart(2, '0')}${String(s.getDate()).padStart(2, '0')}`;
  };
  // 01:00 on the 8th is part of the night that started on the 7th.
  check('post-midnight session maps to previous day', shift('2026-09-08T01:00:00'), '20260907');
  // 23:00 on the 7th is also the night of the 7th.
  check('pre-midnight session maps to same day', shift('2026-09-07T23:00:00'), '20260907');
  // 13:00 (an afternoon nap) stays on its own day.
  check('afternoon session maps to same day', shift('2026-09-07T13:00:00'), '20260907');
}

function testConfigParsing () {
  const json = JSON.stringify({
    version: '1.10.7',
    dev: { setversion: '1.10.7', fwversion: '3.17.0008', sn: '0x180e8f7',
           devid: '0x92', hwversion: '196' },
    cfg: { '6': 2, '7': 400, '8': 2000, '9': 400, '10': 1000, '21': 15, '15': 1 }
  });
  const c = parseConfig(json);
  check('therapy mode decoded', c.mode, 'APAP+');
  check('pressure min from pascals', c.pressureMin, 4.0, 1e-9);
  check('pressure max from pascals', c.pressureMax, 20.0, 1e-9);
  check('ramp minutes are not pressure-scaled', c.rampMinutes, 15);
  check('serial read', c.serial, '0x180e8f7');
}

function testStatisticsParsing () {
  const json = JSON.stringify({
    version: '1.2.4',
    dev: { sn: '0x180e8f7', devid: '0x92' },
    days: [
      { day: { '5': 1788821876, '6': 333, '18': 7, '37': 1, '38': 3 } }
    ]
  });
  const s = parseStatistics(json);
  check('statistics day count', s.days.length, 1);
  check('therapy minutes mapped', s.days[0].therapyMinutes, 333);
  check('rera count mapped to field 18', s.days[0].reraCount, 7);
  check('obstructive apnea mapped to field 37', s.days[0].obstructiveApneaCount, 1);
  check('central apnea mapped to field 38', s.days[0].centralApneaCount, 3);
  checkTrue('session start converted to Date', s.days[0].sessionStart instanceof Date);
}

function testClockTimes () {
  // The EDF header carries the DEVICE's wall clock and must win over the
  // event file's unix timestamp, which on real cards disagrees by hours and
  // would place bedtimes in the afternoon.
  const xml = '<desc><!-- started 1788778675 -->' +
    '<RespEvent RespEventID = "101" EndTime = "100" Duration = "100" Pressure = "0" Strength = "0"/>' +
    '</desc>';
  const edfStart = new Date(2026, 8, 7, 22, 57, 56);
  const s = buildSession(parseEventXml(xml),
    { durationSec: 19988, startedAt: edfStart }, { day: '20260907' });

  check('wall clock preferred over epoch', s.startedAt.getHours(), 22);
  checkTrue('epoch timestamp retained separately', s.startedAtEpoch instanceof Date);
  // 22:57:56 + 19988 s = 04:31:04 the next day.
  check('session end computed', s.endedAt.getHours(), 4);
  check('session end crosses midnight', s.endedAt.getDate(), 8);
}

function testNightTiming () {
  // Two sessions with a mask-off gap: bedtime is the first start, wake the
  // last end, and time in bed exceeds therapy time by the gap.
  const mk = (start, durSec) => buildSession(
    parseEventXml('<desc></desc>'),
    { durationSec: durSec, startedAt: start },
    { day: '20260907' }
  );
  const a = mk(new Date(2026, 8, 7, 23, 0, 0), 3600);        // 23:00–00:00
  const b = mk(new Date(2026, 8, 8, 2, 0, 0), 7200);         // 02:00–04:00
  const night = buildNight('20260907', [a, b]);

  check('bedtime is earliest start', night.bedtime.getHours(), 23);
  check('wake is latest end', night.wake.getHours(), 4);
  check('time in bed spans the gap', night.inBedSec, 5 * 3600, 1);
  check('therapy time excludes the gap', night.totalSec, 3 * 3600, 1);
  checkTrue('in-bed exceeds therapy when mask came off',
    night.inBedSec > night.totalSec);

  // Sessions given out of order must still yield the right span.
  const reordered = buildNight('20260907', [b, a]);
  check('ordering does not affect bedtime', reordered.bedtime.getHours(), 23);
  check('ordering does not affect wake', reordered.wake.getHours(), 4);
}

function testHoursFromNoon () {
  // A noon-anchored axis keeps a night contiguous instead of splitting it at
  // midnight: evening values sit below midday, morning values above midnight.
  check('20:00 maps to 8', hoursFromNoon(new Date(2026, 8, 7, 20, 0)), 8, 1e-9);
  check('midnight maps to 12', hoursFromNoon(new Date(2026, 8, 7, 0, 0)), 12, 1e-9);
  check('06:00 maps to 18', hoursFromNoon(new Date(2026, 8, 7, 6, 0)), 18, 1e-9);
  check('noon maps to 0', hoursFromNoon(new Date(2026, 8, 7, 12, 0)), 0, 1e-9);
  checkTrue('evening precedes next morning on the axis',
    hoursFromNoon(new Date(2026, 8, 7, 23, 0)) < hoursFromNoon(new Date(2026, 8, 7, 3, 0)));
  check('null is tolerated', hoursFromNoon(null), null);
}

function testStats () {
  check('median odd', median([3, 1, 2]), 2);
  check('median even', median([1, 2, 3, 4]), 2.5);
  check('percentile interpolates', percentile([0, 10], 50), 5, 1e-9);
  check('p95 of 1..100', percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95), 95.05, 0.06);
  const t = linearTrend([[0, 0], [1, 2], [2, 4]]);
  check('trend slope', t.slope, 2, 1e-9);
}

function testReportRollup () {
  const mkNight = (day, hours, apneas) => {
    const ids = Array.from({ length: apneas }, () => '101');
    const s = buildSession(
      parseEventXml(`<desc>${ids.map((id, i) =>
        `<RespEvent RespEventID = "${id}" EndTime = "${(i + 1) * 100}" Duration = "50" Pressure = "0" Strength = "0"/>`
      ).join('')}</desc>`),
      { durationSec: hours * 3600 }, { day }
    );
    return buildNight(day, [s]);
  };
  // 3 consecutive nights, all compliant.
  const r = buildReport([
    mkNight('20260901', 8, 8),
    mkNight('20260902', 8, 8),
    mkNight('20260903', 8, 8)
  ], { model: 'test' });

  check('total hours summed', r.totalHours, 24, 1e-9);
  check('avg AHI', r.avgAhi, 1.0, 1e-9);
  check('all nights compliant', r.compliantNights, 3);
  check('compliance percent', r.compliancePct, 100, 1e-9);
  check('streak counted', r.streak, 3);
  check('calendar span', r.calendarSpan, 3);
  check('no days skipped', r.daysSkipped, 0);
  checkTrue('insights generated', r.insights.length > 0);
}

function testEmptyAndDegenerate () {
  const empty = parseEventXml('<desc></desc>');
  check('empty event file yields no events', empty.events.length, 0);
  const night = buildNight('20260907', [buildSession(empty, { durationSec: 0 }, { day: '20260907' })]);
  check('zero-duration night has zero AHI', night.ahi, 0);
  check('zero-duration night is not compliant', night.compliant, false);
  const r = buildReport([night], {});
  checkTrue('no-data insight raised', r.insights.some(i => i.id === 'noData'));
}

/* ---------------------------------------------------------------------------
 * Runner
 * -------------------------------------------------------------------------*/

export function run () {
  results.length = 0;
  testMixedByteWidths();
  testSignedByteChannel();
  testDeclaredRecordsIgnored();
  testEventDeciseconds();
  testEventClassification();
  testIndexArithmetic();
  testShortSessionExclusion();
  testNoonBoundary();
  testClockTimes();
  testNightTiming();
  testHoursFromNoon();
  testConfigParsing();
  testStatisticsParsing();
  testStats();
  testReportRollup();
  testEmptyAndDegenerate();

  const failed = results.filter(r => !r.ok);
  for (const r of results) {
    const line = `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`;
    if (r.ok) console.log(line);
    else console.error(`${line}\n      expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.actual)}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return { total: results.length, failed: failed.length, results };
}

// Auto-run under Node.
if (typeof process !== 'undefined' && process.argv?.[1]?.includes('selftest')) {
  const { failed } = run();
  process.exit(failed ? 1 : 0);
}
