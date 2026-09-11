/* ============================================================================
 * analysis.js — night/session aggregation, indices, and insight generation.
 *
 * Design rules (learned from prior art in this space):
 *  - Indices are COMPUTED HERE from event records, never read from the device
 *    summary. The device's own AHI formula is not publicly reproducible, so we
 *    publish our own definition instead of pretending to match the LCD.
 *  - Epoch events (2-minute analysis windows) are converted to % of therapy
 *    time and never counted as discrete events.
 *  - A night is the SD-card day folder. prisma uses a noon-to-noon boundary,
 *    so the folder name already identifies the night; we never re-derive it
 *    from a session timestamp.
 *  - Sessions shorter than MIN_SESSION_SEC are excluded from indices because
 *    brief mask-on/off produces meaningless per-hour rates.
 * ========================================================================== */

export const MIN_SESSION_SEC = 30 * 60;      // ignore <30 min for indices
export const COMPLIANCE_SEC  = 4 * 3600;     // the usual 4h/night benchmark

/*
 * AHI severity bands.
 *
 * These are the conventional AASM diagnostic bands (normal / mild / moderate /
 * severe). They describe untreated diagnostic severity; on therapy the usual
 * goal is simply "under 5". They are NOT an OSCAR definition — OSCAR publishes
 * no severity thresholds — so they are attributed to AASM here rather than to
 * any device or tool.
 */
export const AHI_BANDS = [
  { max: 5,   key: 'normal' },
  { max: 15,  key: 'mild' },
  { max: 30,  key: 'moderate' },
  { max: Infinity, key: 'severe' }
];

export function ahiBand (ahi) {
  return AHI_BANDS.find(b => ahi < b.max).key;
}

/* ---------------------------------------------------------------------------
 * Session and night aggregation
 * -------------------------------------------------------------------------*/

/**
 * Build a session record from one parsed event file (+ optional signal header).
 * `durationSec` prefers the structural 231 marker, then the EDF length.
 */
export function buildSession (parsedEvents, signalInfo, meta) {
  // Session length: the waveform record count is authoritative, because it is
  // derived from the actual file size (1 record = 1 second of recording).
  //
  // The structural RespEvent 231 is NOT a reliable session length. On observed
  // prisma SMART firmware (3.17.0008) a 19988-second recording carries
  // Duration="1226" on its 231 event — neither seconds nor deciseconds match
  // the true length, so 231 is used only as a last resort when no waveform
  // file accompanies the event file.
  const dur = signalInfo?.durationSec
    || parsedEvents.sessionDuration
    || 0;

  const discrete = parsedEvents.events.filter(
    e => !e.epoch && !e.structural && !e.flag
  );

  const counts = {};
  for (const e of discrete) counts[e.key] = (counts[e.key] || 0) + 1;

  // Epoch events: sum durations, express as % of session.
  const epochSec = {};
  for (const e of parsedEvents.events) {
    if (e.epoch) epochSec[e.key] = (epochSec[e.key] || 0) + e.duration;
  }

  const apneas = discrete.filter(e => e.scores === 'apnea');
  const hypopneas = discrete.filter(e => e.scores === 'hypopnea');

  // Mask-off intervals (306 off / 307 on) reduce genuine therapy time.
  const maskOff = parsedEvents.events.filter(e => e.id === 306).length;

  // Leak burden as PROPORTION OF THE NIGHT, not just a count.
  //
  // A percentile alone hides the distinction between barely crossing the
  // large-leak threshold for a few minutes and sitting well above it for half
  // the night — the two can produce a similar p95. Summing the duration of
  // large/critical leak events and expressing it as a share of the session is
  // the more honest measure, so both are reported.
  const leakSec = parsedEvents.events
    .filter(e => e.id === 330 || e.id === 161)
    .reduce((s, e) => s + e.duration, 0);

  return {
    ...meta,
    // Clock time: the EDF header is authoritative, because it records the
    // DEVICE's own local clock ("07.09.26 22.57.56" — a plausible bedtime).
    // The `started` unix timestamp in the event XML is not in agreement: on
    // the observed card it is ~12 h off, and interpreting it in any single
    // timezone yields mid-afternoon "nights". Since the machine has no
    // timezone and its display clock is what the user set, the wall-clock
    // string is the one that matches the reader's experience.
    startedAt: signalInfo?.startedAt ?? parsedEvents.startedAt ?? null,
    startedAtEpoch: parsedEvents.startedAt ?? null,
    durationSec: dur,
    usable: dur >= MIN_SESSION_SEC,
    events: parsedEvents.events,
    discrete,
    counts,
    epochSec,
    apneaCount: apneas.length,
    hypopneaCount: hypopneas.length,
    reraCount: counts.rera || 0,
    snoreCount: counts.snore || 0,
    largeLeakCount: counts.largeLeak || 0,
    criticalLeakCount: counts.criticalLeak || 0,
    periodicBreathingSec: parsedEvents.events
      .filter(e => e.id === 171).reduce((s, e) => s + e.duration, 0),
    csrSec: parsedEvents.events
      .filter(e => e.id === 181).reduce((s, e) => s + e.duration, 0),
    maskOffCount: maskOff,
    leakSec,
    leakPct: dur > 0 ? (leakSec / dur) * 100 : 0,

    // Long breathing pauses, and how the scored events distribute through
    // the session. Both read from event start times, which are already
    // converted from the file's deciseconds.
    longEventCount: [...apneas, ...hypopneas].filter(e => e.duration >= 30).length,
    scoredEvents: apneas.length + hypopneas.length,
    lateThirdEvents: dur > 0
      ? [...apneas, ...hypopneas].filter(e => e.start >= dur * (2 / 3)).length
      : 0,
    longestLeakSec: parsedEvents.events
      .filter(e => e.id === 330 || e.id === 161)
      .reduce((m, e) => Math.max(m, e.duration), 0),
    longestApneaSec: apneas.reduce((m, e) => Math.max(m, e.duration), 0),
    pressures: parsedEvents.events.map(e => e.pressure).filter(p => p > 0),
    signalInfo: signalInfo || null,
    get endedAt () {
      const s = this.startedAt;
      return s && this.durationSec > 0
        ? new Date(s.getTime() + this.durationSec * 1000)
        : s;
    }
  };
}

/**
 * Clock position of a moment, in hours from the previous midday.
 *
 * Sleep spans midnight, so a plain 0–24 hour-of-day axis would split every
 * night in two. Measuring from noon puts a whole night in one continuous
 * range: 20:00 -> 8, midnight -> 12, 06:00 -> 18.
 */
export function hoursFromNoon (d) {
  if (!d) return null;
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return h >= 12 ? h - 12 : h + 12;
}

/** Aggregate sessions belonging to one night folder. */
export function buildNight (dateKey, sessions, statDay) {
  const usable = sessions.filter(s => s.usable);
  const pool = usable.length ? usable : sessions;

  const totalSec = sessions.reduce((s, x) => s + x.durationSec, 0);
  const scoredSec = pool.reduce((s, x) => s + x.durationSec, 0);
  const hours = scoredSec / 3600;

  const sum = (f) => pool.reduce((s, x) => s + f(x), 0);
  const apnea = sum(s => s.apneaCount);
  const hypopnea = sum(s => s.hypopneaCount);
  const rera = sum(s => s.reraCount);
  const snore = sum(s => s.snoreCount);

  const counts = {};
  for (const s of pool) {
    for (const [k, v] of Object.entries(s.counts)) counts[k] = (counts[k] || 0) + v;
  }
  const epochSec = {};
  for (const s of pool) {
    for (const [k, v] of Object.entries(s.epochSec)) epochSec[k] = (epochSec[k] || 0) + v;
  }

  const rate = (n) => (hours > 0 ? n / hours : 0);
  const pct = (sec) => (scoredSec > 0 ? (sec / scoredSec) * 100 : 0);

  const obstructive = counts.obstructiveApnea || 0;
  const central = counts.centralApnea || 0;

  const pressures = pool.flatMap(s => s.pressures);

  return {
    date: dateKey,
    dateObj: keyToDate(dateKey),
    sessions,
    sessionCount: sessions.length,
    usableSessionCount: usable.length,
    totalSec,
    scoredSec,
    hours,
    compliant: totalSec >= COMPLIANCE_SEC,

    apneaCount: apnea,
    hypopneaCount: hypopnea,
    reraCount: rera,
    snoreCount: snore,
    obstructiveApneaCount: obstructive,
    centralApneaCount: central,
    largeLeakCount: sum(s => s.largeLeakCount),
    criticalLeakCount: sum(s => s.criticalLeakCount),
    leakSec: sum(s => s.leakSec),
    leakPct: pct(sum(s => s.leakSec)),
    longEventCount: sum(s => s.longEventCount),
    scoredEvents: sum(s => s.scoredEvents),
    lateThirdEvents: sum(s => s.lateThirdEvents),
    longestLeakSec: pool.reduce((m, s) => Math.max(m, s.longestLeakSec), 0),
    maskOffCount: sum(s => s.maskOffCount),
    longestApneaSec: pool.reduce((m, s) => Math.max(m, s.longestApneaSec), 0),

    // Our published index definitions.
    ahi: rate(apnea + hypopnea),
    ai: rate(apnea),
    hi: rate(hypopnea),
    rdi: rate(apnea + hypopnea + rera),
    reraIndex: rate(rera),
    snoreIndex: rate(snore),
    centralFraction: apnea > 0 ? central / apnea : 0,

    periodicBreathingPct: pct(sum(s => s.periodicBreathingSec)),
    csrPct: pct(sum(s => s.csrSec)),
    obstructionPct: pct((epochSec.severeObstruction || 0) + (epochSec.mildObstruction || 0)),
    flowLimitPct: pct(epochSec.flowLimitEpoch || 0),
    snoreEpochPct: pct(epochSec.snoreEpoch || 0),

    pressureMedian: median(pressures),
    pressureP95: percentile(pressures, 95),
    pressureMax: pressures.length ? Math.max(...pressures) : null,

    counts,
    epochSec,
    stat: statDay || null,
    config: statDay?.config || null,

    // Clock span of the night, for the sleep-timing chart. `bedtime` is the
    // first session's start and `wake` the last session's end, so the span
    // includes any mask-off gaps between them — that is the time in bed, of
    // which `totalSec` is the part actually on therapy.
    ...(() => {
      const timed = sessions.filter(s => s.startedAt).sort((a, b) => a.startedAt - b.startedAt);
      if (!timed.length) return { bedtime: null, wake: null, inBedSec: 0 };
      const bedtime = timed[0].startedAt;
      let wake = timed[0].endedAt;
      for (const s of timed) {
        if (s.endedAt && s.endedAt > wake) wake = s.endedAt;
      }
      return {
        bedtime,
        wake,
        inBedSec: wake && bedtime ? (wake - bedtime) / 1000 : 0
      };
    })()
  };
}

/* ---------------------------------------------------------------------------
 * Report-level rollup
 * -------------------------------------------------------------------------*/

export function buildReport (nights, device) {
  const withUse = nights.filter(n => n.totalSec > 0);
  const scored = nights.filter(n => n.hours > 0);

  const span = nights.length
    ? daysBetween(nights[0].dateObj, nights[nights.length - 1].dateObj) + 1
    : 0;

  const totalSec = sumBy(nights, n => n.totalSec);
  const compliantNights = withUse.filter(n => n.compliant).length;

  const ahis = scored.map(n => n.ahi);
  const usage = withUse.map(n => n.totalSec / 3600);

  const report = {
    device,
    nights,
    nightCount: nights.length,
    nightsWithUse: withUse.length,
    calendarSpan: span,
    daysSkipped: Math.max(0, span - withUse.length),
    adherencePct: span > 0 ? (withUse.length / span) * 100 : 0,
    compliantNights,
    compliancePct: withUse.length ? (compliantNights / withUse.length) * 100 : 0,
    totalHours: totalSec / 3600,
    avgHours: usage.length ? mean(usage) : 0,
    medianHours: median(usage),
    minHours: usage.length ? Math.min(...usage) : 0,
    maxHours: usage.length ? Math.max(...usage) : 0,
    usageStdDev: stdDev(usage),

    avgAhi: ahis.length ? mean(ahis) : 0,
    medianAhi: median(ahis),
    bestAhi: ahis.length ? Math.min(...ahis) : 0,
    worstAhi: ahis.length ? Math.max(...ahis) : 0,
    ahiStdDev: stdDev(ahis),
    band: ahis.length ? ahiBand(mean(ahis)) : null,

    avgAi: scored.length ? mean(scored.map(n => n.ai)) : 0,
    avgHi: scored.length ? mean(scored.map(n => n.hi)) : 0,
    avgRdi: scored.length ? mean(scored.map(n => n.rdi)) : 0,
    avgReraIndex: scored.length ? mean(scored.map(n => n.reraIndex)) : 0,
    avgSnoreIndex: scored.length ? mean(scored.map(n => n.snoreIndex)) : 0,
    avgPeriodicPct: scored.length ? mean(scored.map(n => n.periodicBreathingPct)) : 0,

    totalApneas: sumBy(nights, n => n.apneaCount),
    totalHypopneas: sumBy(nights, n => n.hypopneaCount),
    totalCentral: sumBy(nights, n => n.centralApneaCount),
    totalObstructive: sumBy(nights, n => n.obstructiveApneaCount),
    totalReras: sumBy(nights, n => n.reraCount),
    totalLargeLeaks: sumBy(nights, n => n.largeLeakCount),
    avgLeakPct: scored.length ? mean(scored.map(n => n.leakPct)) : 0,
    longestLeakSec: nights.reduce((m, n) => Math.max(m, n.longestLeakSec), 0),

    // Breathing pauses lasting over 30 s. Published work deriving duration
    // cut-offs for progressive oxygen decline lands in the 30-50 s region,
    // so 30 s is the conservative edge of that range.
    longEventCount: sumBy(nights, n => n.longEventCount),

    // Spread of bedtimes, as the range between the 10th and 90th percentile
    // of clock position. A plain standard deviation is distorted by one very
    // early or late night; this describes the usual window.
    bedtimeSpreadMin: (() => {
      const pos = withUse.map(n => hoursFromNoon(n.bedtime)).filter(v => v != null);
      if (pos.length < 7) return null;
      const p10 = percentile(pos, 10);
      const p90 = percentile(pos, 90);
      return (p90 - p10) * 60;
    })(),

    // Share of all scored events falling in the final third of each night.
    lateNightLoadPct: (() => {
      let late = 0, all = 0;
      for (const n of scored) {
        late += n.lateThirdEvents;
        all += n.scoredEvents;
      }
      return all > 0 ? (late / all) * 100 : null;
    })(),

    nightsAboveFive: scored.filter(n => n.ahi >= 5).length,
    longestApneaSec: nights.reduce((m, n) => Math.max(m, n.longestApneaSec), 0),
    trend: linearTrend(scored.map((n, i) => [i, n.ahi])),
    usageTrend: linearTrend(withUse.map((n, i) => [i, n.totalSec / 3600])),
    streak: longestStreak(nights)
  };

  const centralTotal = report.totalCentral;
  const apneaTotal = report.totalApneas;
  report.centralFraction = apneaTotal > 0 ? centralTotal / apneaTotal : 0;

  report.insights = generateInsights(report);
  return report;
}

/* ---------------------------------------------------------------------------
 * Insight engine
 *
 * Each insight: { id, severity, titleKey, bodyKey, actionKey, values }
 * Severity drives ordering and colour: critical > warning > info > good.
 * Text lives in i18n.js so every insight is bilingual.
 * -------------------------------------------------------------------------*/

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2, good: 3 };

/*
 * Threshold provenance.
 *
 * Every number this engine tests against is tagged, because a patient reading
 * "your snore index is high" deserves to know whether that line comes from a
 * scoring manual or from someone's forum post. Tiers:
 *
 *   clinical  AASM scoring manual / clinical guideline / CMS regulation
 *   device    documented manufacturer algorithm threshold
 *   research  peer-reviewed, but not adopted into any guideline
 *   heuristic this app's own screening cut — NOT a medical standard
 *
 * Anything tagged `heuristic` must be phrased as a prompt to look, never as a
 * finding. Two thresholds here were downgraded to `heuristic` after a review
 * found no clinical or manufacturer basis for them: the periodic-breathing
 * percentage bands and the snore-index cuts.
 */
export const TIER = {
  clinical: 'clinical',
  device: 'device',
  research: 'research',
  heuristic: 'heuristic'
};

export function generateInsights (r) {
  const out = [];
  const add = (id, severity, values = {}, tier = TIER.heuristic) =>
    out.push({ id, severity, values, tier });

  /* --- Overall control ------------------------------------------------- */
  if (r.nightsWithUse === 0) {
    add('noData', 'critical');
    return out;
  }

  /* --- Reliability gate -------------------------------------------------
   * Every per-hour index is count ÷ hours, so a short night or a leaky one
   * produces a confident-looking number from almost no usable signal. This
   * runs FIRST so the reader sees the caveat before the findings it affects.
   *
   * Devices also disagree with sleep-lab scoring in a direction that matters:
   * they tend to overestimate a low AHI and underestimate a high one, since
   * they see airflow only — no oxygen, effort, or arousals.
   */
  const scoredNights = r.nights.filter(n => n.hours > 0);
  const shortNights = scoredNights.filter(n => n.hours < 2).length;
  if (shortNights > 0) {
    add('shortSessionCaveat',
      shortNights > scoredNights.length * 0.3 ? 'warning' : 'info',
      { count: shortNights, total: scoredNights.length }, TIER.clinical);
  }
  if (r.avgLeakPct >= 15) {
    add('leakUnreliable', 'warning', { pct: r.avgLeakPct }, TIER.device);
  }

  const band = ahiBand(r.avgAhi);
  if (band === 'normal') add('ahiControlled', 'good', { ahi: r.avgAhi }, TIER.clinical);
  else if (band === 'mild') add('ahiMild', 'warning', { ahi: r.avgAhi }, TIER.clinical);
  else if (band === 'moderate') add('ahiModerate', 'critical', { ahi: r.avgAhi }, TIER.clinical);
  else add('ahiSevere', 'critical', { ahi: r.avgAhi }, TIER.clinical);

  /* --- Residual events despite therapy --------------------------------- */
  if (r.avgAhi < 5 && r.avgRdi >= 10) {
    add('reraBurden', 'warning',
      { rdi: r.avgRdi, rera: r.avgReraIndex }, TIER.clinical);
  }
  if (r.nightsAboveFive > 0 && r.avgAhi < 5) {
    add('inconsistentNights', 'info', {
      count: r.nightsAboveFive, total: scoredNights.length
    });
  }

  /* --- Flow limitation with an otherwise normal AHI ---------------------
   * One published criterion for an upper-airway-resistance pattern is a
   * normal AHI alongside flow limitation across more than ~30% of the night.
   * The entity is debated and this device's flow-limitation metric is not the
   * research signal, so this is raised as something to ask about.
   */
  const flowPct = scoredNights.length
    ? mean(scoredNights.map(n => n.flowLimitPct)) : 0;
  if (r.avgAhi < 5 && flowPct >= 30) {
    add('flowLimitation', 'warning', { pct: flowPct }, TIER.research);
  }

  /* --- Central vs obstructive ------------------------------------------
   * The accepted definition of treatment-emergent central sleep apnea pairs
   * BOTH a rate (central index >= 5/h) and a share (>50% of events central).
   * Testing the share alone fires on a handful of events and alarms people
   * over something that is usually transient and often resolves on its own.
   */
  const centralIndex = r.avgAi > 0 ? r.avgAi * r.centralFraction : 0;
  if (r.totalApneas >= 10 && r.centralFraction >= 0.5 && centralIndex >= 5) {
    add('centralDominant', 'critical', {
      pct: r.centralFraction * 100, central: r.totalCentral,
      total: r.totalApneas, index: centralIndex
    }, TIER.clinical);
  } else if (r.totalApneas >= 10 && r.centralFraction >= 0.5) {
    // Share is high but the rate is low: worth knowing, not worth alarm.
    add('centralShareHigh', 'info', {
      pct: r.centralFraction * 100, index: centralIndex
    }, TIER.clinical);
  } else if (r.totalApneas >= 10 && r.centralFraction >= 0.25) {
    add('centralPresent', 'info', { pct: r.centralFraction * 100 }, TIER.research);
  }

  /* --- Periodic breathing ----------------------------------------------
   * These percentage bands are this app's own screening cuts. A review of
   * clinical and manufacturer sources found no published "% of night" line
   * for periodic breathing; the clinical definition of Cheyne-Stokes
   * respiration is instead a crescendo-decrescendo pattern with a cycle
   * length of roughly 40-120 s, a central index >= 5/h, sustained for at
   * least two hours. Two hours of an eight-hour night is ~25%, so the old
   * 5% line fired far too readily. Raised to 25%/10% and labelled as this
   * app's heuristic rather than a standard.
   */
  if (r.avgPeriodicPct >= 25) {
    add('periodicBreathing', 'warning', { pct: r.avgPeriodicPct }, TIER.heuristic);
  } else if (r.avgPeriodicPct >= 10) {
    add('periodicBreathingMild', 'info', { pct: r.avgPeriodicPct }, TIER.heuristic);
  }
  // Cheyne-Stokes is reported separately, and only when the device flags it
  // over a meaningful share of the night. Device-flagged CSR is frequently
  // NOT cardiac — mask leak alone can mimic the waxing/waning pattern — so
  // the copy says that plainly while still advising a conversation.
  const csrPct = scoredNights.length ? mean(scoredNights.map(n => n.csrPct)) : 0;
  if (csrPct >= 10) {
    add('csrPattern', 'critical', { pct: csrPct }, TIER.clinical);
  }

  /* --- Adherence --------------------------------------------------------
   * The 4 h / 70% of nights line is a US insurance-reimbursement rule, not a
   * health target, and saying so is one of the more useful things this app
   * can do. The health evidence points at longer use.
   */
  if (r.compliancePct >= 95 && r.avgHours >= 7) {
    add('adherenceExcellent', 'good',
      { pct: r.compliancePct, hours: r.avgHours }, TIER.clinical);
  } else if (r.compliancePct < 70) {
    add('adherenceLow', 'critical',
      { pct: r.compliancePct, hours: r.avgHours }, TIER.clinical);
  } else if (r.avgHours < 6) {
    add('sleepDurationShort', 'warning', { hours: r.avgHours }, TIER.heuristic);
  }
  if (r.daysSkipped > 0) {
    add('nightsSkipped', r.daysSkipped > r.calendarSpan * 0.2 ? 'warning' : 'info', {
      skipped: r.daysSkipped, span: r.calendarSpan
    });
  }
  if (r.usageStdDev > 1.5) {
    add('usageIrregular', 'warning', { sd: r.usageStdDev }, TIER.heuristic);
  }

  /* --- Bedtime regularity ----------------------------------------------
   * Sleep-schedule regularity predicts health outcomes at least as strongly
   * as sleep duration, and an irregular schedule is associated with poorer
   * therapy adherence. The specific 90-minute cut is this app's; the
   * underlying research uses continuous measures, not a cutoff.
   */
  if (r.bedtimeSpreadMin != null && r.nightsWithUse >= 7 && r.bedtimeSpreadMin > 90) {
    add('bedtimeIrregular', 'info', { spread: r.bedtimeSpreadMin }, TIER.research);
  }

  /* --- Event timing within the night -----------------------------------
   * REM sleep concentrates in the last third of the night and apneas are
   * often worse in it. Without EEG this is an inference from timing alone,
   * and the copy says so.
   */
  if (r.lateNightLoadPct != null && r.lateNightLoadPct >= 50 && r.totalApneas + r.totalHypopneas >= 20) {
    add('lateNightClustering', 'info', { pct: r.lateNightLoadPct }, TIER.research);
  }

  /* --- Mask and leak ----------------------------------------------------
   * Graded by the PROPORTION of the night spent in large leak, not by event
   * count. Crossing the threshold briefly is common and rarely matters;
   * spending a third of the night there is a different problem, and a
   * percentile alone cannot tell the two apart.
   */
  const leakNights = r.nights.filter(n => n.largeLeakCount > 0).length;
  if (r.avgLeakPct >= 30) {
    // 30% of the night above the large-leak line is the one band here with a
    // documented manufacturer basis: it is where mask-seal indicators turn
    // unfavourable. The 15% and 5% bands below are this app's interpolations.
    add('leakSevere', 'critical',
      { pct: r.avgLeakPct, nights: leakNights }, TIER.device);
  } else if (r.avgLeakPct >= 15) {
    add('leakProbable', 'warning',
      { pct: r.avgLeakPct, nights: leakNights }, TIER.heuristic);
  } else if (r.avgLeakPct >= 5) {
    add('leakPossible', 'info',
      { pct: r.avgLeakPct, nights: leakNights }, TIER.heuristic);
  } else if (r.totalLargeLeaks > 0) {
    add('leakEvents', 'info', { events: r.totalLargeLeaks, nights: leakNights });
  }
  // A single very long leak matters even when the nightly share looks small.
  if (r.longestLeakSec >= 3600 && r.avgLeakPct < 15) {
    add('leakSustained', 'warning', { minutes: r.longestLeakSec / 60 });
  }
  const maskOffTotal = sumBy(r.nights, n => n.maskOffCount);
  if (maskOffTotal >= r.nightsWithUse * 2) {
    add('maskRemoval', 'warning', { count: maskOffTotal }, TIER.heuristic);
  }

  /* --- Snoring ----------------------------------------------------------
   * These cuts are this app's own. A review found no clinical threshold for
   * a "high" snore index on therapy, and published patient means run far
   * above these numbers, so they are framed as a prompt to look rather than
   * a grade. What is defensible is the meaning: snoring on therapy indicates
   * the airway is still vibrating, which often accompanies flow limitation.
   */
  if (r.avgSnoreIndex >= 30) {
    add('snoreHigh', 'info', { index: r.avgSnoreIndex }, TIER.heuristic);
  } else if (r.avgSnoreIndex >= 10) {
    add('snoreModerate', 'info', { index: r.avgSnoreIndex }, TIER.heuristic);
  }

  /* --- Pressure -------------------------------------------------------- */
  const cfg = r.nights.map(n => n.config).filter(Boolean).pop();
  if (cfg) {
    const p95s = r.nights.map(n => n.pressureP95).filter(v => v != null);
    if (cfg.mode && cfg.pressureMax && p95s.length) {
      const hitting = p95s.filter(p => p >= cfg.pressureMax - 0.3).length;
      if (hitting >= p95s.length * 0.3) {
        add('pressureCeiling', 'warning', {
          max: cfg.pressureMax, nights: hitting
        });
      }
    }
    if (cfg.mode === 'CPAP' && r.avgAhi >= 5) {
      add('considerAutoTitration', 'info', { mode: cfg.mode, ahi: r.avgAhi });
    }
  }

  /* --- Trend ------------------------------------------------------------ */
  if (r.nights.filter(n => n.hours > 0).length >= 5) {
    if (r.trend.slope > 0.15) add('ahiWorsening', 'warning', { slope: r.trend.slope });
    else if (r.trend.slope < -0.15) add('ahiImproving', 'good', { slope: -r.trend.slope });
    if (r.usageTrend.slope < -0.1) add('usageDeclining', 'warning', { slope: -r.usageTrend.slope });
  }

  /* --- Event duration ---------------------------------------------------
   * AHI counts a 10-second hypopnea and a 50-second apnea identically, so
   * duration carries information the index throws away. A count of long
   * events is more informative than the single longest one, which on any
   * given night is often just noise.
   */
  if (r.longEventCount > 0) {
    const perNight = r.longEventCount / Math.max(1, r.nightsWithUse);
    add('longEvents', perNight >= 5 ? 'warning' : 'info', {
      count: r.longEventCount, perNight, longest: r.longestApneaSec
    }, TIER.research);
  } else if (r.longestApneaSec >= 60) {
    add('longApnea', 'info', { seconds: r.longestApneaSec }, TIER.heuristic);
  }

  /* --- Positive reinforcement ------------------------------------------- */
  if (r.streak >= 7) add('goodStreak', 'good', { days: r.streak }, TIER.heuristic);

  out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return out;
}

/* ---------------------------------------------------------------------------
 * Small stats helpers
 * -------------------------------------------------------------------------*/

export function mean (a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }

export function median (a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile (a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export function stdDev (a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

function sumBy (a, f) { return a.reduce((s, x) => s + f(x), 0); }

/** Ordinary least squares on [x,y] pairs. */
export function linearTrend (pairs) {
  const n = pairs.length;
  if (n < 2) return { slope: 0, intercept: n ? pairs[0][1] : 0 };
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const [x, y] of pairs) { sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const d = n * sxx - sx * sx;
  if (d === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / d;
  return { slope, intercept: (sy - slope * sx) / n };
}

/** Longest run of consecutive compliant nights. */
function longestStreak (nights) {
  let best = 0, cur = 0;
  for (const n of nights) {
    if (n.compliant) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  }
  return best;
}

export function keyToDate (key) {
  return new Date(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8));
}

function daysBetween (a, b) {
  return Math.round((b - a) / 86400000);
}
