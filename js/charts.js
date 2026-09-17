/* ============================================================================
 * charts.js — inline SVG charts. No chart library, no CDN.
 *
 * Everything is drawn with explicit geometry so it prints cleanly and works
 * in both text directions. Charts stay LTR in their internal layout (time
 * flows left-to-right in both languages, matching clinical convention), but
 * labels and tooltips use the active locale's formatting.
 * ========================================================================== */

import { hoursFromNoon } from './analysis.js';

const NS = 'http://www.w3.org/2000/svg';

function el (name, attrs = {}, children = []) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    if (c != null) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function svgRoot (w, h, cls) {
  const s = el('svg', {
    viewBox: `0 0 ${w} ${h}`,
    class: cls,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img'
  });
  s.setAttribute('dir', 'ltr');
  return s;
}

// Right padding leaves room for the threshold label ("AHI 5 threshold" / "4 h")
// anchored to the plot's right edge. Bottom fits two label rows: weekday, date.
const PAD = { top: 16, right: 34, bottom: 48, left: 40 };

function scales (values, w, h, { minZero = true, headroom = 1.12 } = {}) {
  const max = values.length ? Math.max(...values) : 1;
  const min = minZero ? 0 : Math.min(...values, 0);
  const top = Math.max(max * headroom, minZero ? 1 : max);
  const innerW = w - PAD.left - PAD.right;
  const innerH = h - PAD.top - PAD.bottom;
  return {
    innerW, innerH, top, min,
    x: (i, n) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW),
    bx: (i, n) => PAD.left + (i + 0.5) * (innerW / Math.max(n, 1)),
    bw: (n) => Math.max(2, (innerW / Math.max(n, 1)) * 0.68),
    y: (v) => PAD.top + innerH - ((v - min) / (top - min || 1)) * innerH
  };
}

function gridAndAxis (s, w, h, i18n, ticks = 4, fmt = v => i18n.num(v, 0)) {
  const g = el('g', { class: 'grid' });
  for (let i = 0; i <= ticks; i++) {
    const v = s.min + ((s.top - s.min) * i) / ticks;
    const y = s.y(v);
    g.appendChild(el('line', {
      x1: PAD.left, x2: w - PAD.right, y1: y, y2: y,
      class: i === 0 ? 'axis-line' : 'grid-line'
    }));
    g.appendChild(el('text', {
      x: PAD.left - 6, y: y + 3, class: 'tick', 'text-anchor': 'end'
    }, fmt(v)));
  }
  return g;
}

/**
 * Expand a list of nights into a continuous day-by-day calendar series,
 * inserting a placeholder for every date with no data.
 *
 * Without this, a gap in therapy collapses: two bars sit side by side as if
 * they were consecutive nights, which hides missed days and makes the week
 * separators land in the wrong places. Placeholders carry `missing: true` and
 * zeroed metrics, so they render as an empty slot on the axis.
 */
function fillMissingDays (nights) {
  if (nights.length < 2) return nights.map(n => ({ ...n, missing: false }));

  const byKey = new Map();
  for (const n of nights) {
    if (n.dateObj) byKey.set(dayKey(n.dateObj), n);
  }

  const out = [];
  const first = nights[0].dateObj;
  const last = nights[nights.length - 1].dateObj;
  if (!first || !last) return nights.map(n => ({ ...n, missing: false }));

  // Guard against a pathological range: a card spanning years would produce
  // thousands of slots, so fall back to the sparse series.
  const span = Math.round((last - first) / 86400000);
  if (span > 400) return nights.map(n => ({ ...n, missing: false }));

  const cur = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  while (cur <= last) {
    const key = dayKey(cur);
    const night = byKey.get(key);
    if (night) {
      out.push({ ...night, missing: false });
    } else {
      out.push({
        date: key,
        dateObj: new Date(cur.getTime()),
        missing: true,
        hours: 0, totalSec: 0, scoredSec: 0,
        ahi: 0, ai: 0, hi: 0, rdi: 0,
        obstructiveApneaCount: 0, centralApneaCount: 0,
        hypopneaCount: 0, reraCount: 0, snoreCount: 0,
        largeLeakCount: 0, sessionCount: 0,
        pressureP95: null, pressureMedian: null
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function dayKey (d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Axis label for one night: weekday above the date, so weekly patterns are
 * visible at a glance. Hebrew renders א׳ ב׳ ג׳ …, English Sun Mon Tue …
 * Returns [weekday, date].
 */
function dayLabel (night, i18n) {
  return [
    i18n.weekday(night.dateObj, 'narrow'),
    i18n.date(night.dateObj, { day: '2-digit', month: '2-digit' })
  ];
}

/**
 * Render the x axis. `labels` is an array of [weekday, date] pairs; the
 * weekday sits on its own line beneath the axis, the date below it.
 *
 * Weekday labels are drawn for EVERY night even when dates are thinned,
 * because they are short enough never to collide and the weekly rhythm is
 * the point of showing them.
 */
function xLabels (s, n, labels, h) {
  const g = el('g', { class: 'x-labels' });

  // Weekday row: always complete.
  for (let i = 0; i < n; i++) {
    const wd = Array.isArray(labels[i]) ? labels[i][0] : null;
    if (!wd) continue;
    g.appendChild(el('text', {
      x: s.bx(i, n), y: h - PAD.bottom + 14, class: 'tick tick-weekday',
      'text-anchor': 'middle'
    }, wd));
  }
  return withDateRow(g, s, n, labels, h);
}

function withDateRow (g, s, n, labels, h) {
  // Thin the labels so they never collide, keeping the first and last and
  // spacing the rest evenly between them rather than by modulo (which leaves
  // a ragged gap when n is not a multiple of the step).
  const maxLabels = 10;
  const keep = new Set([0, n - 1]);
  if (n > 2) {
    const slots = Math.min(maxLabels, n) - 1;
    for (let k = 1; k < slots; k++) {
      keep.add(Math.round((k / slots) * (n - 1)));
    }
  }
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i < 0 || i >= n) continue;
    const dt = Array.isArray(labels[i]) ? labels[i][1] : labels[i];
    g.appendChild(el('text', {
      x: s.bx(i, n), y: h - PAD.bottom + 27, class: 'tick', 'text-anchor': 'middle'
    }, dt));
  }
  return g;
}

/**
 * Vertical separators between calendar weeks.
 *
 * The Hebrew/Israeli week runs Sunday–Saturday, so a line is drawn after every
 * Saturday — i.e. in the gap before each Sunday. Nights missing from the data
 * are still detected, because the boundary is decided from the dates
 * themselves: a separator is placed wherever consecutive bars straddle a
 * Sunday, including across a multi-day gap.
 */
function weekSeparators (svg, s, data, h) {
  const n = data.length;
  if (n < 2) return;
  const g = el('g', { class: 'week-seps' });

  for (let i = 1; i < n; i++) {
    const prev = data[i - 1].dateObj;
    const cur = data[i].dateObj;
    if (!prev || !cur) continue;

    // With missing days filled in, the series is day-by-day, so a new week
    // simply starts on any Sunday. (The walk still handles a sparse series,
    // which happens when the range is too long to expand.)
    let crosses = false;
    const step = new Date(prev.getTime());
    step.setDate(step.getDate() + 1);
    while (step <= cur) {
      if (step.getDay() === 0) { crosses = true; break; }
      step.setDate(step.getDate() + 1);
    }
    if (!crosses) continue;

    // Place the line midway between the two slots.
    const x = (s.bx(i - 1, n) + s.bx(i, n)) / 2;
    g.appendChild(el('line', {
      x1: x, x2: x, y1: PAD.top - 4, y2: h - PAD.bottom, class: 'week-sep'
    }));
  }
  if (g.childNodes.length) svg.appendChild(g);
}

/** A dashed reference line with its label placed inside the plot area. */
function thresholdLine (svg, s, w, value, text) {
  const y = s.y(value);
  svg.appendChild(el('line', {
    x1: PAD.left, x2: w - PAD.right, y1: y, y2: y, class: 'threshold'
  }));
  svg.appendChild(el('text', {
    x: w - PAD.right - 2, y: y - 5, class: 'threshold-label', 'text-anchor': 'end'
  }, text));
}

function tooltipTitle (node, text) {
  node.appendChild(el('title', {}, text));
  return node;
}

/* ---------------------------------------------------------------------------
 * AHI per night, with the clinical threshold marked.
 * -------------------------------------------------------------------------*/
export function ahiChart (nights, i18n, { w = 720, h = 220 } = {}) {
  if (nights.filter(n => n.hours > 0).length < 2) return null;
  const data = fillMissingDays(nights);
  const values = data.filter(n => n.hours > 0).map(n => n.ahi);
  const s = scales([...values, 5], w, h);
  const svg = svgRoot(w, h, 'chart');
  svg.appendChild(gridAndAxis(s, w, h, i18n));
  weekSeparators(svg, s, data, h);

  thresholdLine(svg, s, w, 5, i18n.t('thresholdLine'));

  const n = data.length;

  // Sleep duration behind each bar.
  //
  // This axis is events per hour, which sleep hours cannot share, so the band
  // is drawn PROPORTIONALLY: the longest sleep in the period fills the plot
  // and the rest scale against it. That makes it a relative backdrop — night
  // to night, did you sleep more or less — and never a reading off the y axis.
  // The tooltip gives the actual hours so nothing has to be eyeballed.
  const sleepSecs = data.filter(d => d.sleep).map(d => d.sleep.totalSleepSec);
  const maxSleep = sleepSecs.length ? Math.max(...sleepSecs) : 0;
  if (maxSleep > 0) {
    const plotTop = PAD.top;
    const plotBottom = s.y(s.min);
    data.forEach((night, i) => {
      if (!night.sleep || night.sleep.totalSleepSec <= 0) return;
      const frac = night.sleep.totalSleepSec / maxSleep;
      const bandH = (plotBottom - plotTop) * frac;
      const bw = s.bw(n) * 1.5;
      const band = el('rect', {
        x: s.bx(i, n) - bw / 2, y: plotBottom - bandH, width: bw,
        height: Math.max(1, bandH), rx: 2, class: 'sleep-back'
      });
      tooltipTitle(band,
        `${i18n.t('sleepBandLabel')} — ${i18n.date(night.dateObj)}: ` +
        `${i18n.duration(night.sleep.totalSleepSec)}\n\n${i18n.t('gSleepRelative')}`);
      svg.appendChild(band);
    });
  }

  data.forEach((night, i) => {
    const bw = s.bw(n);
    // A day with no therapy gets a faint baseline stub, so the gap is visible
    // as an absence rather than silently closing up.
    if (night.missing || night.hours <= 0) {
      const stub = el('rect', {
        x: s.bx(i, n) - bw / 2, y: s.y(s.min) - 2, width: bw, height: 2,
        class: 'bar bar-missing'
      });
      tooltipTitle(stub, `${i18n.date(night.dateObj)} — ${i18n.t('noUse')}`);
      svg.appendChild(stub);
      return;
    }
    const v = night.ahi;
    const y = s.y(v);
    const band = v < 5 ? 'good' : v < 15 ? 'warn' : 'bad';
    const bar = el('rect', {
      x: s.bx(i, n) - bw / 2, y, width: bw, height: Math.max(1, s.y(s.min) - y),
      rx: 2, class: `bar bar-${band}`
    });
    tooltipTitle(bar,
      `AHI — ${i18n.date(night.dateObj)}: ${i18n.num(v)}` +
      `

${i18n.t('gAhi')}`);
    svg.appendChild(bar);
  });

  svg.appendChild(xLabels(s, n, data.map(d => dayLabel(d, i18n)), h));
  return svg;
}

/* ---------------------------------------------------------------------------
 * Usage hours per night, with the 4-hour benchmark.
 * -------------------------------------------------------------------------*/
export function usageChart (nights, i18n, { w = 720, h = 200 } = {}) {
  if (nights.length < 2) return null;
  const data = fillMissingDays(nights);
  const values = data.map(n => n.totalSec / 3600);
  // Sleep hours share this axis exactly — both are hours — so the watch data
  // is included in the scale to keep a long sleep from overflowing the plot.
  const sleepHours = data
    .filter(n => n.sleep)
    .map(n => n.sleep.totalSleepSec / 3600);
  const s = scales([...values, ...sleepHours, 4], w, h);
  const svg = svgRoot(w, h, 'chart');
  svg.appendChild(gridAndAxis(s, w, h, i18n, 4, v => i18n.num(v, 0)));
  weekSeparators(svg, s, data, h);

  thresholdLine(svg, s, w, 4, i18n.t('complianceLine'));

  const n = data.length;

  // Total sleep behind each bar. Drawn first so the therapy bar sits on top:
  // the grey sticking out above is time asleep without the mask.
  data.forEach((night, i) => {
    if (!night.sleep) return;
    const hrs = night.sleep.totalSleepSec / 3600;
    if (hrs <= 0) return;
    const bw = s.bw(n) * 1.5;
    const y = s.y(hrs);
    const band = el('rect', {
      x: s.bx(i, n) - bw / 2, y, width: bw,
      height: Math.max(1, s.y(s.min) - y), rx: 2, class: 'sleep-back'
    });
    tooltipTitle(band,
      `${i18n.t('sleepBandLabel')} — ${i18n.date(night.dateObj)}: ` +
      `${i18n.duration(night.sleep.totalSleepSec)}\n\n${i18n.t('gSleepBack')}`);
    svg.appendChild(band);
  });

  data.forEach((night, i) => {
    const v = night.totalSec / 3600;
    const y = s.y(v);
    const bw = s.bw(n);
    const bar = el('rect', {
      x: s.bx(i, n) - bw / 2, y: v > 0 ? y : s.y(s.min) - 2, width: bw,
      height: v > 0 ? Math.max(1, s.y(s.min) - y) : 2,
      rx: 2,
      class: `bar ${v >= 4 ? 'bar-good' : v > 0 ? 'bar-warn' : 'bar-missing'}`
    });
    tooltipTitle(bar,
      `${i18n.t('colUse')} — ${i18n.date(night.dateObj)}: ${
        v > 0 ? i18n.duration(night.totalSec) : i18n.t('noUse')}` +
      `

${i18n.t('gUsage')}`);
    svg.appendChild(bar);
  });

  svg.appendChild(xLabels(s, n, data.map(d => dayLabel(d, i18n)), h));
  return svg;
}

/* ---------------------------------------------------------------------------
 * Stacked event composition per night.
 * -------------------------------------------------------------------------*/
const COMPOSITION = [
  { key: 'obstructiveApneaCount', cls: 'seg-oa', label: 'legendObstructive', help: 'gOa' },
  { key: 'centralApneaCount',     cls: 'seg-ca', label: 'legendCentral',     help: 'gCa' },
  { key: 'hypopneaCount',         cls: 'seg-hy', label: 'legendHypopnea',    help: 'gHypopneaEvent' },
  { key: 'reraCount',             cls: 'seg-re', label: 'legendRera',        help: 'gRera' }
];

export function compositionChart (nights, i18n, { w = 720, h = 220 } = {}) {
  if (nights.filter(n => n.hours > 0).length < 2) return null;
  const data = fillMissingDays(nights);
  const totals = data.map(n => COMPOSITION.reduce((s, c) => s + (n[c.key] || 0), 0));
  const s = scales(totals, w, h);
  const svg = svgRoot(w, h, 'chart');
  svg.appendChild(gridAndAxis(s, w, h, i18n));
  weekSeparators(svg, s, data, h);

  const n = data.length;
  data.forEach((night, i) => {
    let acc = 0;
    const bw = s.bw(n);
    for (const c of COMPOSITION) {
      const v = night[c.key] || 0;
      if (!v) continue;
      const yTop = s.y(acc + v);
      const yBot = s.y(acc);
      const rect = el('rect', {
        x: s.bx(i, n) - bw / 2, y: yTop, width: bw,
        height: Math.max(1, yBot - yTop), class: `bar ${c.cls}`
      });
      // Hovering a segment explains what the event type actually is, not just
      // its count — the legend alone assumes the reader knows the jargon.
      tooltipTitle(rect,
        `${i18n.t(c.label)} — ${i18n.date(night.dateObj)}: ${i18n.int(v)}` +
        `\n\n${i18n.t(c.help)}`);
      svg.appendChild(rect);
      acc += v;
    }
  });

  svg.appendChild(xLabels(s, n, data.map(d => dayLabel(d, i18n)), h));
  return svg;
}

export function compositionLegend (i18n) {
  const wrap = document.createElement('div');
  wrap.className = 'legend';
  for (const c of COMPOSITION) {
    const item = document.createElement('span');
    item.className = 'legend-item has-help';
    // The legend explains itself on hover as well, since that is where a
    // reader looks first when a label is unfamiliar.
    item.title = `${i18n.t(c.label)}\n\n${i18n.t(c.help)}`;
    const sw = document.createElement('i');
    sw.className = `swatch ${c.cls}`;
    item.append(sw, document.createTextNode(i18n.t(c.label)));
    wrap.appendChild(item);
  }
  return wrap;
}

/* ---------------------------------------------------------------------------
 * Pressure: median line with p95 area.
 * -------------------------------------------------------------------------*/
export function pressureChart (nights, i18n, { w = 720, h = 190 } = {}) {
  if (nights.filter(n => n.pressureP95 != null).length < 2) return null;
  const data = fillMissingDays(nights);
  const s = scales(data.filter(n => n.pressureP95 != null).map(n => n.pressureP95),
    w, h, { headroom: 1.2 });
  const svg = svgRoot(w, h, 'chart');
  svg.appendChild(gridAndAxis(s, w, h, i18n, 4, v => i18n.num(v, 0)));
  weekSeparators(svg, s, data, h);

  const n = data.length;
  // Break the line wherever a day has no pressure, rather than interpolating
  // across a gap and implying therapy continued.
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      svg.appendChild(el('polyline', {
        points: run.map(p => p.join(',')).join(' '), class: 'line line-pressure'
      }));
    }
    run = [];
  };
  data.forEach((night, i) => {
    if (night.pressureP95 == null) { flush(); return; }
    run.push([s.bx(i, n), s.y(night.pressureP95)]);
  });
  flush();

  data.forEach((night, i) => {
    if (night.pressureP95 == null) return;
    const c = el('circle', {
      cx: s.bx(i, n), cy: s.y(night.pressureP95), r: 3, class: 'dot'
    });
    tooltipTitle(c,
      `${i18n.t('colPressure')} — ${i18n.date(night.dateObj)}: ${i18n.num(night.pressureP95)} cmH₂O` +
      `

${i18n.t('gP95')}`);
    svg.appendChild(c);
  });

  svg.appendChild(xLabels(s, n, data.map(d => dayLabel(d, i18n)), h));
  return svg;
}

/* ---------------------------------------------------------------------------
 * Sleep timing — one candle per night, bedtime to wake.
 *
 * Read like a stock candle: the thin wick is the whole time in bed (first
 * mask-on to last mask-off), and the thick body is the therapy time within it.
 * A night with mask-off gaps shows a wick noticeably longer than its body.
 *
 * The y axis runs from midday to midday so a night is one continuous span
 * instead of being cut in half at midnight.
 * -------------------------------------------------------------------------*/
export function sleepTimingChart (nights, i18n, { w = 720, h = 260 } = {}) {
  const timed = nights.filter(n => n.bedtime && n.wake);
  if (timed.length < 2) return null;

  const data = fillMissingDays(nights);
  const n = data.length;

  // Axis bounds in hours-from-noon, padded to whole hours and clamped to the
  // 24 h window. Most people's nights occupy a narrow band, so fitting the
  // axis to the data keeps the candles large.
  let lo = Infinity, hi = -Infinity;
  for (const night of timed) {
    const a = hoursFromNoon(night.bedtime);
    const b = a + night.inBedSec / 3600;
    if (a < lo) lo = a;
    if (b > hi) hi = b;
  }
  // Watch sleep often begins before the mask goes on and ends after it comes
  // off, so the axis has to cover it too or the grey band would be clipped.
  for (const night of nights) {
    if (!night.sleep?.start) continue;
    const a = hoursFromNoon(night.sleep.start);
    const b = a + (night.sleep.inBedSec || night.sleep.totalSleepSec) / 3600;
    if (a < lo) lo = a;
    if (b > hi) hi = b;
  }
  lo = Math.max(0, Math.floor(lo - 0.5));
  hi = Math.min(24, Math.ceil(hi + 0.5));
  if (hi - lo < 4) hi = Math.min(24, lo + 4);

  const innerW = w - PAD.left - PAD.right;
  const innerH = h - PAD.top - PAD.bottom;
  // Time runs UPWARD: earliest at the bottom, latest at the top, so a candle
  // grows the way a stock candle does and a later wake time reads as higher.
  const y = (hoursFromNoonValue) =>
    PAD.top + innerH - ((hoursFromNoonValue - lo) / (hi - lo)) * innerH;

  const svg = svgRoot(w, h, 'chart');

  // Horizontal grid at clock hours, labelled in the reader's locale.
  const grid = el('g', { class: 'grid' });
  const stepH = (hi - lo) > 12 ? 3 : (hi - lo) > 6 ? 2 : 1;
  for (let t = Math.ceil(lo); t <= hi; t += stepH) {
    const yy = y(t);
    grid.appendChild(el('line', {
      x1: PAD.left, x2: w - PAD.right, y1: yy, y2: yy, class: 'grid-line'
    }));
    // t is hours from noon; convert back to a clock hour.
    const clock = (t + 12) % 24;
    grid.appendChild(el('text', {
      x: PAD.left - 6, y: yy + 3, class: 'tick', 'text-anchor': 'end'
    }, `${String(Math.floor(clock)).padStart(2, '0')}:00`));
    // Midnight deserves emphasis: it is the line every night crosses.
    if (Math.abs(clock) < 0.01) {
      grid.appendChild(el('line', {
        x1: PAD.left, x2: w - PAD.right, y1: yy, y2: yy, class: 'midnight-line'
      }));
    }
  }
  svg.appendChild(grid);
  weekSeparators(svg, { bx: (i, k) => PAD.left + (i + 0.5) * (innerW / Math.max(k, 1)) }, data, h);

  const bx = (i) => PAD.left + (i + 0.5) * (innerW / Math.max(n, 1));
  const bw = Math.max(3, (innerW / Math.max(n, 1)) * 0.5);

  data.forEach((night, i) => {
    const x = bx(i);
    if (!night.bedtime || !night.wake) {
      // No therapy: a short tick at the axis baseline, so the day still shows.
      const base = h - PAD.bottom;
      const tick = el('line', {
        x1: x, x2: x, y1: base - 3, y2: base, class: 'candle-missing'
      });
      tooltipTitle(tick, `${i18n.date(night.dateObj)} — ${i18n.t('noUse')}`);
      svg.appendChild(tick);
      return;
    }

    const start = hoursFromNoon(night.bedtime);
    const end = start + night.inBedSec / 3600;
    // With time running upward, the later moment is the HIGHER pixel, so the
    // start is at the bottom of the candle and the end at the top.
    const yStart = y(start);
    const yEnd = y(end);

    // Watch-measured sleep, drawn FIRST so it sits behind the therapy blocks.
    // A wide grey band spanning the time the watch says you were actually
    // asleep: where it extends past the therapy block, you slept without the
    // mask; where the therapy block extends past it, the machine was running
    // while you were awake.
    if (night.sleep?.start) {
      const sleepStart = hoursFromNoon(night.sleep.start);
      const sleepEnd = sleepStart + (night.sleep.inBedSec || night.sleep.totalSleepSec) / 3600;
      const yS = y(sleepStart), yE = y(sleepEnd);
      const band = el('rect', {
        x: x - bw * 0.85, y: Math.min(yS, yE), width: bw * 1.7,
        height: Math.max(2, Math.abs(yS - yE)), rx: 2, class: 'sleep-band'
      });
      tooltipTitle(band,
        `${i18n.t('sleepBandLabel')} — ${i18n.date(night.dateObj)}: ` +
        `${i18n.time(night.sleep.start)}–${night.sleep.end ? i18n.time(night.sleep.end) : '—'}` +
        `\n${i18n.t('sleepAsleep')} ${i18n.duration(night.sleep.totalSleepSec)}` +
        `\n\n${i18n.t('gSleepBand')}`);
      svg.appendChild(band);
    }

    // Wick: whole time in bed.
    const wick = el('line', {
      x1: x, x2: x, y1: yEnd, y2: yStart, class: 'candle-wick'
    });
    svg.appendChild(wick);

    // Bodies: one block per mask-on session, positioned at the clock time it
    // actually occupied. A night interrupted by a long mask-off period then
    // shows two separated blocks with a bare wick between them, rather than
    // one block implying continuous therapy from bedtime.
    const good = night.totalSec >= 4 * 3600;
    const cls = `candle-body ${good ? 'candle-good' : 'candle-warn'}`;
    const label =
      `${i18n.date(night.dateObj, { weekday: 'short', day: '2-digit', month: 'short' })}` +
      ` · ${i18n.time(night.bedtime)} – ${i18n.time(night.wake)}` +
      ` · ${i18n.t('colUse')} ${i18n.duration(night.totalSec)}`;

    const segments = (night.sessions || [])
      .filter(sn => sn.startedAt && sn.durationSec > 0)
      .map(sn => {
        // Offset from the night's start, so a session after midnight sits
        // above one before it rather than wrapping around the axis.
        const offsetH = (sn.startedAt - night.bedtime) / 3600000;
        return { from: start + offsetH, to: start + offsetH + sn.durationSec / 3600 };
      });

    if (!segments.length) segments.push({ from: start, to: end });

    for (const seg of segments) {
      const yFrom = y(seg.from);   // lower on screen
      const yTo = y(seg.to);       // higher on screen
      const rect = el('rect', {
        x: x - bw / 2, y: Math.min(yFrom, yTo), width: bw,
        height: Math.max(2, Math.abs(yFrom - yTo)),
        rx: 2, class: cls
      });
      tooltipTitle(rect, label);
      svg.appendChild(rect);
    }

    // Caps mark the exact clock moments the wick ends.
    for (const yy of [yEnd, yStart]) {
      svg.appendChild(el('line', {
        x1: x - bw / 2, x2: x + bw / 2, y1: yy, y2: yy, class: 'candle-cap'
      }));
    }
  });

  svg.appendChild(xLabels(
    { bx: (i, k) => PAD.left + (i + 0.5) * (innerW / Math.max(k, 1)) },
    n, data.map(d => dayLabel(d, i18n)), h));
  return svg;
}

/* ---------------------------------------------------------------------------
 * Waveform preview for one decoded channel.
 * Downsamples to min/max per pixel column so spikes survive.
 * -------------------------------------------------------------------------*/
export function waveformChart (samples, hz, i18n, { w = 720, h = 150, label = '' } = {}) {
  if (!samples || !samples.length) return null;
  const svg = svgRoot(w, h, 'chart chart-wave');
  const innerW = w - PAD.left - PAD.right;
  const innerH = h - PAD.top - PAD.bottom;
  const cols = Math.min(Math.floor(innerW), samples.length);
  const per = samples.length / cols;

  let lo = Infinity, hi = -Infinity;
  for (const v of samples) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo === hi) { lo -= 1; hi += 1; }
  const y = (v) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;

  // Zero line, where zero is inside the range (flow signals).
  if (lo < 0 && hi > 0) {
    svg.appendChild(el('line', {
      x1: PAD.left, x2: w - PAD.right, y1: y(0), y2: y(0), class: 'grid-line'
    }));
  }

  const d = [];
  for (let c = 0; c < cols; c++) {
    const start = Math.floor(c * per);
    const end = Math.min(samples.length, Math.floor((c + 1) * per));
    let mn = Infinity, mx = -Infinity;
    for (let i = start; i < end; i++) {
      const v = samples[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (mn === Infinity) continue;
    const x = PAD.left + (c / Math.max(cols - 1, 1)) * innerW;
    d.push(`M${x.toFixed(2)},${y(mx).toFixed(2)}L${x.toFixed(2)},${y(mn).toFixed(2)}`);
  }
  svg.appendChild(el('path', { d: d.join(''), class: 'wave' }));

  svg.appendChild(el('text', { x: PAD.left, y: 11, class: 'tick' }, label));
  // Time axis in minutes.
  const totalSec = samples.length / (hz || 1);
  const g = el('g');
  for (let i = 0; i <= 4; i++) {
    const frac = i / 4;
    const x = PAD.left + frac * innerW;
    const mins = Math.round((totalSec * frac) / 60);
    g.appendChild(el('text', {
      x, y: h - PAD.bottom + 15, class: 'tick', 'text-anchor': 'middle'
    }, `${i18n.int(mins)}′`));
  }
  svg.appendChild(g);
  return svg;
}

/* ---------------------------------------------------------------------------
 * Restorative sleep (REM + deep) on therapy nights vs nights without.
 *
 * IMPORTANT: this is an OBSERVATIONAL comparison, not a controlled one. The
 * untreated group is simply "nights the watch saw sleep and the card did not",
 * which skews toward travel, illness and nights off — each of which changes
 * sleep architecture on its own. The chart therefore always shows the number
 * of nights behind each bar, and the caller suppresses it entirely below three
 * nights a side.
 * -------------------------------------------------------------------------*/
export function sleepStageComparisonChart (report, i18n, { w = 720, h = 250 } = {}) {
  const s = report.sleep;
  if (!s || !s.comparable) return null;

  const groups = [
    { key: 'treated',   label: i18n.t('sleepWithCpap'),    d: s.treated,   cls: 'bar-good' },
    { key: 'untreated', label: i18n.t('sleepWithoutCpap'), d: s.untreated, cls: 'bar-warn' }
  ];

  const values = groups.map(g => g.d.deepRemPct).filter(v => v != null);
  if (values.length < 2) return null;

  const scale = scales([...values, 100], w, h, { headroom: 1 });
  const svg = svgRoot(w, h, 'chart');
  svg.appendChild(gridAndAxis(scale, w, h, i18n, 4, v => `${i18n.num(v, 0)}%`));

  const innerW = w - PAD.left - PAD.right;
  const n = groups.length;
  const bw = Math.min(140, (innerW / n) * 0.5);

  groups.forEach((g, i) => {
    // Centre the pair rather than spreading them the full plot width, which
    // would put two lonely bars at opposite edges.
    const x = PAD.left + innerW * ((i + 0.5) / n);
    const v = g.d.deepRemPct;
    if (v == null) return;
    const yTop = scale.y(v);

    // Stacked: deep at the bottom, REM above it, so the split is visible and
    // the total still reads as one bar height.
    let acc = 0;
    for (const part of [
      { v: g.d.deepPct, cls: 'seg-deep', label: i18n.t('sleepDeep') },
      { v: g.d.remPct,  cls: 'seg-rem',  label: i18n.t('sleepRem') }
    ]) {
      if (part.v == null || part.v <= 0) continue;
      const y0 = scale.y(acc), y1 = scale.y(acc + part.v);
      const rect = el('rect', {
        x: x - bw / 2, y: y1, width: bw, height: Math.max(1, y0 - y1),
        rx: 2, class: `bar ${part.cls}`
      });
      tooltipTitle(rect, `${part.label} — ${g.label}: ${i18n.num(part.v)}%`);
      svg.appendChild(rect);
      acc += part.v;
    }

    // Total above the bar, with the night count that produced it.
    svg.appendChild(el('text', {
      x, y: yTop - 8, class: 'donut-value', 'text-anchor': 'middle'
    }, `${i18n.num(v)}%`));
    svg.appendChild(el('text', {
      x, y: h - PAD.bottom + 16, class: 'tick', 'text-anchor': 'middle'
    }, g.label));
    svg.appendChild(el('text', {
      x, y: h - PAD.bottom + 30, class: 'tick tick-weekday', 'text-anchor': 'middle'
    }, `${i18n.int(g.d.count)} ${i18n.t(g.d.count === 1 ? 'sleepNight' : 'sleepNights')}`));
  });

  return svg;
}

export function sleepStageLegend (i18n) {
  const wrap = document.createElement('div');
  wrap.className = 'legend';
  for (const c of [
    { cls: 'seg-deep', label: i18n.t('sleepDeep'), help: 'gSleepDeep' },
    { cls: 'seg-rem',  label: i18n.t('sleepRem'),  help: 'gSleepRem' }
  ]) {
    const item = document.createElement('span');
    item.className = 'legend-item has-help';
    item.title = `${c.label}\n\n${i18n.t(c.help)}`;
    const sw = document.createElement('i');
    sw.className = `swatch ${c.cls}`;
    item.append(sw, document.createTextNode(c.label));
    wrap.appendChild(item);
  }
  return wrap;
}

/* ---------------------------------------------------------------------------
 * Small inline sparkline-style donut for the event mix.
 * -------------------------------------------------------------------------*/
export function mixDonut (report, i18n, { size = 132 } = {}) {
  const parts = [
    { v: report.totalObstructive, cls: 'seg-oa', label: i18n.t('legendObstructive') },
    { v: report.totalCentral,     cls: 'seg-ca', label: i18n.t('legendCentral') },
    { v: report.totalHypopneas,   cls: 'seg-hy', label: i18n.t('legendHypopnea') },
    { v: report.totalReras,       cls: 'seg-re', label: i18n.t('legendRera') }
  ].filter(p => p.v > 0);
  const total = parts.reduce((s, p) => s + p.v, 0);
  if (!total) return null;

  const svg = svgRoot(size, size, 'donut');
  const r = size / 2 - 10;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  for (const p of parts) {
    const frac = p.v / total;
    const c = el('circle', {
      cx, cy, r, fill: 'none', 'stroke-width': 14,
      class: `ring ${p.cls}`,
      'stroke-dasharray': `${(frac * circ).toFixed(2)} ${circ.toFixed(2)}`,
      'stroke-dashoffset': (-offset * circ).toFixed(2),
      transform: `rotate(-90 ${cx} ${cy})`
    });
    tooltipTitle(c, `${p.label}: ${i18n.int(p.v)} (${i18n.num(frac * 100, 0)}%)`);
    svg.appendChild(c);
    offset += frac;
  }
  svg.appendChild(el('text', {
    x: cx, y: cy - 2, class: 'donut-value', 'text-anchor': 'middle'
  }, i18n.int(total)));
  svg.appendChild(el('text', {
    x: cx, y: cy + 14, class: 'donut-label', 'text-anchor': 'middle'
  }, i18n.t('eventsTotal')));
  return svg;
}
