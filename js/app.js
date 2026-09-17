/* ============================================================================
 * app.js — UI wiring and rendering.
 * ========================================================================== */

import { detectLanguage, persistLanguage, makeI18n, LANGS } from './i18n.js';
import {
  entriesFromFileList, entriesFromDirHandle, looksLikePrismaCard,
  scanCard, decodeWaveform
} from './scan.js';
import { ahiBand, MIN_SESSION_SEC } from './analysis.js';
import {
  ahiChart, usageChart, compositionChart, compositionLegend,
  pressureChart, sleepTimingChart, waveformChart, mixDonut,
  sleepStageComparisonChart, sleepStageLegend, usageLegend
} from './charts.js';
import {
  loadCredentials, saveCredentials, clearCredentials, redirectUri,
  authorize, exchangeCode, fetchSleepSummary, attachSleep,
  handleOAuthCallback
} from './withings.js';

let i18n = makeI18n(detectLanguage());
let report = null;

const $ = (sel) => document.querySelector(sel);
const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* ---------------------------------------------------------------------------
 * Boot
 * -------------------------------------------------------------------------*/

function init () {
  applyLanguage(i18n.lang);

  const picker = $('#folder-input');
  $('#pick-btn').addEventListener('click', async () => {
    // Prefer the File System Access API when available: it gives a real
    // directory handle and a nicer permission prompt. Fall back to the
    // webkitdirectory input everywhere else (Firefox, Safari).
    if (window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker({ id: 'cpap-card', mode: 'read' });
        const entries = await entriesFromDirHandle(handle);
        await run(entries);
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;   // user cancelled
        // Any other failure: fall through to the input element.
      }
    }
    picker.click();
  });

  picker.addEventListener('change', async () => {
    if (picker.files && picker.files.length) {
      await run(entriesFromFileList(picker.files));
    }
  });

  // Drag and drop of a folder.
  const zone = $('#drop-zone');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragging');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const entries = await entriesFromDataTransfer(e.dataTransfer);
    if (entries.length) await run(entries);
  });

  $('#lang-select').addEventListener('change', (e) => {
    const lang = e.target.value;
    persistLanguage(lang);
    i18n = makeI18n(lang);
    applyLanguage(lang);
    if (report) render(report);
  });

  $('#reset-btn').addEventListener('click', () => {
    report = null;
    $('#results').hidden = true;
    $('#intro').hidden = false;
    $('#folder-input').value = '';
    window.scrollTo({ top: 0 });
  });

  $('#print-btn').addEventListener('click', () => window.print());
  $('#csv-btn').addEventListener('click', exportCsv);
  $('#json-btn').addEventListener('click', exportJson);
}

/** Walk a dropped folder via the legacy webkitGetAsEntry API. */
async function entriesFromDataTransfer (dt) {
  const roots = [];
  for (const item of dt.items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  const out = [];
  async function walk (entry, prefix) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      out.push({ path, getFile: () => new Promise((res, rej) => entry.file(res, rej)) });
    } else if (entry.isDirectory) {
      if (/^(System Volume Information|\$RECYCLE\.BIN)$/i.test(entry.name)) return;
      const reader = entry.createReader();
      const kids = await new Promise((res) => {
        const acc = [];
        const step = () => reader.readEntries((batch) => {
          if (!batch.length) return res(acc);
          acc.push(...batch);
          step();
        }, () => res(acc));
        step();
      });
      for (const k of kids) await walk(k, path);
    }
  }
  for (const r of roots) await walk(r, '');
  return out;
}

function applyLanguage (lang) {
  const meta = LANGS[lang] || LANGS.en;
  document.documentElement.lang = lang;
  document.documentElement.dir = meta.dir;
  $('#lang-select').value = lang;
  // Static chrome
  $('#app-title').textContent = i18n.t('appTitle');
  $('#app-subtitle').textContent = i18n.t('appSubtitle');
  $('#privacy-note').textContent = i18n.t('privacyNote');
  $('#pick-btn').textContent = i18n.t('chooseFolder');
  $('#drop-hint').textContent = i18n.t('dropHint');
  $('#drop-or').textContent = i18n.t('dropOr');
  $('#reset-btn').textContent = i18n.t('reset');
  $('#print-btn').textContent = i18n.t('print');
  $('#csv-btn').textContent = i18n.t('exportCsv');
  $('#json-btn').textContent = i18n.t('exportJson');
  $('#lang-label').textContent = i18n.t('langLabel');
  document.title = i18n.t('appTitle');

  // Credits on the landing screen: rebuilt on every language change so they
  // are correct before any folder is picked.
  const introCredits = $('#intro-credits');
  introCredits.replaceChildren();
  renderCredits(introCredits, true);
}

/* ---------------------------------------------------------------------------
 * Run
 * -------------------------------------------------------------------------*/

async function run (entries) {
  const status = $('#status');
  const statusText = $('#status-text');
  const bar = $('#status-bar').firstElementChild;

  $('#intro').hidden = false;
  status.hidden = false;
  status.className = 'status';
  statusText.textContent = i18n.t('scanning');
  bar.style.inlineSize = '0';

  try {
    if (!entries.length) throw new Error(i18n.t('errNoFiles'));
    if (!looksLikePrismaCard(entries)) throw new Error(i18n.t('errNotPrisma'));

    // Yield so the spinner paints before the heavy synchronous work starts.
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    let lastPaint = 0;
    report = await scanCard(entries, async (done, total) => {
      statusText.textContent = i18n.t('parsing', { n: done, total });
      bar.style.inlineSize = `${Math.round((done / total) * 100)}%`;
      // Hand control back to the renderer a few times a second so the spinner
      // keeps turning and the bar visibly advances; parsing is otherwise a
      // tight synchronous loop that would freeze both.
      const now = performance.now();
      if (now - lastPaint > 80) {
        lastPaint = now;
        await new Promise(r => requestAnimationFrame(() => r()));
      }
    });

    statusText.textContent = i18n.t('rendering');
    bar.style.inlineSize = '100%';
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    render(report);
    status.hidden = true;
    $('#intro').hidden = true;
    $('#results').hidden = false;
    window.scrollTo({ top: 0 });
  } catch (err) {
    status.hidden = false;
    status.className = 'status error';
    statusText.textContent = err.message || i18n.t('errGeneric');
    console.error(err);
  }
}

/* ---------------------------------------------------------------------------
 * Render
 * -------------------------------------------------------------------------*/

function render (r) {
  renderDevice(r);
  renderSummary(r);
  renderWithings(r);
  renderInsights(r);
  renderCharts(r);
  renderTable(r);
  renderGlossary(r);
  renderAppendix(r);
  renderErrors(r);
}

function renderDevice (r) {
  const box = $('#device');
  box.replaceChildren();
  box.appendChild(h('h2', null, i18n.t('deviceTitle')));
  const dl = h('dl', 'kv');
  const cfg = r.device.config;
  const rows = [
    [i18n.t('deviceModel'), r.device.model || i18n.t('unknown')],
    [i18n.t('deviceSerial'), r.device.serial || i18n.t('unknown')],
    [i18n.t('deviceFirmware'), r.device.firmware || i18n.t('unknown')],
    [i18n.t('devicePlatform'), r.device.platform || i18n.t('unknown')],
    [i18n.t('deviceMode'), cfg?.mode || i18n.t('unknown')],
    [i18n.t('devicePressure'), formatPressure(cfg)],
    [i18n.t('deviceRamp'), cfg?.rampMinutes ? i18n.t('minutes', { n: cfg.rampMinutes }) : '—']
  ];
  for (const [k, v] of rows) {
    dl.append(h('dt', null, k), h('dd', null, v));
  }
  box.appendChild(dl);
}

function formatPressure (cfg) {
  if (!cfg) return '—';
  if (cfg.pressureMin != null && cfg.pressureMax != null && cfg.pressureMin !== cfg.pressureMax) {
    return `${i18n.num(cfg.pressureMin)}–${i18n.num(cfg.pressureMax)} cmH₂O`;
  }
  if (cfg.pressureSet != null) return `${i18n.num(cfg.pressureSet)} cmH₂O`;
  return '—';
}

function renderSummary (r) {
  const box = $('#summary');
  box.replaceChildren();
  box.appendChild(h('h2', null, i18n.t('summaryTitle')));

  const first = r.nights[0]?.dateObj;
  const last = r.nights[r.nights.length - 1]?.dateObj;

  const grid = h('div', 'cards');
  const card = (label, value, sub, band) => {
    const c = h('div', `card${band ? ' card-' + band : ''}`);
    c.append(h('div', 'card-label', label), h('div', 'card-value', value));
    if (sub) c.appendChild(h('div', 'card-sub', sub));
    return c;
  };

  grid.append(
    card(i18n.t('avgAhi'), i18n.num(r.avgAhi),
      i18n.t(r.band || 'normal'), bandClass(r.avgAhi)),
    card(i18n.t('avgUsage'), `${i18n.num(r.avgHours)} ${i18n.t('hoursShort')}`,
      `${i18n.t('bestNight')} ${i18n.num(r.maxHours)} · ${i18n.t('worstNight')} ${i18n.num(r.minHours)}`,
      r.avgHours >= 6 ? 'good' : r.avgHours >= 4 ? 'warn' : 'bad'),
    card(i18n.t('compliance'), `${i18n.num(r.compliancePct, 0)}%`,
      `${i18n.int(r.compliantNights)} / ${i18n.int(r.nightsWithUse)}`,
      r.compliancePct >= 90 ? 'good' : r.compliancePct >= 70 ? 'warn' : 'bad'),
    card(i18n.t('nightsAnalysed'), i18n.int(r.nightsWithUse),
      `${i18n.date(first)} – ${i18n.date(last)}`),
    card(i18n.t('totalHours'), `${i18n.num(r.totalHours, 0)} ${i18n.t('hoursShort')}`),
    card(i18n.t('colRdi'), i18n.num(r.avgRdi),
      `${i18n.t('colRera')} ${i18n.num(r.avgReraIndex)}${i18n.t('eventsPerHour')}`)
  );
  box.appendChild(grid);

  const donut = mixDonut(r, i18n);
  if (donut) {
    const wrap = h('div', 'donut-wrap');
    wrap.append(donut, compositionLegend(i18n));
    box.appendChild(wrap);
  }
}

function bandClass (ahi) {
  const b = ahiBand(ahi);
  return b === 'normal' ? 'good' : b === 'mild' ? 'warn' : 'bad';
}

/* ---------------------------------------------------------------------------
 * Withings sleep import
 *
 * Opt-in and self-contained: nothing here runs unless the reader clicks, and
 * the CPAP report is complete without it. Credentials belong to the reader and
 * live only in their own localStorage — see withings.js for why they have to
 * be supplied by hand at all.
 * -------------------------------------------------------------------------*/

function renderWithings (r) {
  const box = $('#withings');
  box.replaceChildren();
  box.className = 'panel no-print withings-panel';

  box.append(
    h('h2', null, i18n.t('withingsTitle')),
    h('p', 'muted', i18n.t('withingsIntro'))
  );

  const row = h('div', 'withings-row');
  const connectBtn = h('button', 'primary-btn', i18n.t('withingsConnect'));
  connectBtn.type = 'button';
  const setupBtn = h('button', 'ghost-btn', i18n.t('withingsSetup'));
  setupBtn.type = 'button';
  const status = h('span', 'withings-status');
  row.append(connectBtn, setupBtn, status);
  box.appendChild(row);

  const setup = buildWithingsSetup(status);
  setup.hidden = true;
  box.appendChild(setup);

  setupBtn.addEventListener('click', () => {
    setup.hidden = !setup.hidden;
    setupBtn.textContent = i18n.t(setup.hidden ? 'withingsSetup' : 'withingsSetupHide');
  });

  connectBtn.addEventListener('click', async () => {
    const creds = loadCredentials();
    if (!creds) {
      // Nothing saved yet: open the form rather than failing silently.
      setup.hidden = false;
      setupBtn.textContent = i18n.t('withingsSetupHide');
      setStatus(status, i18n.t('withingsNeedCreds'), 'err');
      return;
    }
    connectBtn.disabled = true;
    try {
      setStatus(status, i18n.t('withingsConnecting'));
      const code = await authorize(creds.clientId);

      // The authorization code is valid for THIRTY SECONDS, so the exchange
      // follows immediately with nothing in between.
      setStatus(status, i18n.t('withingsFetching'));
      const token = await exchangeCode(code, creds);

      const first = report.nights[0]?.dateObj;
      const last = report.nights[report.nights.length - 1]?.dateObj;
      const series = await fetchSleepSummary(
        token.access_token, ymd(first), ymd(last));

      attachSleep(report, series);
      if (!report.sleep.matched) {
        setStatus(status, i18n.t('withingsNoMatch'), 'err');
      } else {
        setStatus(status, i18n.t('withingsMatched', {
          n: report.sleep.matched, total: report.nights.length
        }), 'ok');
      }
      // Re-render so the charts pick up the sleep data.
      renderCharts(report);
      renderTable(report);
    } catch (err) {
      setStatus(status, withingsError(err), 'err');
      console.error(err);
    } finally {
      connectBtn.disabled = false;
    }
  });
}

function buildWithingsSetup (status) {
  const wrap = h('div', 'withings-setup');
  const saved = loadCredentials();

  const field = (labelKey, value, type = 'text') => {
    const f = h('div', 'withings-field');
    const id = `withings-${labelKey}`;
    const label = h('label', null, i18n.t(labelKey));
    label.htmlFor = id;
    const input = document.createElement('input');
    input.id = id;
    input.type = type;
    input.value = value || '';
    input.autocomplete = 'off';
    input.spellcheck = false;
    f.append(label, input);
    return { f, input };
  };

  const id = field('withingsClientId', saved?.clientId);
  const secret = field('withingsClientSecret', saved?.clientSecret, 'password');
  wrap.append(id.f, secret.f);

  const btns = h('div', 'withings-row');
  const save = h('button', 'ghost-btn', i18n.t('withingsSave'));
  save.type = 'button';
  const forget = h('button', 'ghost-btn', i18n.t('withingsForget'));
  forget.type = 'button';
  btns.append(save, forget);
  wrap.appendChild(btns);

  save.addEventListener('click', () => {
    if (!id.input.value.trim() || !secret.input.value.trim()) {
      setStatus(status, i18n.t('withingsNeedCreds'), 'err');
      return;
    }
    saveCredentials(id.input.value, secret.input.value);
    setStatus(status, i18n.t('withingsSaved'), 'ok');
  });

  forget.addEventListener('click', () => {
    clearCredentials();
    id.input.value = '';
    secret.input.value = '';
    setStatus(status, '');
  });

  // The callback URL has to match Withings' registration exactly, so it is
  // shown rather than described.
  const help = h('p', 'withings-help');
  const parts = i18n.t('withingsHelp').split('{uri}');
  help.append(parts[0] || '', h('code', null, redirectUri()), parts[1] || '');
  wrap.appendChild(help);
  wrap.appendChild(h('p', 'withings-help', i18n.t('withingsScopeNote')));

  return wrap;
}

function setStatus (node, text, cls = '') {
  node.textContent = text;
  node.className = `withings-status${cls ? ' ' + cls : ''}`;
}

/** Map a thrown error to a message the reader can act on. */
function withingsError (err) {
  const m = err?.message || '';
  if (m === 'popup-blocked') return i18n.t('withingsErrPopup');
  if (m === 'cancelled') return i18n.t('withingsErrCancelled');
  if (m === 'timeout') return i18n.t('withingsErrTimeout');
  if (m === 'rate-limited') return i18n.t('withingsErrRate');
  return i18n.t('withingsErrGeneric', { msg: m || '?' });
}

function ymd (d) {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderInsights (r) {
  const box = $('#insights');
  box.replaceChildren();
  box.appendChild(h('h2', null, i18n.t('insightsTitle')));

  if (!r.insights.length) {
    box.appendChild(h('p', 'muted', i18n.t('insightsNone')));
    return;
  }

  box.appendChild(h('p', 'table-hint', i18n.t('insightsLead')));

  const list = h('div', 'insight-list');
  for (const ins of r.insights) {
    const text = i18n.insight(ins.id, ins.values);
    if (!text) continue;
    const item = h('article', `insight insight-${ins.severity}`);
    const head = h('header', 'insight-head');
    head.append(
      h('span', 'insight-badge', i18n.t(`severity${cap(ins.severity)}`)),
      h('h3', 'insight-title', text.title)
    );
    // Where the threshold behind this finding comes from. A reader deserves to
    // know whether a line is a clinical standard or this app's own screening
    // cut before acting on it.
    if (ins.tier) {
      const tier = h('span', `tier-badge tier-${ins.tier}`, i18n.t(`tier${cap(ins.tier)}`));
      tier.title = i18n.t(`tier${cap(ins.tier)}Help`);
      head.appendChild(tier);
    }
    item.appendChild(head);
    const body = h('div', 'insight-body');
    body.append(
      labelled(i18n.t('whatThisMeans'), text.body),
      labelled(i18n.t('whatToDo'), text.action)
    );
    item.appendChild(body);
    list.appendChild(item);
  }
  box.appendChild(list);
}

function labelled (label, text) {
  const wrap = h('div', 'insight-part');
  wrap.append(h('div', 'insight-part-label', label), h('p', null, text));
  return wrap;
}

function cap (s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function renderCharts (r) {
  const box = $('#charts');
  box.replaceChildren();
  box.appendChild(h('h2', null, i18n.t('chartsTitle')));

  const add = (titleKey, node, extra, hintKey) => {
    if (!node) return;
    const fig = h('figure', 'chart-figure');
    fig.appendChild(h('figcaption', null, i18n.t(titleKey)));
    if (hintKey) fig.appendChild(h('p', 'chart-hint', i18n.t(hintKey)));
    fig.appendChild(node);
    if (extra) fig.appendChild(extra);
    box.appendChild(fig);
  };

  add('chartAhi', ahiChart(r.nights, i18n, { sleep: r.sleep }));
  // The usage chart gains a second bar per night once sleep data is present,
  // so it also gains a legend; usageLegend returns null when it is not needed.
  add('chartUsage', usageChart(r.nights, i18n, { sleep: r.sleep }),
    usageLegend(r, i18n));
  // With watch data present the timing chart gains a grey sleep band, so the
  // caption has to explain it.
  add('chartTiming', sleepTimingChart(r.nights, i18n, { sleep: r.sleep }), null,
    r.sleep?.matched ? 'chartTimingHintSleep' : 'chartTimingHint');

  // Restorative-sleep comparison, only when both groups have enough nights to
  // be worth putting side by side.
  const stages = sleepStageComparisonChart(r, i18n);
  if (stages) {
    const fig = h('figure', 'chart-figure');
    fig.append(
      h('figcaption', null, i18n.t('chartSleepStages')),
      h('p', 'chart-hint', i18n.t('chartSleepStagesHint')),
      stages,
      sleepStageLegend(i18n),
      h('p', 'sleep-compare-note', i18n.t('sleepCompareCaveat'))
    );
    box.appendChild(fig);
  }

  add('chartComposition', compositionChart(r.nights, i18n), compositionLegend(i18n));
  add('chartPressure', pressureChart(r.nights, i18n));

  if (box.children.length === 1) {
    box.appendChild(h('p', 'muted', i18n.t('chartNone')));
  }
}

const COLUMNS = [
  { key: 'colDate',     get: (n) => i18n.date(n.dateObj, { day: '2-digit', month: 'short' }) },
  { key: 'colWeekday',  get: (n) => i18n.weekday(n.dateObj, 'short') },
  { key: 'colUse',      get: (n) => n.totalSec ? i18n.duration(n.totalSec) : i18n.t('noUse') },
  { key: 'colAhi',      get: (n) => n.hours ? i18n.num(n.ahi) : '—', band: (n) => n.hours ? bandClass(n.ahi) : null },
  { key: 'colAi',       get: (n) => n.hours ? i18n.num(n.ai) : '—' },
  { key: 'colHi',       get: (n) => n.hours ? i18n.num(n.hi) : '—' },
  { key: 'colRdi',      get: (n) => n.hours ? i18n.num(n.rdi) : '—' },
  { key: 'colOa',       get: (n) => i18n.int(n.obstructiveApneaCount) },
  { key: 'colCa',       get: (n) => i18n.int(n.centralApneaCount) },
  { key: 'colRera',     get: (n) => i18n.int(n.reraCount) },
  { key: 'colSnore',    get: (n) => i18n.int(n.snoreCount) },
  { key: 'colLeak',     get: (n) => i18n.int(n.largeLeakCount) },
  { key: 'colPressure', get: (n) => n.pressureP95 != null ? i18n.num(n.pressureP95) : '—' },
  { key: 'colSessions', get: (n) => i18n.int(n.sessionCount) }
];

function renderTable (r) {
  const box = $('#nights');
  box.replaceChildren();
  box.appendChild(h('h2', null, i18n.t('nightsTitle')));
  box.appendChild(h('p', 'table-hint', i18n.t('nightsHint')));

  const scroller = h('div', 'table-scroll');
  const table = h('table', 'nights-table');
  const thead = h('thead');
  const hr = h('tr');
  hr.appendChild(h('th', 'th-expand'));
  for (const c of COLUMNS) hr.appendChild(h('th', null, i18n.t(c.key)));
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = h('tbody');
  for (const night of r.nights) {
    const tr = h('tr', night.totalSec ? null : 'row-unused');

    const tdX = h('td', 'td-expand');
    if (night.sessions.length) {
      const btn = h('button', 'expand-btn', '+');
      btn.setAttribute('aria-label', i18n.t('expandRow'));
      btn.setAttribute('aria-expanded', 'false');
      btn.title = i18n.t('expandRow');
      // Animate the first few, so the control is noticed on arrival.
      if (tbody.childElementCount < 3) btn.classList.add('hint');
      tdX.appendChild(btn);
      btn.addEventListener('click', () => toggleDetail(tr, night, btn));
    }
    tr.appendChild(tdX);

    for (const c of COLUMNS) {
      const band = c.band?.(night);
      tr.appendChild(h('td', band ? `cell-${band}` : null, c.get(night)));
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  scroller.appendChild(table);
  box.appendChild(scroller);
}

function toggleDetail (row, night, btn) {
  // Once used, the hint animation has done its job.
  btn.classList.remove('hint');
  const next = row.nextElementSibling;
  if (next && next.classList.contains('detail-row')) {
    next.remove();
    btn.textContent = '+';
    btn.setAttribute('aria-expanded', 'false');
    return;
  }
  btn.textContent = '−';
  btn.setAttribute('aria-expanded', 'true');
  const tr = h('tr', 'detail-row');
  const td = h('td');
  td.colSpan = COLUMNS.length + 1;
  td.appendChild(buildDetail(night));
  tr.appendChild(td);
  row.after(tr);
}

function buildDetail (night) {
  const wrap = h('div', 'detail');

  // Session list
  const sessBox = h('div', 'detail-block');
  sessBox.appendChild(h('h4', null, i18n.t('detailSessions')));
  const ul = h('ul', 'session-list');
  for (const s of night.sessions) {
    const li = h('li', s.usable ? null : 'session-short');
    li.textContent =
      `${i18n.t('detailSessionStart')} ${i18n.time(s.startedAt)} · ` +
      `${i18n.t('detailSessionLength')} ${i18n.duration(s.durationSec)}`;
    if (!s.usable) {
      li.append(h('span', 'tag', `< ${MIN_SESSION_SEC / 60}′`));
    }
    if (s.signalInfo) {
      const btn = h('button', 'link-btn', i18n.t('loadWaveform'));
      btn.addEventListener('click', () => loadWaveform(li, s, btn));
      li.appendChild(btn);
    }
    ul.appendChild(li);
  }
  sessBox.appendChild(ul);
  wrap.appendChild(sessBox);

  // Metrics
  const metrics = h('div', 'detail-block');
  metrics.appendChild(h('h4', null, i18n.t('detailEventBreakdown')));
  const dl = h('dl', 'kv kv-compact');
  const rows = [
    [i18n.t('detailLongestApnea'), night.longestApneaSec
      ? `${i18n.num(night.longestApneaSec, 0)} ${i18n.t('seconds')}` : '—'],
    [i18n.t('detailLeakPct'), `${i18n.num(night.leakPct)}%`],
    [i18n.t('detailPeriodic'), `${i18n.num(night.periodicBreathingPct)}%`],
    [i18n.t('detailObstruction'), `${i18n.num(night.obstructionPct)}%`],
    [i18n.t('detailFlowLimit'), `${i18n.num(night.flowLimitPct)}%`],
    [i18n.t('detailMaskOff'), i18n.int(night.maskOffCount)],
    [i18n.t('colSnore'), i18n.int(night.snoreCount)]
  ];
  for (const [k, v] of rows) dl.append(h('dt', null, k), h('dd', null, v));
  metrics.appendChild(dl);
  wrap.appendChild(metrics);

  // Channels present
  const chans = night.sessions.find(s => s.signalInfo)?.signalInfo?.signals;
  if (chans?.length) {
    const cb = h('div', 'detail-block');
    cb.appendChild(h('h4', null, i18n.t('detailChannels')));
    const list = h('div', 'chips');
    for (const c of chans) {
      const chip = h('span', 'chip', c.unit ? `${c.label} (${c.unit})` : c.label);
      if (!c.calibrated) chip.classList.add('chip-warn');
      list.appendChild(chip);
    }
    cb.appendChild(list);
    wrap.appendChild(cb);
  }

  return wrap;
}

async function loadWaveform (container, session, btn) {
  btn.disabled = true;
  btn.textContent = i18n.t('waveformLoading');
  try {
    // Prefer a flow channel; fall back to the first available.
    const names = session.signalInfo.signals.map(s => s.label);
    const pick = ['RespFlow', 'FlowFull', 'Pressure'].find(n => names.includes(n)) || names[0];
    const decoded = await decodeWaveform(session, [pick], 1800);
    const samples = decoded.series[pick];
    const sig = decoded.signals.find(s => s.label === pick);
    const chart = waveformChart(samples, decoded.hz(pick), i18n, {
      label: sig.calibrated ? `${pick} (${sig.unit})` : pick
    });
    const box = h('div', 'wave-box');
    if (chart) box.appendChild(chart);
    if (sig && !sig.calibrated) {
      box.appendChild(h('p', 'caveat', i18n.t('waveformUncalibrated')));
    }
    btn.remove();
    container.appendChild(box);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = i18n.t('loadWaveform');
    console.error(err);
  }
}

function renderGlossary (r) {
  const box = $('#glossary');
  box.replaceChildren();
  box.appendChild(h('h2', null, i18n.t('glossaryTitle')));

  const method = h('div', 'method');
  method.append(
    h('h3', null, i18n.t('methodTitle')),
    h('p', null, i18n.t('methodBody')),
    h('p', 'caveat', i18n.t('methodCaveat'))
  );
  box.appendChild(method);

  const terms = [
    ['AHI', 'gAhi'], ['AI', 'gAi'], ['HI', 'gHi'], ['RDI', 'gRdi'],
    [i18n.t('legendObstructive'), 'gOa'], [i18n.t('legendCentral'), 'gCa'],
    ['RERA', 'gRera'], [i18n.t('legendSnore'), 'gSnore'],
    [i18n.t('colLeak'), 'gLeak'], [i18n.t('detailPeriodic'), 'gPeriodic'],
    [i18n.t('colPressure'), 'gP95']
  ];
  const dl = h('dl', 'glossary');
  for (const [term, key] of terms) {
    dl.append(h('dt', null, term), h('dd', null, i18n.t(key)));
  }
  box.appendChild(dl);

  const disc = h('aside', 'disclaimer');
  disc.append(
    h('h3', null, i18n.t('disclaimerTitle')),
    h('p', null, i18n.t('disclaimerBody'))
  );
  box.appendChild(disc);
}

/* ---------------------------------------------------------------------------
 * Appendix: raw files, and credits
 * -------------------------------------------------------------------------*/

const CATEGORY_LABEL = {
  signal: 'catSignal', event: 'catEvent', config: 'catConfig', stat: 'catStat',
  trend: 'catTrend', cloud: 'catCloud', log: 'catLog', dcm: 'catDcm',
  system: 'catSystem', other: 'catOther'
};

const USE_LABEL = { full: 'invUseFull', partial: 'invUsePartial', none: 'invUseNone' };
const USE_CLASS = { full: 'good', partial: 'warn', none: 'none' };

function renderAppendix (r) {
  const box = $('#appendix');
  box.replaceChildren();
  box.appendChild(h('h2', null, i18n.t('appendixTitle')));
  box.appendChild(h('p', 'muted', i18n.t('appendixIntro')));

  renderInventory(box, r);
  renderTrendSection(box, r);
  renderCloudSection(box, r);
  renderLogSection(box, r);

  const nd = h('section', 'sub-block');
  nd.append(
    h('h3', null, i18n.t('notDecodedTitle')),
    h('p', 'muted', i18n.t('notDecodedBody'))
  );
  box.appendChild(nd);

  renderCredits(box);
}

function renderInventory (box, r) {
  const inv = r.inventory;
  if (!inv) return;
  const sec = h('section', 'sub-block');
  sec.appendChild(h('h3', null,
    `${i18n.t('invTitle')} — ${i18n.int(inv.totalFiles)} ${i18n.t('invFiles')}`));

  const order = { full: 0, partial: 1, none: 2 };
  const groups = [...inv.groups].sort(
    (a, b) => order[a.use] - order[b.use] || b.count - a.count);

  const list = h('div', 'inv-list');
  for (const g of groups) {
    const row = h('div', `inv-row inv-${USE_CLASS[g.use]}`);
    const left = h('div', 'inv-main');
    left.append(
      h('span', 'inv-name', i18n.t(CATEGORY_LABEL[g.id] || 'catOther')),
      h('span', 'inv-count',
        `${i18n.int(g.count)} ${i18n.t(g.count === 1 ? 'invFile' : 'invFiles')}` +
        `${g.bytes ? ` · ${formatBytes(g.bytes)}` : ''}`)
    );
    row.append(left, h('span', `inv-badge badge-${USE_CLASS[g.use]}`, i18n.t(USE_LABEL[g.use])));
    if (g.paths.length) {
      row.appendChild(h('div', 'inv-paths', g.paths.join(' · ')));
    }
    list.appendChild(row);
  }
  sec.appendChild(list);
  box.appendChild(sec);
}

function renderTrendSection (box, r) {
  const tm = r.trendMeta || [];
  if (!tm.length) return;
  const sec = h('section', 'sub-block');
  sec.append(
    h('h3', null, i18n.t('trendTitle')),
    h('p', 'muted', i18n.t('trendIntro'))
  );

  const scroll = h('div', 'table-scroll');
  const t = h('table', 'raw-table');
  const head = h('tr');
  for (const k of ['trendDay', 'trendBytes', 'trendRecords', 'trendHeader']) {
    head.appendChild(h('th', null, i18n.t(k)));
  }
  t.appendChild(h('thead', null)).appendChild(head);
  const tb = h('tbody');
  for (const tc of tm) {
    const tr = h('tr');
    const bytes = tc.payload?.byteLength ?? 0;
    tr.append(
      h('td', null, tc.day || '—'),
      h('td', null, i18n.int(bytes)),
      h('td', null, i18n.int(Math.floor(bytes / 2))),
      h('td', 'mono', JSON.stringify(tc.meta))
    );
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  scroll.appendChild(t);
  sec.appendChild(scroll);

  const found = h('details', 'findings');
  found.append(
    h('summary', null, i18n.t('trendInvestigated')),
    h('p', null, i18n.t('trendFindings'))
  );
  sec.appendChild(found);
  box.appendChild(sec);
}

function renderCloudSection (box, r) {
  const pc = r.extras?.psCloud;
  if (!pc) return;
  const sec = h('section', 'sub-block');
  sec.append(
    h('h3', null, i18n.t('cloudTitle')),
    h('p', 'muted', i18n.t('cloudIntro'))
  );

  const dl = h('dl', 'kv kv-compact');
  const rows = [];

  // Does the embedded statistics copy match the standalone file?
  const same = pc.statistics && r.statistics &&
    pc.statistics.days.length === r.statistics.days.length;
  rows.push([i18n.t('cloudField'),
    `${Object.keys(pc.fieldSizes).join(', ')} — ${same ? i18n.t('cloudMatches') : i18n.t('cloudDiffers')}`]);

  const ci = pc.certificateInfo;
  if (ci) {
    if (ci.organisation) rows.push([i18n.t('cloudOrg'), ci.organisation]);
    if (ci.platform) rows.push([i18n.t('cloudPlatform'), ci.platform]);
    if (ci.validFrom && ci.validTo) {
      rows.push([i18n.t('cloudValid'),
        `${i18n.date(ci.validFrom, { year: 'numeric', month: 'short', day: '2-digit' })} – ${i18n.date(ci.validTo, { year: 'numeric', month: 'short', day: '2-digit' })}`]);
    }
  }
  if (pc.signature) {
    rows.push([i18n.t('cloudSignature'), `${i18n.int(pc.signature.length)} chars (base64)`]);
  }
  for (const [k, v] of rows) dl.append(h('dt', null, k), h('dd', null, v));
  sec.appendChild(dl);
  if (pc.signature) sec.appendChild(h('p', 'caveat', i18n.t('cloudSigNote')));
  box.appendChild(sec);
}

function renderLogSection (box, r) {
  const logs = (r.extras?.logs || []).filter(l => l.entries.length || l.banner);
  if (!logs.length) return;
  const sec = h('section', 'sub-block');
  sec.append(
    h('h3', null, i18n.t('logTitle')),
    h('p', 'muted', i18n.t('logIntro'))
  );

  // One row per log file. The identity banner repeats in every log — including
  // the card's placeholder directories, where it holds filler values like
  // 4294967295 — so it is shown once, from the log with real content, rather
  // than six times.
  const scroll = h('div', 'table-scroll');
  const table = h('table', 'raw-table');
  const head = h('tr');
  for (const label of ['—', i18n.t('logEntries'), i18n.t('logRange'), i18n.t('logWarnings')]) {
    head.appendChild(h('th', null, label));
  }
  table.appendChild(h('thead')).appendChild(head);

  const tb = h('tbody');
  for (const log of logs) {
    const tr = h('tr');
    const range = log.firstAt && log.lastAt
      ? `${i18n.date(log.firstAt)} – ${i18n.date(log.lastAt)}`
      : '—';
    tr.append(
      h('td', 'mono', log.path.replace(/^.*?([^/]+\/[^/]+)$/, '$1')),
      h('td', null, i18n.int(log.entries.length)),
      h('td', null, range),
      h('td', null, log.notable.length ? i18n.int(log.notable.length) : '—')
    );
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  scroll.appendChild(table);
  sec.appendChild(scroll);

  // Device identity, taken from the log that actually has entries.
  const best = logs.slice().sort((a, b) => b.entries.length - a.entries.length)[0];
  if (best && Object.keys(best.identity).length) {
    const idBox = h('div', 'log-block');
    idBox.appendChild(h('h4', null, i18n.t('logIdentity')));
    const dl = h('dl', 'kv kv-compact');
    for (const [k, v] of Object.entries(best.identity)) {
      dl.append(h('dt', null, k), h('dd', 'mono', v));
    }
    idBox.appendChild(dl);
    sec.appendChild(idBox);
  }

  // All warnings and errors across every log, newest first.
  const notable = logs.flatMap(l => l.notable).sort((a, b) => b.at - a.at);
  if (notable.length) {
    const det = h('details', 'findings');
    det.appendChild(h('summary', null,
      `${i18n.t('logWarnings')} (${i18n.int(notable.length)})`));
    const ul = h('ul', 'log-list');
    for (const e of notable.slice(0, 60)) {
      ul.appendChild(h('li', 'mono',
        `${i18n.date(e.at)} ${i18n.time(e.at)} [${e.severity}] ${e.source}: ${e.message}`));
    }
    det.appendChild(ul);
    sec.appendChild(det);
  } else {
    sec.appendChild(h('p', 'muted', i18n.t('logNone')));
  }

  if (logs.some(l => l.truncated)) {
    sec.appendChild(h('p', 'caveat', i18n.t('logTruncated')));
  }
  box.appendChild(sec);
}

/**
 * Credits. This app ships no third-party code, so these are acknowledgements
 * for published format documentation and reverse-engineering work — stated as
 * such, without implying any code was reused.
 */
const CREDITS = [
  {
    name: 'OSCAR',
    sub: 'Open Source CPAP Analysis Reporter',
    url: 'https://gitlab.com/CrimsonNape/oscar-sql',
    licence: 'GPL-3.0',
    what: 'creditsOscarWhat'
  },
  {
    name: 'axt/prisma-smart-utils',
    url: 'https://github.com/axt/prisma-smart-utils',
    licence: 'MIT',
    what: 'creditsAxtWhat'
  },
  {
    name: 'semyonf/Lowenstein-Prisma-Viewer',
    url: 'https://github.com/semyonf/Lowenstein-Prisma-Viewer',
    licence: 'GPL-3.0',
    what: 'creditsSemyonfWhat'
  },
  {
    name: 'open-cpap/cpap-parser',
    url: 'https://gitlab.com/open-cpap/cpap-parser',
    licence: 'GPL-3.0',
    what: 'creditsCpapParserWhat'
  },
  {
    name: 'frostyslav/lowenstein-prisma-viewer',
    url: 'https://github.com/frostyslav/lowenstein-prisma-viewer',
    licence: 'MIT',
    what: 'creditsFrostyslavWhat'
  }
];

/**
 * @param {HTMLElement} box   where to append
 * @param {boolean} heading2  use <h2> (standalone panel) rather than <h3>
 *                            (a section inside the appendix)
 */
function renderCredits (box, heading2 = false) {
  const sec = h('section', 'sub-block credits');
  sec.append(
    h(heading2 ? 'h2' : 'h3', null, i18n.t('creditsTitle')),
    h('p', 'muted', i18n.t('creditsIntro')),
    h('p', 'credits-note', i18n.t('creditsNoCode'))
  );

  const list = h('div', 'credit-list');
  for (const c of CREDITS) {
    const item = h('article', 'credit');
    const head = h('header', 'credit-head');
    const link = h('a', 'credit-name', c.name);
    link.href = c.url;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    head.append(link, h('span', 'credit-licence', c.licence));
    item.appendChild(head);
    if (c.sub) item.appendChild(h('div', 'credit-sub', c.sub));
    item.appendChild(h('p', null, i18n.t(c.what)));
    list.appendChild(item);
  }
  sec.appendChild(list);

  sec.append(
    h('p', 'muted', i18n.t('creditsThanks')),
    h('p', 'muted', i18n.t('creditsOwn'))
  );
  box.appendChild(sec);
}

function formatBytes (n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${i18n.num(n / 1024, 0)} KB`;
  return `${i18n.num(n / (1024 * 1024), 1)} MB`;
}

function renderErrors (r) {
  const box = $('#errors');
  box.replaceChildren();
  if (!r.errors?.length) { box.hidden = true; return; }
  box.hidden = false;
  box.appendChild(h('p', 'muted', i18n.t('errPartial', { n: r.errors.length })));
}

/* ---------------------------------------------------------------------------
 * Export
 * -------------------------------------------------------------------------*/

function exportCsv () {
  if (!report) return;
  const cols = [
    'date', 'usage_hours', 'ahi', 'ai', 'hi', 'rdi', 'obstructive_apnea',
    'central_apnea', 'hypopnea', 'rera', 'snore', 'large_leak',
    'leak_pct_of_night', 'pressure_p95', 'periodic_breathing_pct', 'sessions'
  ];
  const lines = [cols.join(',')];
  for (const n of report.nights) {
    lines.push([
      n.date,
      (n.totalSec / 3600).toFixed(2),
      n.hours ? n.ahi.toFixed(2) : '',
      n.hours ? n.ai.toFixed(2) : '',
      n.hours ? n.hi.toFixed(2) : '',
      n.hours ? n.rdi.toFixed(2) : '',
      n.obstructiveApneaCount, n.centralApneaCount, n.hypopneaCount,
      n.reraCount, n.snoreCount, n.largeLeakCount,
      n.leakPct.toFixed(2),
      n.pressureP95 != null ? n.pressureP95.toFixed(2) : '',
      n.periodicBreathingPct.toFixed(2),
      n.sessionCount
    ].join(','));
  }
  download(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    `cpap-${report.nights[0]?.date || 'export'}.csv`);
}

function exportJson () {
  if (!report) return;
  const slim = {
    device: {
      model: report.device.model, serial: report.device.serial,
      firmware: report.device.firmware, platform: report.device.platform,
      mode: report.device.config?.mode ?? null
    },
    summary: {
      nights: report.nightsWithUse, avgAhi: report.avgAhi, avgHours: report.avgHours,
      compliancePct: report.compliancePct, totalHours: report.totalHours,
      avgRdi: report.avgRdi, centralFraction: report.centralFraction
    },
    insights: report.insights.map(i => ({
      id: i.id, severity: i.severity, ...i18n.insight(i.id, i.values)
    })),
    nights: report.nights.map(n => ({
      date: n.date, usageSeconds: n.totalSec, ahi: n.ahi, ai: n.ai, hi: n.hi,
      rdi: n.rdi, obstructiveApnea: n.obstructiveApneaCount,
      centralApnea: n.centralApneaCount, hypopnea: n.hypopneaCount,
      rera: n.reraCount, snore: n.snoreCount, largeLeak: n.largeLeakCount,
      pressureP95: n.pressureP95, periodicBreathingPct: n.periodicBreathingPct,
      sessions: n.sessions.map(s => ({
        startedAt: s.startedAt, durationSeconds: s.durationSec, usable: s.usable
      }))
    }))
  };
  download(new Blob([JSON.stringify(slim, null, 2)], { type: 'application/json' }),
    `cpap-${report.nights[0]?.date || 'export'}.json`);
}

function download (blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// When this page load IS the Withings OAuth callback, it is a popup whose only
// job is to hand the code back to the window that opened it. Booting the whole
// analyzer in that popup would repaint a report nobody will see, so the app
// never starts.
if (!handleOAuthCallback()) init();
