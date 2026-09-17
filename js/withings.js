/* ============================================================================
 * withings.js — optional Withings sleep-stage import.
 *
 * The CPAP card knows when the mask was on; it does not know when you were
 * asleep, and it has no idea about sleep stages. A Withings watch or Sleep
 * Analyzer knows both. Pairing them answers a question neither can answer
 * alone: how much of the night was actually spent asleep under therapy, and
 * what the sleep architecture looked like.
 *
 * Import is entirely client-side: a popup to Withings for consent, then a
 * direct call to their API from this page. No server is involved at any
 * point. It needs a client_id/client_secret pair that the READER supplies and
 * which is stored only in their own localStorage.
 *
 * This is OPT-IN and entirely separate from the CPAP report, which continues
 * to work with no network access at all.
 *
 * WHY THE SECRET IS ENTERED BY HAND
 * ---------------------------------
 * Withings implements OAuth 2.0 authorization-code and does NOT support PKCE
 * (verified against the live token endpoint: sending code_verifier without a
 * secret is rejected as "Missing params"). There is no public-client or SPA
 * application type. So the token exchange cannot happen in a browser without
 * a client_secret somewhere.
 *
 * Hard-coding one into this file would publish it to every visitor of the
 * hosted page. Instead the reader registers their own Withings application
 * and types their own credentials in, which stay in their browser. The repo
 * ships no secret, and one reader's credentials never reach another.
 *
 * The secret alone grants no access to anyone's data: Withings binds all data
 * permissions to the user-consented token, not to the application. A stolen
 * secret allows app impersonation, not reading.
 *
 * Scope requested is `user.activity` ONLY — sleep and activity. `user.info`
 * is deliberately NOT requested because it also grants device-link management,
 * which this app has no business holding.
 * ========================================================================== */

const STORE_KEY = 'withings-app';     // client_id + client_secret (reader's own)
const AUTH_URL  = 'https://account.withings.com/oauth2_user/authorize2';
const API_URL   = 'https://wbsapi.withings.net/v2';
const SCOPE     = 'user.activity';

/* ---------------------------------------------------------------------------
 * Credential storage (the reader's own app registration)
 * -------------------------------------------------------------------------*/

/**
 * localStorage can throw outright in a private window or with site data
 * blocked, so every access is guarded. A failure here must degrade to "no
 * saved credentials", never break the page.
 */
export function loadCredentials () {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c.clientId && c.clientSecret ? c : null;
  } catch { return null; }
}

export function saveCredentials (clientId, clientSecret) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      clientId: clientId.trim(), clientSecret: clientSecret.trim()
    }));
    return true;
  } catch { return false; }
}

export function clearCredentials () {
  try { localStorage.removeItem(STORE_KEY); } catch { /* nothing to undo */ }
}

/**
 * The callback must match what is registered with Withings exactly.
 *
 * `index.html` is normalised away: the directory form is what a reader
 * naturally registers, it is what the server serves at that path anyway, and
 * keeping the two spellings apart is a classic source of redirect_uri
 * mismatch errors. Any query or fragment is dropped for the same reason —
 * during the callback the URL still carries ?code=..., and echoing that back
 * as the redirect_uri would never match.
 */
export function redirectUri () {
  return location.origin + location.pathname.replace(/index\.html?$/i, '');
}

/* ---------------------------------------------------------------------------
 * OAuth: popup -> code -> token
 * -------------------------------------------------------------------------*/

/**
 * Runs FIRST, before anything else boots.
 *
 * Withings sends the browser back to this same page carrying ?code=... — so
 * the popup would otherwise load a second full copy of the analyzer, re-run
 * its setup and repaint the whole UI, all to be thrown away a moment later.
 * Worse, the opener cannot reliably read the popup's URL while that is
 * happening.
 *
 * So when this page notices it IS the OAuth callback, it stops being the app:
 * it hands the code to its opener over postMessage, shows one line of text,
 * and closes itself. Returns true when that happened, and the caller must
 * then do nothing else.
 */
export function handleOAuthCallback () {
  let params;
  try { params = new URL(location.href).searchParams; } catch { return false; }
  const code = params.get('code');
  const error = params.get('error');
  const state = params.get('state');
  if (!code && !error) return false;               // an ordinary page load

  const payload = { source: 'withings-oauth', code, error, state };
  let delivered = false;
  try {
    if (window.opener && !window.opener.closed) {
      // Target our own origin explicitly rather than '*', so the code is
      // never broadcast to a document we did not open.
      window.opener.postMessage(payload, location.origin);
      delivered = true;
    }
  } catch { /* opener gone or cross-origin; fall through to the manual note */ }

  showCallbackNotice(delivered, error);
  if (delivered) setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 400);
  return true;
}

/**
 * Replace the document with a single status line. The popup is on screen for
 * well under a second in the normal case, but it must not flash a half-built
 * report in the meantime, and it must say something useful if it cannot close
 * itself (opened in a tab rather than a popup, for instance).
 */
function showCallbackNotice (delivered, error) {
  const he = (navigator.language || '').toLowerCase().startsWith('he');
  const msg = error
    ? (he ? 'ההתחברות נכשלה. אפשר לסגור את החלון.' : 'Sign-in failed. You can close this window.')
    : delivered
      ? (he ? 'מתחבר… החלון ייסגר מיד.' : 'Connected. Closing…')
      : (he ? 'ההתחברות הושלמה. סגור את החלון הזה וחזור לדוח.'
            : 'Sign-in complete. Close this window and return to the report.');

  document.documentElement.setAttribute('dir', he ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', he ? 'he' : 'en');
  // Written without the stylesheet, which may not have loaded yet.
  document.body.innerHTML =
    '<div style="font:16px/1.6 system-ui,sans-serif;display:flex;' +
    'align-items:center;justify-content:center;min-height:80vh;' +
    'padding:24px;text-align:center;color:#333">' +
    `<p>${msg}</p></div>`;
  document.title = 'Withings';
}

/**
 * Open the Withings consent screen in a popup and resolve with the
 * authorization code.
 *
 * The popup returns the code by postMessage (see handleOAuthCallback above)
 * rather than by having this window read the popup's URL: the popup is a full
 * page load of this same app, and racing its boot to scrape location.href is
 * unreliable.
 *
 * The authorization code expires after THIRTY SECONDS, so the caller must
 * exchange it immediately — there is no room for an intervening prompt.
 */
export function authorize (clientId) {
  return new Promise((resolve, reject) => {
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const url = `${AUTH_URL}?response_type=code&client_id=${encodeURIComponent(clientId)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri())}` +
      `&state=${encodeURIComponent(state)}`;

    const w = 520, h = 680;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(url, 'withings-auth',
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);

    if (!popup) {
      reject(new Error('popup-blocked'));
      return;
    }

    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
      fn(arg);
    };

    function onMessage (ev) {
      // Only trust messages from this origin, from our own popup.
      if (ev.origin !== location.origin) return;
      const d = ev.data;
      if (!d || d.source !== 'withings-oauth') return;
      try { popup.close(); } catch { /* it closes itself too */ }
      if (d.error) finish(reject, new Error(d.error));
      else if (!d.code) finish(reject, new Error('no-code'));
      else if (d.state !== state) finish(reject, new Error('state-mismatch'));
      else finish(resolve, d.code);
    }
    window.addEventListener('message', onMessage);

    // A closed popup means the reader dismissed it. The grace period covers
    // the gap between the callback posting its message and closing itself,
    // which would otherwise look like a cancellation.
    const started = Date.now();
    let closedAt = 0;
    const timer = setInterval(() => {
      if (popup.closed) {
        if (!closedAt) closedAt = Date.now();
        if (Date.now() - closedAt > 700) finish(reject, new Error('cancelled'));
        return;
      }
      if (Date.now() - started > 120000) {
        try { popup.close(); } catch { /* already gone */ }
        finish(reject, new Error('timeout'));
      }
    }, 300);
  });
}

/**
 * Exchange the authorization code for an access token.
 *
 * Withings returns HTTP 200 for errors too, carrying the real outcome in a
 * `status` field, so the body must always be inspected rather than the HTTP
 * code. Status 0 is success.
 */
export async function exchangeCode (code, { clientId, clientSecret }) {
  const body = new URLSearchParams({
    action: 'requesttoken',
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri()
  });
  const res = await fetch(`${API_URL}/oauth2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const json = await res.json();
  if (json.status !== 0) {
    throw new Error(json.error || `withings status ${json.status}`);
  }
  return json.body;   // { access_token, refresh_token, expires_in, userid, ... }
}

/* ---------------------------------------------------------------------------
 * Sleep summaries
 * -------------------------------------------------------------------------*/

const FIELDS = [
  'total_sleep_time', 'total_timeinbed', 'deepsleepduration', 'remsleepduration',
  'lightsleepduration', 'wakeupduration', 'wakeupcount', 'sleep_efficiency',
  'sleep_latency', 'sleep_score', 'hr_average', 'hr_min', 'hr_max',
  'snoring', 'out_of_bed_count'
].join(',');

/**
 * Fetch per-night sleep summaries between two YYYY-MM-DD dates.
 *
 * getsummary is paginated: `more` signals another page and `offset` continues
 * it. The loop is bounded so a malformed response can never spin forever.
 */
export async function fetchSleepSummary (accessToken, startYmd, endYmd) {
  const out = [];
  let offset = 0;
  for (let page = 0; page < 40; page++) {
    const body = new URLSearchParams({
      action: 'getsummary',
      startdateymd: startYmd,
      enddateymd: endYmd,
      data_fields: FIELDS
    });
    if (offset) body.set('offset', String(offset));

    const res = await fetch(`${API_URL}/sleep`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    const json = await res.json();
    // 601 is Withings' rate-limit signal, delivered under HTTP 200.
    if (json.status === 601) throw new Error('rate-limited');
    if (json.status !== 0) throw new Error(json.error || `withings status ${json.status}`);

    out.push(...(json.body?.series || []));
    if (!json.body?.more) break;
    offset = json.body.offset;
  }
  return out.map(normaliseApiNight).filter(Boolean);
}

/**
 * One API series entry -> our internal shape.
 *
 * Withings nests the stage durations under `data` on getsummary. All
 * durations are SECONDS. `sleep_efficiency` is a 0-1 ratio.
 */
function normaliseApiNight (s) {
  const d = s.data || s;
  const startdate = s.startdate ?? s.startdateymd;
  if (!startdate) return null;
  const start = new Date((typeof startdate === 'number' ? startdate : Date.parse(startdate) / 1000) * 1000);
  const end = s.enddate ? new Date(s.enddate * 1000) : null;
  return buildSleepNight({
    start,
    end,
    deep: num(d.deepsleepduration),
    rem: num(d.remsleepduration),
    light: num(d.lightsleepduration),
    awake: num(d.wakeupduration),
    totalSleep: num(d.total_sleep_time),
    inBed: num(d.total_timeinbed),
    efficiency: d.sleep_efficiency != null ? Number(d.sleep_efficiency) : null,
    score: d.sleep_score != null ? Number(d.sleep_score) : null,
    wakeCount: num(d.wakeupcount),
    source: 'api'
  });
}

function num (v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ---------------------------------------------------------------------------
 * Shared shape + night matching
 * -------------------------------------------------------------------------*/

/**
 * One night of sleep as this app uses it. Durations are seconds throughout,
 * and `dateKey` is the YYYYMMDD night key that matches the CPAP card's folder
 * naming, so the two sources can be joined.
 */
function buildSleepNight (o) {
  const totalSleep = o.totalSleep || (o.deep + o.rem + o.light);
  const inBed = o.inBed || (totalSleep + o.awake);
  return {
    dateKey: nightKey(o.start),
    start: o.start,
    end: o.end || (totalSleep ? new Date(o.start.getTime() + inBed * 1000) : null),
    deepSec: o.deep,
    remSec: o.rem,
    lightSec: o.light,
    awakeSec: o.awake,
    totalSleepSec: totalSleep,
    inBedSec: inBed,
    // The share of actual sleep spent in the restorative stages. Computed over
    // SLEEP, not over time in bed, so a restless night is not penalised twice.
    deepRemPct: totalSleep > 0 ? ((o.deep + o.rem) / totalSleep) * 100 : null,
    remPct: totalSleep > 0 ? (o.rem / totalSleep) * 100 : null,
    deepPct: totalSleep > 0 ? (o.deep / totalSleep) * 100 : null,
    efficiency: o.efficiency != null ? o.efficiency * 100
      : (inBed > 0 ? (totalSleep / inBed) * 100 : null),
    score: o.score,
    wakeCount: o.wakeCount,
    source: o.source
  };
}

/**
 * Which night does a sleep session belong to?
 *
 * The CPAP card files a night under a noon-to-noon boundary, so a session
 * beginning at 01:00 belongs to the previous calendar day. The same shift is
 * applied here so watch nights and card nights land on the same key.
 */
export function nightKey (d) {
  const shifted = new Date(d.getTime() - 12 * 3600 * 1000);
  return `${shifted.getFullYear()}` +
    `${String(shifted.getMonth() + 1).padStart(2, '0')}` +
    `${String(shifted.getDate()).padStart(2, '0')}`;
}

/**
 * Attach sleep nights to the report and compute the treated/untreated split.
 *
 * A night counts as TREATED when the card recorded therapy for it, and
 * UNTREATED when the watch saw sleep but the card has no session. That is an
 * observational comparison, not a controlled one — untreated nights are often
 * travel, illness or a night off, all of which affect sleep architecture on
 * their own. The report says so wherever the comparison is shown.
 */
export function attachSleep (report, sleepNights) {
  const byKey = new Map();
  for (const s of sleepNights) {
    // Two records on one key can happen (a nap plus a night); keep the longest.
    const prev = byKey.get(s.dateKey);
    if (!prev || s.totalSleepSec > prev.totalSleepSec) byKey.set(s.dateKey, s);
  }

  const cardKeys = new Set(report.nights.filter(n => n.totalSec > 0).map(n => n.date));
  for (const night of report.nights) {
    night.sleep = byKey.get(night.date) || null;
  }

  const treated = [], untreated = [];
  for (const [key, s] of byKey) {
    (cardKeys.has(key) ? treated : untreated).push(s);
  }

  const avg = (arr, f) => {
    const vals = arr.map(f).filter(v => v != null && Number.isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  report.sleep = {
    nights: [...byKey.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    matched: report.nights.filter(n => n.sleep).length,
    source: sleepNights[0]?.source || null,
    treated: {
      count: treated.length,
      deepRemPct: avg(treated, s => s.deepRemPct),
      remPct: avg(treated, s => s.remPct),
      deepPct: avg(treated, s => s.deepPct),
      efficiency: avg(treated, s => s.efficiency),
      totalSleepSec: avg(treated, s => s.totalSleepSec)
    },
    untreated: {
      count: untreated.length,
      deepRemPct: avg(untreated, s => s.deepRemPct),
      remPct: avg(untreated, s => s.remPct),
      deepPct: avg(untreated, s => s.deepPct),
      efficiency: avg(untreated, s => s.efficiency),
      totalSleepSec: avg(untreated, s => s.totalSleepSec)
    }
  };

  // Below three nights on either side the difference is noise, and showing a
  // headline figure from two nights invites a conclusion the data cannot carry.
  report.sleep.comparable =
    report.sleep.treated.count >= 3 && report.sleep.untreated.count >= 3;

  return report;
}
