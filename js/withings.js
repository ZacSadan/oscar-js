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
const HANDOFF_KEY = 'withings-oauth-handoff';   // popup -> opener, see below
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
 * Read the popup's handoff payload, if it left one.
 *
 * localStorage, NOT sessionStorage. A popup does not reliably share a session
 * with its opener — after the cross-origin bounce through Withings the popup
 * can land in a fresh browsing context, where sessionStorage is a separate,
 * empty store and window.opener is null. localStorage is shared by every
 * same-origin context in the profile, so it survives that.
 *
 * Stale entries are guarded by a timestamp rather than trusted blindly.
 */
function readHandoff () {
  try {
    const raw = localStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    // An authorization code is dead after 30 s; anything older is debris from
    // an abandoned attempt and must never resolve a new one.
    if (!d || !d.at || Date.now() - d.at > 120000) { clearHandoff(); return null; }
    return d;
  } catch { return null; }
}

function clearHandoff () {
  try { localStorage.removeItem(HANDOFF_KEY); } catch { /* nothing to clear */ }
}

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

  const payload = { source: 'withings-oauth', code, error, state, at: Date.now() };

  // Hand off by TWO independent routes, because either can fail alone.
  //
  // localStorage is written FIRST, so the result is durable before any message
  // is attempted. It is the route that actually survives: after the bounce
  // through Withings the popup may have no window.opener at all, in which case
  // postMessage has nowhere to go. localStorage is shared by every same-origin
  // context, so the opener can still collect the code.
  //
  // postMessage is kept because it wakes the opener instantly instead of
  // waiting for its next poll.
  try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(payload)); }
  catch { /* private mode: the message route has to carry it alone */ }

  let delivered = false;
  try {
    if (window.opener && !window.opener.closed) {
      // Target our own origin explicitly rather than '*', so the code is
      // never broadcast to a document we did not open.
      window.opener.postMessage(payload, location.origin);
      delivered = true;
    }
  } catch { /* opener gone or cross-origin; storage still carries it */ }

  showCallbackNotice(delivered, error);
  // Close even when the message could not be posted: the opener picks the
  // result up from storage, and a popup left open helps nobody.
  setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 400);
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
  // `delivered` only says whether postMessage had somewhere to go. The result
  // was already written to localStorage either way, so the wording must not
  // imply failure when that is the route being used — a window opened without
  // an opener frequently cannot close itself, and the reader needs to know the
  // report already has what it needs.
  const msg = error
    ? (he ? 'ההתחברות נכשלה. אפשר לסגור את החלון.' : 'Sign-in failed. You can close this window.')
    : delivered
      ? (he ? 'מתחבר… החלון ייסגר מיד.' : 'Connected. Closing…')
      : (he ? 'ההתחברות הושלמה — הדוח נטען כעת. אפשר לסגור את החלון הזה.'
            : 'Sign-in complete — the report is loading. You can close this window.');

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
      window.removeEventListener('storage', onStorage);
      clearInterval(timer);
      fn(arg);
    };

    /** Accept a handoff payload from either route. */
    const accept = (d) => {
      if (!d || d.source !== 'withings-oauth') return false;
      if (settled) return true;
      clearHandoff();
      try { popup.close(); } catch { /* it closes itself too */ }
      if (d.error) finish(reject, new Error(d.error));
      else if (!d.code) finish(reject, new Error('no-code'));
      else if (d.state !== state) finish(reject, new Error('state-mismatch'));
      else finish(resolve, d.code);
      return true;
    };

    function onMessage (ev) {
      // Only trust messages from this origin, from our own popup.
      if (ev.origin !== location.origin) return;
      accept(ev.data);
    }
    window.addEventListener('message', onMessage);

    // The storage event fires in THIS window when another same-origin context
    // writes the key, which is how the result arrives when the popup has no
    // opener to post to. Together with the poll below this covers every case.
    function onStorage (ev) {
      if (ev.key && ev.key !== HANDOFF_KEY) return;
      accept(readHandoff());
    }
    window.addEventListener('storage', onStorage);

    // Anything left in sessionStorage by a previous attempt would be stale and
    // would resolve this one with the wrong code.
    clearHandoff();

    const started = Date.now();
    let closedAt = 0;
    const timer = setInterval(() => {
      // The storage route is checked on every tick, not only at close: it is
      // written before the message is posted, so it is usually the first of
      // the two to be readable.
      if (accept(readHandoff())) return;

      if (popup.closed) {
        // The popup can read as closed for a moment during the cross-origin
        // navigation back, and it closes itself right after handing over, so
        // a close is never immediately conclusive. Give the handoff time to
        // land before calling it a cancellation.
        if (!closedAt) closedAt = Date.now();
        if (Date.now() - closedAt > 3000) {
          // Last look before giving up: the write and the close can land in
          // either order, and a slow profile can put several hundred ms
          // between them.
          if (accept(readHandoff())) return;
          finish(reject, new Error('cancelled'));
        }
        return;
      }
      closedAt = 0;                 // it was only transiently unreachable

      if (Date.now() - started > 120000) {
        try { popup.close(); } catch { /* already gone */ }
        finish(reject, new Error('timeout'));
      }
    }, 250);
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

/* ---------------------------------------------------------------------------
 * Intra-night sleep stages
 *
 * `getsummary` gives whole-night totals only, which cannot answer "how did I
 * sleep while the mask was on, versus after it came off". That needs the
 * timestamped stage intervals from Sleep v2 `get`.
 *
 * The endpoint returns at most 24 h per call, so this is one request per
 * night. Nights are fetched in sequence rather than in parallel to stay well
 * inside Withings' rate limit, which is signalled as status 601 under an
 * HTTP 200.
 * -------------------------------------------------------------------------*/

/** Withings sleep-state codes. 1 light, 2 deep, 3 REM; 0 awake, 4 unspecified. */
const STATE_DEEP = 2;
const STATE_REM = 3;
const STATE_LIGHT = 1;

/**
 * Fetch stage intervals for one night.
 *
 * `from`/`to` are Date objects bounding the night. Returns
 * [{ start, end, state }] in seconds-resolution Dates, or [] when the night
 * has no intra-night detail (older devices only upload summaries).
 */
export async function fetchSleepStages (accessToken, from, to) {
  const body = new URLSearchParams({
    action: 'get',
    startdate: String(Math.floor(from.getTime() / 1000)),
    enddate: String(Math.floor(to.getTime() / 1000)),
    data_fields: 'hr'          // states come back regardless; hr is harmless
  });
  const res = await fetch(`${API_URL}/sleep`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const json = await res.json();
  if (json.status === 601) throw new Error('rate-limited');
  if (json.status !== 0) throw new Error(json.error || `withings status ${json.status}`);

  return (json.body?.series || [])
    .filter(s => s.startdate && s.enddate)
    .map(s => ({
      start: new Date(s.startdate * 1000),
      end: new Date(s.enddate * 1000),
      state: Number(s.state)
    }))
    .sort((a, b) => a.start - b.start);
}

/**
 * Split one night's stage intervals into the part overlapping CPAP therapy and
 * the part outside it.
 *
 * `sessions` are the card's therapy sessions for that night, each with a start
 * and a duration. A stage interval is clipped against every session, so an
 * interval that straddles a mask-off boundary contributes correctly to both
 * sides rather than being assigned wholesale to one.
 *
 * Returns { on, off }, each { deep, rem, light, sleep } in seconds.
 */
export function splitStagesByTherapy (intervals, sessions) {
  const windows = (sessions || [])
    .filter(s => s.startedAt && s.durationSec > 0)
    .map(s => [s.startedAt.getTime(), s.startedAt.getTime() + s.durationSec * 1000])
    .sort((a, b) => a[0] - b[0]);

  const blank = () => ({ deep: 0, rem: 0, light: 0, sleep: 0 });
  const on = blank(), off = blank();

  for (const iv of intervals) {
    // Only the three sleep states count toward the ratio; awake and
    // unspecified are excluded from both numerator and denominator.
    const isDeep = iv.state === STATE_DEEP;
    const isRem = iv.state === STATE_REM;
    const isLight = iv.state === STATE_LIGHT;
    if (!isDeep && !isRem && !isLight) continue;

    const a = iv.start.getTime(), b = iv.end.getTime();
    if (!(b > a)) continue;

    // Seconds of this interval that fall inside any therapy window.
    let covered = 0;
    for (const [ws, we] of windows) {
      const lo = Math.max(a, ws), hi = Math.min(b, we);
      if (hi > lo) covered += hi - lo;
    }
    const total = b - a;
    const outside = Math.max(0, total - covered);

    const add = (bucket, ms) => {
      const sec = ms / 1000;
      if (isDeep) bucket.deep += sec;
      else if (isRem) bucket.rem += sec;
      else bucket.light += sec;
      bucket.sleep += sec;
    };
    if (covered > 0) add(on, covered);
    if (outside > 0) add(off, outside);
  }

  return { on, off };
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

/**
 * Fetch intra-night stages for every night that has both sleep and a therapy
 * session, and attach the masked/unmasked split to each.
 *
 * This is what lets a SINGLE night show two percentages: a night where the
 * mask came off partway has restorative sleep on both sides of that moment,
 * and comparing them is a far tighter comparison than comparing whole nights,
 * because the same person on the same night is both groups.
 *
 * One request per night, run in sequence. `onProgress` lets the caller keep a
 * status line moving; a failure on one night is recorded and skipped rather
 * than abandoning the rest.
 */
export async function attachNightlySplit (report, accessToken, onProgress = () => {}) {
  const targets = report.nights.filter(n => n.sleep && n.sessions?.length);
  let done = 0;
  let any = false;

  for (const night of targets) {
    await onProgress(++done, targets.length);
    const s = night.sleep;
    // Widen the window slightly: the watch and the machine keep their own
    // clocks, and a stage interval clipped at the boundary would be lost.
    const from = new Date(s.start.getTime() - 3600 * 1000);
    const to = new Date((s.end || s.start).getTime() + 3600 * 1000);
    try {
      const intervals = await fetchSleepStages(accessToken, from, to);
      if (!intervals.length) continue;
      const { on, off } = splitStagesByTherapy(intervals, night.sessions);
      night.sleepSplit = {
        on: ratio(on),
        off: ratio(off)
      };
      if (night.sleepSplit.on || night.sleepSplit.off) any = true;
    } catch (err) {
      if (err.message === 'rate-limited') throw err;   // stop; retrying will not help
      // Any other failure on one night is not worth losing the others over.
    }
  }

  report.sleep.hasNightlySplit = any;
  return report;
}

/** Stage seconds -> the restorative ratio, or null when there is no sleep. */
function ratio (b) {
  if (!b || b.sleep <= 0) return null;
  return {
    deepSec: b.deep,
    remSec: b.rem,
    lightSec: b.light,
    sleepSec: b.sleep,
    deepRemPct: ((b.deep + b.rem) / b.sleep) * 100,
    deepPct: (b.deep / b.sleep) * 100,
    remPct: (b.rem / b.sleep) * 100
  };
}
