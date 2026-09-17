/* ============================================================================
 * i18n.js — Hebrew / English strings and locale plumbing.
 *
 * Language selection order:
 *   1. explicit user choice, persisted in localStorage
 *   2. Hebrew when the browser asks for it (an Accept-Language tag starting
 *      "he", or the legacy "iw")
 *   3. Hebrew — the default
 *
 * Hebrew sets dir="rtl" on <html>; the stylesheet uses logical properties so
 * the layout mirrors without a separate RTL sheet.
 * ========================================================================== */

const STORAGE_KEY = 'cpap-analyzer-lang';

export const LANGS = {
  en: { name: 'English',  dir: 'ltr', locale: 'en-GB' },
  he: { name: 'עברית',    dir: 'rtl', locale: 'he-IL' }
};

export const STRINGS = {
  en: {
    /* shell */
    appTitle: 'CPAP Analyzer',
    appSubtitle: 'Löwenstein prisma SD-card analysis — entirely in your browser',
    langLabel: 'Language',
    privacyNote: 'Everything runs in your browser and your data never leaves this device — no upload, no server, no tracking.',

    /* drop zone */
    chooseFolder: 'Choose your SD-card folder',
    dropHint: 'Select the root folder of the card (the one containing config.pscfg). Sub-folders are read automatically.',
    dropOr: 'or drag the folder here',
    scanning: 'Reading files…',
    parsing: 'Analysing session {n} of {total}…',
    rendering: 'Building your report…',
    reset: 'Analyse another folder',
    print: 'Print / Save as PDF',
    exportCsv: 'Export CSV',
    exportJson: 'Export JSON',

    /* errors */
    errNoFiles: 'No files were found in that folder.',
    errNotPrisma: 'This does not look like a Löwenstein prisma card. Expected config.pscfg, statistic.psstat, or folders containing event_*.xml and signal_*.wmedf files.',
    errPartial: '{n} file(s) could not be read and were skipped.',
    errGeneric: 'Something went wrong while reading the folder.',

    /* device */
    deviceTitle: 'Device',
    deviceModel: 'Model',
    deviceSerial: 'Serial number',
    deviceFirmware: 'Firmware',
    devicePlatform: 'Platform',
    deviceMode: 'Therapy mode',
    devicePressure: 'Pressure setting',
    deviceRamp: 'Ramp',
    deviceHumidifier: 'Humidifier',
    unknown: 'Unknown',
    minutes: '{n} min',

    /* summary */
    summaryTitle: 'Overview',
    nightsAnalysed: 'Nights analysed',
    dateRange: 'Date range',
    avgAhi: 'Average AHI',
    avgUsage: 'Average use',
    compliance: 'Nights ≥ 4 h',
    totalHours: 'Total therapy time',
    bestNight: 'Best night',
    worstNight: 'Worst night',
    eventsTotal: 'Events recorded',
    perNight: 'per night',
    hoursShort: 'h',
    eventsPerHour: '/h',

    /* severity bands */
    normal: 'Normal (under 5)',
    mild: 'Mild (5–15)',
    moderate: 'Moderate (15–30)',
    severe: 'Severe (30+)',

    /* insights */
    insightsTitle: 'Insights and action items',
    insightsLead: 'Each finding below carries a label saying where its threshold comes from. That matters: some are established clinical definitions, while others are screening lines this app set itself. Hover any label to see what it means.',
    tierClinical: 'Clinical standard',
    tierClinicalHelp: 'The threshold behind this finding comes from a published scoring manual, clinical guideline, or insurance regulation.',
    tierDevice: 'Manufacturer threshold',
    tierDeviceHelp: 'The threshold comes from documented CPAP manufacturer specifications for how the machine flags this.',
    tierResearch: 'Research-based',
    tierResearchHelp: 'Supported by peer-reviewed research, but not adopted into any clinical guideline. Treat as informative rather than definitive.',
    tierHeuristic: 'This app\u2019s own cut',
    tierHeuristicHelp: 'No clinical or manufacturer source publishes a threshold for this, so this app set one to decide when to raise it. Read it as a prompt to look, not as a medical finding.',
    insightsNone: 'No specific findings — your data looks unremarkable, which is usually good news.',
    whatThisMeans: 'What this means',
    whatToDo: 'What to do',
    severityCritical: 'Needs attention',
    severityWarning: 'Worth reviewing',
    severityInfo: 'For information',
    severityGood: 'Going well',

    /* charts */
    chartsTitle: 'Trends',
    chartAhi: 'AHI by night',
    chartUsage: 'Hours of use by night',
    chartComposition: 'Event composition',
    chartPressure: 'Pressure (95th percentile)',
    chartTiming: 'Sleep timing by night — start and end',
    chartTimingHint: 'Each night is a candle: the thin line is the whole time in bed, from first mask-on to last mask-off, and the solid block is the therapy time inside it. A block much shorter than its line means the mask was off for part of the night.',
    chartTimingHintSleep: 'The grey band behind each candle is the sleep your watch recorded. Where grey extends past the coloured block you were asleep without the mask; where the block extends past the grey the machine was running while you were awake.',
    chartNone: 'Not enough nights for a trend.',

    /* --- Withings sleep import --- */
    chartSleepStages: 'Restorative sleep — with CPAP vs without',
    chartSleepStagesHint: 'The share of your actual sleep spent in deep and REM, the two stages most associated with feeling rested. Measured by your watch, not by the CPAP machine.',
    sleepWithCpap: 'With CPAP',
    sleepWithoutCpap: 'Without CPAP',
    sleepDeep: 'Deep sleep',
    sleepRem: 'REM sleep',
    sleepNight: 'night',
    sleepNights: 'nights',
    sleepBandLabel: 'Watch sleep',
    sleepAsleep: 'Asleep:',
    sleepCompareCaveat: 'Read this as a prompt, not a result. Nights without CPAP are simply nights your watch recorded sleep and the card did not — often travel, illness, or a night off, each of which changes sleep on its own. A difference here is worth asking about, not a measurement of what therapy did.',
    withingsTitle: 'Sleep stages from a Withings device',
    withingsIntro: 'Your CPAP card knows when the mask was on. It does not know when you were asleep, or what your sleep looked like. Connecting a Withings watch or Sleep Analyzer adds that layer.',
    withingsConnect: 'Connect Withings',
    withingsConnecting: 'Waiting for Withings…',
    withingsFetching: 'Fetching sleep data…',
    withingsSetup: 'Set up',
    withingsSetupHide: 'Hide setup',
    withingsForget: 'Forget credentials',
    withingsClientId: 'Client ID',
    withingsClientSecret: 'Client secret',
    withingsSave: 'Save credentials',
    withingsSaved: 'Credentials saved in this browser.',
    withingsNeedCreds: 'Add your Withings credentials first.',
    withingsHelp: 'This app has no server, and Withings requires a client secret to complete a login — so you supply your own. Register a free application at developer.withings.com, set its callback URL to exactly {uri}, and enable restricted mode. Your credentials are stored only in this browser and are never sent anywhere except Withings.',
    withingsScopeNote: 'Only the user.activity scope is requested, which covers sleep and activity. The scope that can manage device linking is deliberately not requested.',
    withingsMatched: 'Matched {n} of {total} nights.',
    withingsNoMatch: 'No nights matched. Check that the dates overlap with your card.',
    withingsErrPopup: 'The popup was blocked. Allow popups for this page and try again.',
    withingsErrCancelled: 'Login was cancelled.',
    withingsErrTimeout: 'Login timed out.',
    withingsErrGeneric: 'Could not reach Withings: {msg}',
    withingsErrRate: 'Withings is rate-limiting requests. Wait a minute and try again.',
    gSleepBand: 'The period your Withings device recorded you as asleep. It comes from the watch, not the CPAP machine, so the two can disagree.',
    gSleepBack: 'Total sleep your watch recorded that night, on the same hours axis as the bar. Grey showing above the bar is time you were asleep without the mask on.',
    gSleepRelative: 'Total sleep your watch recorded that night, drawn relative to your longest night in this period. This axis is events per hour, so the grey shows whether you slept more or less than usual — not a value to read off the scale.',
    gSleepDeep: 'Deep sleep — the stage associated with physical recovery. Usually 13–23% of a night in healthy adults.',
    gSleepRem: 'REM sleep — the dreaming stage, associated with memory and mood. Usually 20–25% of a night in healthy adults, and the stage where untreated apnea tends to be worst.',
    legendObstructive: 'Obstructive apnea',
    legendCentral: 'Central apnea',
    legendHypopnea: 'Hypopnea',
    legendRera: 'RERA',
    legendSnore: 'Snore',
    thresholdLine: 'AHI 5 threshold',
    complianceLine: '4 h',

    /* nights table */
    nightsTitle: 'Night by night',
    nightsHint: 'Press the + on any night to see its sessions, event breakdown, recorded channels and waveform.',
    colDate: 'Date',
    colWeekday: 'Day',
    colUse: 'Use',
    colAhi: 'AHI',
    colAi: 'AI',
    colHi: 'HI',
    colRdi: 'RDI',
    colOa: 'OA',
    colCa: 'CA',
    colRera: 'RERA',
    colSnore: 'Snore',
    colLeak: 'Leaks',
    colPressure: 'P95',
    colSessions: 'Sessions',
    noUse: 'Not used',
    expandRow: 'Show detail',

    /* night detail */
    detailSessions: 'Sessions this night',
    detailSessionStart: 'Started',
    detailSessionLength: 'Length',
    detailEventBreakdown: 'Event breakdown',
    detailLongestApnea: 'Longest apnea',
    detailPeriodic: 'Periodic breathing',
    detailObstruction: 'Obstruction level',
    detailFlowLimit: 'Flow limitation',
    detailMaskOff: 'Mask removals',
    detailLeakPct: 'Night in large leak',
    detailChannels: 'Recorded channels',
    detailWaveform: 'Waveform',
    loadWaveform: 'Load waveform',
    waveformLoading: 'Decoding…',
    waveformUncalibrated: 'Flow is shown in arbitrary units: this device declares l/min but writes an uncalibrated 1:1 scale, so the shape is meaningful while the absolute values are not.',
    seconds: 's',

    /* glossary */
    glossaryTitle: 'Glossary and method',
    methodTitle: 'How these numbers were calculated',
    methodBody: 'Every index on this page is computed from the event records on the card, not copied from the device summary. Events are counted over sessions of at least 30 minutes, because shorter mask-on periods produce unstable per-hour rates. AHI = (apneas + hypopneas) ÷ hours. RDI additionally includes RERAs. Times in the event files are stored in tenths of a second and pressures in pascals; both are converted here. Nights follow the card\'s own noon-to-noon folder boundary, so a session beginning after midnight belongs to the night it started.',
    methodCaveat: 'The device also prints its own AHI on screen. That figure uses an undisclosed formula and will not always match the value here. This page shows what the recorded events actually contain.',
    disclaimerTitle: 'Important',
    disclaimerBody: 'This is an independent reading of your therapy data for your own understanding. It is not a medical device and not medical advice. Discuss any change to your therapy with the clinician or sleep specialist who manages it.',

    /* glossary terms */
    gAhi: 'Apnea–Hypopnea Index — breathing pauses and partial obstructions per hour of therapy. Under 5 is the usual target on treatment.',
    gAi: 'Apnea Index — complete breathing pauses per hour.',
    gHi: 'Hypopnea Index — partial airway narrowing per hour.',
    gRdi: 'Respiratory Disturbance Index — AHI plus RERAs. Can reveal residual sleep fragmentation when AHI already looks fine.',
    gHypopneaEvent: 'Hypopnea — the airway narrowed enough to reduce airflow substantially, without closing completely. Counted toward AHI alongside full apneas.',
    gOa: 'Obstructive apnea — the airway collapsed while effort to breathe continued.',
    gCa: 'Central apnea — no effort to breathe. Often called "clear airway".',
    gRera: 'Respiratory Effort Related Arousal — breathing effort rising enough to disturb sleep without meeting apnea or hypopnea criteria.',
    gSnore: 'Vibration detected in the airflow signal.',
    gLeak: 'Air escaping around the mask, above the level the machine can compensate for.',
    gPeriodic: 'Periodic breathing — a repeating crescendo/decrescendo pattern in breathing depth.',
    gP95: '95th-percentile pressure — the level your therapy reached or exceeded only 5% of the time.',
    gUsage: 'Therapy time recorded for this night, added up across every session. Four hours is the common benchmark, but the goal is all night — sleep left untreated late in the night matters, because REM sleep clusters there and apneas are often worse during it.',
    gTiming: 'When therapy started and ended. Consistent bedtimes usually improve both sleep quality and how much of the night gets treated.',

    /* appendix */
    appendixTitle: 'Appendix: the raw files',
    appendixIntro: 'Every file in the folder you picked is listed here, so you can see exactly what was read and what was not. Nothing was skipped silently.',
    invTitle: 'File inventory',
    invFiles: 'files',
    invFile: 'file',
    invUseFull: 'Fully used',
    invUsePartial: 'Partly used',
    invUseNone: 'Not used',
    catSignal: 'Waveform recordings',
    catEvent: 'Event records',
    catConfig: 'Device configuration',
    catStat: 'Daily statistics',
    catTrend: 'Trend curves',
    catCloud: 'Cloud upload bundle',
    catLog: 'Device logs',
    catDcm: 'Vendor parameter library',
    catSystem: 'Operating-system files',
    catOther: 'Other files',

    cloudTitle: 'Cloud upload bundle',
    cloudIntro: 'This is the package the device prepares for the manufacturer\'s cloud service. It contains no therapy data beyond what is already on the card — its copies of the configuration and statistics are identical to the standalone files — but it does carry the device\'s own certificate, which names the manufacturer and platform in plain text.',
    cloudField: 'Contents',
    cloudCertificate: 'Device certificate',
    cloudOrg: 'Issued to',
    cloudPlatform: 'Platform',
    cloudValid: 'Valid',
    cloudSignature: 'Signature',
    cloudSigNote: 'A cryptographic signature is present. It is shown for completeness only — this app does not verify it and makes no claim about authenticity.',
    cloudMatches: 'Identical to the standalone file on the card',
    cloudDiffers: 'Differs from the standalone file',

    logTitle: 'Device logs',
    logIntro: 'Firmware diagnostics written by the machine. These hold no therapy data, but they record when the card was written and any problems the device noticed.',
    logEntries: 'entries',
    logRange: 'Covering',
    logWarnings: 'Warnings and errors',
    logNone: 'No warnings or errors were logged.',
    logTruncated: 'Only the most recent part of this log was read.',
    logIdentity: 'Device identity from log header',

    trendTitle: 'Trend curves',
    trendIntro: 'One file per night holding a compact binary trend. The JSON header parses cleanly and is shown below. The binary payload is NOT decoded: its encoding is undocumented, and no public implementation reads it.',
    trendInvestigated: 'What the payload looks like',
    trendFindings: 'Measured on this card: the data begins immediately after the JSON header, not at the byte given by the "Offset" field — that value exceeds the file length on some nights, so it means something else. The body is two bytes per record, and the record count works out to roughly one record per two minutes of therapy. Values move smoothly through a small range, consistent with an averaged trend. On one night the high 4 bits of each record correlated strongly with average pressure per two-minute window, but that relationship did not hold across all nights, so no interpretation is offered here.',
    trendDay: 'Night',
    trendBytes: 'Payload bytes',
    trendRecords: 'Records (2 bytes each)',
    trendHeader: 'Header',

    notDecodedTitle: 'Not read at all',
    notDecodedBody: 'The vendor parameter library (Dcm/dcm.zip) contains two Windows .NET libraries, not patient data. It is the manufacturer\'s own dictionary mapping numeric parameter IDs to names and units — decompiling it offline would name the settings this report currently labels as unknown. Operating-system files such as System Volume Information are ignored.',

    /* credits */
    creditsTitle: 'Credits',
    creditsIntro: 'This app has no third-party code — no libraries, no frameworks, no CDN. Everything here is plain JavaScript, HTML and CSS. The open-source projects below earned credit in a different way: their published format documentation and reverse-engineering notes made this possible.',
    creditsNoCode: 'No code was copied from any of these projects.',
    creditLicence: 'Licence',
    creditWhat: 'What it contributed',
    creditsOscarWhat: 'The reference implementation for CPAP analysis across many manufacturers, and the origin of the prisma loader that first established these formats were readable. Its published developer notes documented the noon-to-noon day convention and its approach to time-weighted percentiles.',
    creditsAxtWhat: 'Standalone proof-of-concept parsers for prisma SMART, written by the same author who contributed OSCAR\'s prisma loader. Established that the .wmedf byte width can be derived from each channel\'s declared digital range, and that statistic.psstat is JSON.',
    creditsSemyonfWhat: 'A detailed, independently derived format reference for the prisma archive, including the event and parameter ID tables and the noon-to-noon boundary.',
    creditsCpapParserWhat: 'A multi-manufacturer reimplementation whose commit history confirmed that single-byte .wmedf channels are a real and specific correctness trap.',
    creditsFrostyslavWhat: 'A self-hosted viewer for the same JSON-era prisma cards, whose notes flagged that the flow channels declare l/min while writing an uncalibrated 1:1 scale.',
    creditsThanks: 'Thanks also to the Apnea Board community, whose forum threads and wiki are where most of this knowledge was first written down.',
    creditsOwn: 'Format details in this app were verified by measurement against a real card. Where a published note disagreed with the measurement, the measurement was used and the difference is recorded in the README.'
  },

  he: {
    /* shell */
    appTitle: 'מנתח CPAP',
    appSubtitle: 'ניתוח כרטיס SD של Löwenstein prisma — הכול בדפדפן שלך',
    langLabel: 'שפה',
    privacyNote: 'הכול פועל בדפדפן שלך והנתונים לא יוצאים מהמכשיר הזה — אין העלאה, אין שרת, אין מעקב.',

    /* drop zone */
    chooseFolder: 'בחר את תיקיית כרטיס ה‑SD',
    dropHint: 'בחר את תיקיית השורש של הכרטיס (זו שמכילה את config.pscfg). תיקיות המשנה נקראות אוטומטית.',
    dropOr: 'או גרור את התיקייה לכאן',
    scanning: 'קורא קבצים…',
    parsing: 'מנתח מקטע {n} מתוך {total}…',
    rendering: 'בונה את הדוח שלך…',
    reset: 'נתח תיקייה אחרת',
    print: 'הדפסה / שמירה כ‑PDF',
    exportCsv: 'ייצוא CSV',
    exportJson: 'ייצוא JSON',

    /* errors */
    errNoFiles: 'לא נמצאו קבצים בתיקייה שנבחרה.',
    errNotPrisma: 'התיקייה אינה נראית ככרטיס Löwenstein prisma. ציפינו למצוא config.pscfg, statistic.psstat, או תיקיות עם קבצי event_*.xml ו‑signal_*.wmedf.',
    errPartial: '{n} קבצים לא ניתנים לקריאה ולכן דולגו.',
    errGeneric: 'אירעה שגיאה בקריאת התיקייה.',

    /* device */
    deviceTitle: 'המכשיר',
    deviceModel: 'דגם',
    deviceSerial: 'מספר סידורי',
    deviceFirmware: 'גרסת קושחה',
    devicePlatform: 'פלטפורמה',
    deviceMode: 'מצב טיפול',
    devicePressure: 'הגדרת לחץ',
    deviceRamp: 'עלייה הדרגתית',
    deviceHumidifier: 'מאדה',
    unknown: 'לא ידוע',
    minutes: '{n} דק׳',

    /* summary */
    summaryTitle: 'תמונה כללית',
    nightsAnalysed: 'לילות שנותחו',
    dateRange: 'טווח תאריכים',
    avgAhi: 'AHI ממוצע',
    avgUsage: 'שימוש ממוצע',
    compliance: 'לילות עם 4 שעות ומעלה',
    totalHours: 'סך זמן הטיפול',
    bestNight: 'הלילה הטוב ביותר',
    worstNight: 'הלילה הגרוע ביותר',
    eventsTotal: 'אירועים שנרשמו',
    perNight: 'בלילה',
    hoursShort: 'ש׳',
    eventsPerHour: '/ש׳',

    /* severity bands */
    normal: 'תקין (מתחת ל‑5)',
    mild: 'קל (5–15)',
    moderate: 'בינוני (15–30)',
    severe: 'חמור (30 ומעלה)',

    /* insights */
    insightsTitle: 'תובנות ופעולות מומלצות',
    insightsLead: 'לכל ממצא למטה מוצמדת תווית שמציינת מאין בא הסף שלו. לזה יש חשיבות: חלק מהם הגדרות קליניות מבוססות, ואחרים קווי סינון שהיישום הזה קבע בעצמו. העבר את העכבר על תווית כדי לראות את משמעותה.',
    tierClinical: 'תקן קליני',
    tierClinicalHelp: 'הסף שמאחורי הממצא הזה מבוסס על ספר ניקוד מפורסם, הנחיה קלינית או תקנה ביטוחית.',
    tierDevice: 'סף של היצרן',
    tierDeviceHelp: 'הסף מבוסס על מפרט מתועד של יצרני CPAP לאופן שבו המכשיר מסמן זאת.',
    tierResearch: 'מבוסס מחקר',
    tierResearchHelp: 'נתמך במחקר שעבר שיפוט עמיתים, אך לא אומץ לתוך הנחיה קלינית. התייחס כמידע ולא כקביעה.',
    tierHeuristic: 'קו שקבע היישום',
    tierHeuristicHelp: 'אין מקור קליני או של יצרן שמפרסם סף לכך, ולכן היישום הזה קבע אחד כדי להחליט מתי להעלות את הנושא. קרא זאת כרמז להסתכל, לא כממצא רפואי.',
    insightsNone: 'לא נמצאו ממצאים מיוחדים — הנתונים נראים שגרתיים, וזה בדרך כלל סימן טוב.',
    whatThisMeans: 'מה זה אומר',
    whatToDo: 'מה כדאי לעשות',
    severityCritical: 'דורש התייחסות',
    severityWarning: 'כדאי לבדוק',
    severityInfo: 'לידיעה',
    severityGood: 'מתנהל היטב',

    /* charts */
    chartsTitle: 'מגמות',
    chartAhi: 'AHI לפי לילה',
    chartUsage: 'שעות שימוש לפי לילה',
    chartComposition: 'הרכב האירועים',
    chartPressure: 'לחץ (אחוזון 95)',
    chartTiming: 'שעות שימוש לפי לילה — התחלה/סוף',
    chartTimingHint: 'כל לילה הוא נר: הקו הדק הוא כל הזמן במיטה, מהרגע שהמסכה הורכבה ועד שהוסרה בפעם האחרונה, והמלבן המלא הוא זמן הטיפול שבתוכו. מלבן קצר בהרבה מהקו מעיד שהמסכה הייתה מוסרת בחלק מהלילה.',
    chartTimingHintSleep: 'הרצועה האפורה מאחורי כל נר היא השינה שהשעון שלך רשם. במקום שבו האפור חורג מעבר למלבן הצבעוני ישנת בלי מסכה; במקום שבו המלבן חורג מעבר לאפור המכשיר פעל בזמן שהיית ער.',

    /* --- ייבוא שינה מ‑Withings --- */
    chartSleepStages: 'שינה משקמת — עם CPAP מול בלי',
    chartSleepStagesHint: 'החלק מהשינה בפועל שעבר בשלבי שינה עמוקה ו‑REM, שני השלבים הקשורים ביותר לתחושת רעננות. נמדד על ידי השעון ולא על ידי מכשיר ה‑CPAP.',
    sleepWithCpap: 'עם CPAP',
    sleepWithoutCpap: 'בלי CPAP',
    sleepDeep: 'שינה עמוקה',
    sleepRem: 'שנת REM',
    sleepNight: 'לילה',
    sleepNights: 'לילות',
    sleepBandLabel: 'שינה לפי השעון',
    sleepAsleep: 'זמן שינה:',
    sleepCompareCaveat: 'יש לקרוא זאת כנקודה לבדיקה ולא כתוצאה. לילות בלי CPAP הם פשוט לילות שבהם השעון רשם שינה והכרטיס לא — לרוב נסיעות, מחלה או לילה של הפסקה, שכל אחד מהם משנה את השינה בפני עצמו. הבדל כאן שווה שאלה, אך אינו מדידה של מה שהטיפול עשה.',
    withingsTitle: 'שלבי שינה ממכשיר Withings',
    withingsIntro: 'כרטיס ה‑CPAP יודע מתי המסכה הייתה מורכבת. הוא אינו יודע מתי ישנת או כיצד נראתה השינה. חיבור שעון או מזרן Withings מוסיף את השכבה הזו.',
    withingsConnect: 'חיבור ל‑Withings',
    withingsConnecting: 'ממתין ל‑Withings…',
    withingsFetching: 'מוריד נתוני שינה…',
    withingsSetup: 'הגדרה',
    withingsSetupHide: 'הסתר הגדרה',
    withingsForget: 'מחק פרטי גישה',
    withingsClientId: 'Client ID',
    withingsClientSecret: 'Client secret',
    withingsSave: 'שמור פרטי גישה',
    withingsSaved: 'פרטי הגישה נשמרו בדפדפן הזה.',
    withingsNeedCreds: 'יש להוסיף תחילה את פרטי הגישה ל‑Withings.',
    withingsHelp: 'ליישום הזה אין שרת, ו‑Withings דורשת client secret כדי להשלים התחברות — ולכן אתה מספק אותו בעצמך. פתח יישום חינמי ב‑developer.withings.com, הגדר את כתובת ה‑callback שלו בדיוק ל‑{uri}, והפעל מצב מוגבל. פרטי הגישה נשמרים רק בדפדפן הזה ואינם נשלחים לשום מקום מלבד Withings.',
    withingsScopeNote: 'מתבקשת רק ההרשאה user.activity, המכסה שינה ופעילות. ההרשאה המאפשרת ניהול חיבור מכשירים אינה מתבקשת במכוון.',
    withingsMatched: 'הותאמו {n} מתוך {total} לילות.',
    withingsNoMatch: 'לא נמצאה התאמה ללילות. בדוק שהתאריכים חופפים לכרטיס.',
    withingsErrPopup: 'החלון הקופץ נחסם. אפשר חלונות קופצים לדף הזה ונסה שוב.',
    withingsErrCancelled: 'ההתחברות בוטלה.',
    withingsErrTimeout: 'תם הזמן להתחברות.',
    withingsErrGeneric: 'לא ניתן היה להגיע ל‑Withings: {msg}',
    withingsErrRate: 'Withings מגבילה כרגע את קצב הבקשות. המתן דקה ונסה שוב.',
    gSleepBand: 'הזמן שבו מכשיר ה‑Withings רשם אותך כישן. המידע מגיע מהשעון ולא ממכשיר ה‑CPAP, ולכן השניים עשויים לא להסכים.',
    gSleepBack: 'סך השינה שהשעון רשם באותו לילה, על אותו ציר שעות כמו העמודה. אפור שמופיע מעל העמודה הוא זמן שבו ישנת בלי מסכה.',
    gSleepRelative: 'סך השינה שהשעון רשם באותו לילה, מצויר ביחס ללילה הארוך ביותר בתקופה. הציר כאן הוא אירועים לשעה, ולכן האפור מראה אם ישנת יותר או פחות מהרגיל — ולא ערך שניתן לקרוא מהסקאלה.',
    gSleepDeep: 'שינה עמוקה — השלב הקשור להתאוששות גופנית. בדרך כלל 13%–23% מהלילה אצל מבוגרים בריאים.',
    gSleepRem: 'שנת REM — שלב החלומות, הקשור לזיכרון ולמצב רוח. בדרך כלל 20%–25% מהלילה אצל מבוגרים בריאים, והשלב שבו דום נשימה לא מטופל נוטה להיות חמור ביותר.',
    chartNone: 'אין מספיק לילות להצגת מגמה.',
    legendObstructive: 'אפנאה חסימתית',
    legendCentral: 'אפנאה מרכזית',
    legendHypopnea: 'היפופנאה',
    legendRera: 'RERA',
    legendSnore: 'נחירה',
    thresholdLine: 'סף AHI 5',
    complianceLine: '4 ש׳',

    /* nights table */
    nightsTitle: 'לילה אחר לילה',
    nightsHint: 'לחץ על ה‑+ בכל לילה כדי לראות את המקטעים שלו, פירוט האירועים, הערוצים המוקלטים וצורת הגל.',
    colDate: 'תאריך',
    colWeekday: 'יום',
    colUse: 'שימוש',
    colAhi: 'AHI',
    colAi: 'AI',
    colHi: 'HI',
    colRdi: 'RDI',
    colOa: 'חסימתי',
    colCa: 'מרכזי',
    colRera: 'RERA',
    colSnore: 'נחירה',
    colLeak: 'נזילות',
    colPressure: 'אחוזון 95',
    colSessions: 'מקטעים',
    noUse: 'לא בשימוש',
    expandRow: 'הצג פירוט',

    /* night detail */
    detailSessions: 'מקטעי השינה בלילה זה',
    detailSessionStart: 'התחלה',
    detailSessionLength: 'אורך',
    detailEventBreakdown: 'פירוט האירועים',
    detailLongestApnea: 'האפנאה הארוכה ביותר',
    detailPeriodic: 'נשימה מחזורית',
    detailObstruction: 'רמת חסימה',
    detailFlowLimit: 'הגבלת זרימה',
    detailMaskOff: 'הסרות מסכה',
    detailLeakPct: 'מהלילה בנזילה גדולה',
    detailChannels: 'ערוצים מוקלטים',
    detailWaveform: 'צורת גל',
    loadWaveform: 'טען צורת גל',
    waveformLoading: 'מפענח…',
    waveformUncalibrated: 'הזרימה מוצגת ביחידות שרירותיות: המכשיר מצהיר על ל׳/דק׳ אך כותב סקאלה לא מכוילת ביחס 1:1, כך שצורת הגל משמעותית אך הערכים המוחלטים אינם.',
    seconds: 'שנ׳',

    /* glossary */
    glossaryTitle: 'מילון מונחים ושיטת החישוב',
    methodTitle: 'איך חושבו המספרים האלה',
    methodBody: 'כל מדד בדף הזה מחושב מרשומות האירועים שעל הכרטיס, ולא מועתק מסיכום המכשיר. האירועים נספרים על מקטעים באורך 30 דקות לפחות, מפני שמקטעים קצרים יותר מייצרים קצבים לא יציבים לשעה. AHI = (אפנאות + היפופנאות) ÷ שעות. RDI מוסיף גם אירועי RERA. הזמנים בקבצי האירועים נשמרים בעשיריות שנייה והלחצים בפסקלים; שניהם מומרים כאן. הלילות נקבעים לפי גבול הצהריים של תיקיות הכרטיס, כך שמקטע שמתחיל אחרי חצות שייך ללילה שבו החל.',
    methodCaveat: 'המכשיר מציג גם AHI משלו על המסך. אותו מספר מחושב בנוסחה שאינה מפורסמת ולא תמיד יתאים לערך כאן. הדף הזה מציג את מה שהאירועים המוקלטים מכילים בפועל.',
    disclaimerTitle: 'חשוב לדעת',
    disclaimerBody: 'זו קריאה עצמאית של נתוני הטיפול שלך לצורך הבנה אישית. אינה מכשיר רפואי ואינה ייעוץ רפואי. כל שינוי בטיפול יש לדון בו עם הרופא או מומחה השינה שמנהל אותו.',

    /* glossary terms */
    gAhi: 'מדד אפנאה–היפופנאה — הפסקות נשימה וחסימות חלקיות לכל שעת טיפול. מתחת ל‑5 הוא היעד המקובל בזמן טיפול.',
    gAi: 'מדד אפנאה — הפסקות נשימה מלאות לשעה.',
    gHi: 'מדד היפופנאה — היצרות חלקית של דרכי האוויר לשעה.',
    gRdi: 'מדד הפרעות נשימה — AHI בתוספת אירועי RERA. יכול לחשוף התעוררויות שנותרו גם כאשר ה‑AHI נראה תקין.',
    gHypopneaEvent: 'היפופנאה — דרכי האוויר הצטמצמו עד כדי ירידה משמעותית בזרימת האוויר, בלי להיחסם לגמרי. נספרת ב‑AHI יחד עם אפנאות מלאות.',
    gOa: 'אפנאה חסימתית — דרכי האוויר נחסמו בעוד מאמץ הנשימה נמשך.',
    gCa: 'אפנאה מרכזית — ללא מאמץ נשימה. מכונה גם "דרך אוויר פנויה".',
    gRera: 'התעוררות הקשורה למאמץ נשימתי — מאמץ נשימה שעולה עד כדי הפרעה לשינה, בלי לעמוד בקריטריון של אפנאה או היפופנאה.',
    gSnore: 'רעידות שזוהו באות זרימת האוויר.',
    gLeak: 'אוויר שנוזל סביב המסכה, מעל הרמה שהמכשיר מסוגל לפצות עליה.',
    gPeriodic: 'נשימה מחזורית — תבנית חוזרת של התגברות והחלשה בעומק הנשימה.',
    gP95: 'לחץ באחוזון 95 — הרמה שהטיפול הגיע אליה או עבר אותה ב‑5% מהזמן בלבד.',
    gUsage: 'זמן הטיפול שנרשם בלילה זה, בסכימה של כל המקטעים. ארבע שעות הן אמת המידה המקובלת, אך המטרה היא כל הלילה — שינה שנותרת ללא טיפול בשעות המאוחרות משמעותית, כי שינת REM מתרכזת שם והאפנאות לעיתים חמורות יותר בה.',
    gTiming: 'מתי הטיפול התחיל והסתיים. שעות שינה קבועות בדרך כלל משפרות גם את איכות השינה וגם את חלק הלילה שמקבל טיפול.',

    /* appendix */
    appendixTitle: 'נספח: הקבצים הגולמיים',
    appendixIntro: 'כל קובץ בתיקייה שבחרת מופיע כאן, כדי שתוכל לראות בדיוק מה נקרא ומה לא. שום דבר לא דולג בשקט.',
    invTitle: 'מפרט הקבצים',
    invFiles: 'קבצים',
    invFile: 'קובץ',
    invUseFull: 'בשימוש מלא',
    invUsePartial: 'בשימוש חלקי',
    invUseNone: 'לא בשימוש',
    catSignal: 'הקלטות צורת גל',
    catEvent: 'רשומות אירועים',
    catConfig: 'הגדרות המכשיר',
    catStat: 'סטטיסטיקה יומית',
    catTrend: 'עקומות מגמה',
    catCloud: 'חבילת העלאה לענן',
    catLog: 'יומני המכשיר',
    catDcm: 'ספריית פרמטרים של היצרן',
    catSystem: 'קבצי מערכת הפעלה',
    catOther: 'קבצים אחרים',

    cloudTitle: 'חבילת ההעלאה לענן',
    cloudIntro: 'זו החבילה שהמכשיר מכין לשירות הענן של היצרן. היא אינה מכילה נתוני טיפול מעבר למה שכבר נמצא על הכרטיס — העתקי ההגדרות והסטטיסטיקה שבה זהים לקבצים הנפרדים — אך היא נושאת את תעודת המכשיר, שמציינת את שם היצרן והפלטפורמה בטקסט גלוי.',
    cloudField: 'תכולה',
    cloudCertificate: 'תעודת המכשיר',
    cloudOrg: 'הונפקה עבור',
    cloudPlatform: 'פלטפורמה',
    cloudValid: 'בתוקף',
    cloudSignature: 'חתימה',
    cloudSigNote: 'קיימת חתימה קריפטוגרפית. היא מוצגת לשם השלמות בלבד — היישום הזה אינו מאמת אותה ואינו טוען דבר לגבי אמינותה.',
    cloudMatches: 'זהה לקובץ הנפרד שעל הכרטיס',
    cloudDiffers: 'שונה מהקובץ הנפרד',

    logTitle: 'יומני המכשיר',
    logIntro: 'אבחון קושחה שנכתב על ידי המכשיר. אין בו נתוני טיפול, אך הוא מתעד מתי נכתב הכרטיס ואילו תקלות המכשיר זיהה.',
    logEntries: 'רשומות',
    logRange: 'מכסה',
    logWarnings: 'אזהרות ושגיאות',
    logNone: 'לא נרשמו אזהרות או שגיאות.',
    logTruncated: 'נקרא רק החלק האחרון של היומן.',
    logIdentity: 'זהות המכשיר מכותרת היומן',

    trendTitle: 'עקומות מגמה',
    trendIntro: 'קובץ אחד לכל לילה שמכיל מגמה בינארית דחוסה. כותרת ה‑JSON נקראת היטב ומוצגת למטה. המידע הבינארי אינו מפוענח: הקידוד שלו אינו מתועד ואין מימוש ציבורי שקורא אותו.',
    trendInvestigated: 'כיצד נראה המידע הבינארי',
    trendFindings: 'נמדד על הכרטיס הזה: הנתונים מתחילים מיד לאחר כותרת ה‑JSON, ולא בבית שמצוין בשדה "Offset" — הערך הזה חורג מאורך הקובץ בחלק מהלילות, ולכן משמעותו אחרת. גוף הקובץ הוא שני בתים לרשומה, ומספר הרשומות יוצא בקירוב רשומה אחת לכל שתי דקות טיפול. הערכים נעים בהדרגה בטווח קטן, מה שמתאים למגמה ממוצעת. בלילה אחד 4 הביטים הגבוהים של כל רשומה הראו מתאם חזק ללחץ הממוצע בחלון של שתי דקות, אך הקשר לא נשמר בכל הלילות, ולכן לא מוצעת כאן פרשנות.',
    trendDay: 'לילה',
    trendBytes: 'בתים',
    trendRecords: 'רשומות (2 בתים כל אחת)',
    trendHeader: 'כותרת',

    notDecodedTitle: 'לא נקרא כלל',
    notDecodedBody: 'ספריית הפרמטרים של היצרן (Dcm/dcm.zip) מכילה שתי ספריות .NET של Windows, ולא נתוני מטופל. זהו מילון היצרן עצמו הממפה מזהי פרמטרים מספריים לשמות וליחידות — פירוקו במחשב היה מאפשר לתת שם להגדרות שהדוח הזה מסמן כלא ידועות. קבצי מערכת ההפעלה, כמו System Volume Information, מתעלמים מהם.',

    /* credits */
    creditsTitle: 'תודות',
    creditsIntro: 'ביישום הזה אין קוד של צד שלישי — אין ספריות, אין תשתיות, אין CDN. הכול כאן הוא JavaScript, HTML ו‑CSS פשוטים. פרויקטי הקוד הפתוח שלמטה זכו לתודה בדרך אחרת: התיעוד והרישומים שפרסמו על מבנה הקבצים הם שאיפשרו את זה.',
    creditsNoCode: 'לא הועתק קוד מאף אחד מהפרויקטים האלה.',
    creditLicence: 'רישיון',
    creditWhat: 'מה הוא תרם',
    creditsOscarWhat: 'מימוש הייחוס לניתוח CPAP על פני יצרנים רבים, והמקור של מנגנון קריאת prisma שקבע לראשונה שהפורמטים האלה ניתנים לקריאה. רישומי המפתחים שפרסם תיעדו את מוסכמת היום מצהריים לצהריים ואת גישתו לאחוזונים משוקללי‑זמן.',
    creditsAxtWhat: 'מנתחי הוכחת היתכנות עצמאיים ל‑prisma SMART, מאת אותו מחבר שתרם את מנגנון ה‑prisma ל‑OSCAR. קבעו שרוחב הבתים ב‑.wmedf ניתן לגזירה מטווח הדיגיטלי המוצהר של כל ערוץ, ושהקובץ statistic.psstat הוא JSON.',
    creditsSemyonfWhat: 'מסמך ייחוס מפורט ועצמאי למבנה הארכיון של prisma, כולל טבלאות מזהי האירועים והפרמטרים וגבול הצהריים.',
    creditsCpapParserWhat: 'מימוש מחדש לריבוי יצרנים, שהיסטוריית הקומיטים שלו אישרה שערוצי .wmedf בבית בודד הם מלכודת נכונות אמיתית וספציפית.',
    creditsFrostyslavWhat: 'מציג עצמאי לאותם כרטיסי prisma מעידן ה‑JSON, שברישומיו צוין כי ערוצי הזרימה מצהירים על ל׳/דק׳ אך כותבים סקאלה לא מכוילת ביחס 1:1.',
    creditsThanks: 'תודה גם לקהילת Apnea Board, שבפורומים ובוויקי שלה נרשם לראשונה רוב הידע הזה.',
    creditsOwn: 'פרטי המבנה ביישום זה אומתו במדידה מול כרטיס אמיתי. במקום שבו רישום שפורסם נגד את המדידה, נבחרה המדידה וההבדל מתועד בקובץ README.'
  }
};

/* ---------------------------------------------------------------------------
 * Insight copy. Each entry has a title, an explanation, and an action.
 * Placeholders use {name} and are filled from the insight's `values`.
 * -------------------------------------------------------------------------*/

export const INSIGHT_TEXT = {
  en: {
    noData: {
      title: 'No therapy data found',
      body: 'The card was read successfully but contains no sessions with recorded therapy time.',
      action: 'Check that you selected the card root and that the device has been used with this card inserted.'
    },
    shortSessionCaveat: {
      title: 'Some nights are too short to score reliably',
      body: '{count} of {total} nights ran under two hours. Every per-hour figure on this page is a count divided by hours, so a short night produces a confident-looking number from very little data — three events in forty minutes reads as an AHI of about 4.5.',
      action: 'Read those nights as usage information rather than as scores. Judge your AHI on the full-length nights, and treat the averages here as approximate while short nights are in the mix.'
    },
    leakUnreliable: {
      title: 'Leak is high enough to distort the other numbers',
      body: 'With an average of {pct}% of each night above the large-leak level, the machine cannot reliably hold its pressure — and its event detection becomes less trustworthy too, because it identifies events from the airflow it measures.',
      action: 'Fix the leak first, then re-read the rest of this report. Numbers measured through a large leak can be wrong in either direction, so they are not a sound basis for any decision about pressure.'
    },
    ahiControlled: {
      title: 'Your AHI is in the normal range',
      body: 'Your average AHI is {ahi} events per hour, below the threshold of 5 that is normally used to judge whether therapy is controlling the condition. Worth knowing: the under-5 / 5–15 / 15–30 bands were designed to grade severity at diagnosis, not to grade therapy, and AHI counts a ten-second event the same as a fifty-second one.',
      action: 'Nothing to change on this measure. Keep using the machine as you are. If you still feel tired despite numbers like these, that is worth raising with a clinician — it is a recognised situation and not something to solve by adjusting settings.'
    },
    flowLimitation: {
      title: 'Flow limitation despite a normal AHI',
      body: 'Your AHI is under 5, but the machine recorded flow limitation across about {pct}% of your therapy time. Flow limitation is partial narrowing that restricts airflow without meeting the criteria for an apnea or hypopnea, so it never appears in AHI. One published description of an upper-airway-resistance pattern pairs a normal AHI with flow limitation over roughly a third of the night.',
      action: 'This is a specific thing to ask about, particularly if you feel unrefreshed despite good numbers. Two honest caveats: this pattern is debated among specialists, and your machine\'s flow-limitation measure is not the same signal used in that research — so treat it as a question, not a conclusion.'
    },
    csrPattern: {
      title: 'The machine flagged a Cheyne-Stokes breathing pattern',
      body: 'A repeating rise-and-fall pattern was flagged across about {pct}% of your therapy time. Clinically this pattern can be associated with heart or circulatory conditions, which is why it is worth raising promptly. Equally important: device-flagged patterns like this frequently turn out not to be cardiac at all — a large mask leak alone can produce a waxing and waning airflow trace that mimics it, as can residual obstruction and some medications.',
      action: 'Bring this to a clinician rather than waiting, and mention it specifically. Before you do, check your leak figures on this page: if leak was high on the same nights, that is a likely explanation and worth saying too.'
    },
    centralShareHigh: {
      title: 'Most apneas were central, but they were few',
      body: 'Over half your apneas were central rather than obstructive, yet the central rate itself is only about {index} per hour. The recognised definition of a treatment-related central pattern requires both a majority of events AND a rate of at least 5 per hour, so this meets the share but not the rate.',
      action: 'Nothing urgent. Worth mentioning at your next routine review so it can be watched, particularly if the rate climbs.'
    },
    bedtimeIrregular: {
      title: 'Your bedtimes vary widely',
      body: 'Your start times spread across roughly {spread} minutes. Research consistently finds that regularity of sleep timing predicts health outcomes at least as strongly as how long you sleep, and an irregular schedule is also associated with poorer long-term use of therapy.',
      action: 'A more consistent bedtime is one of the few things here entirely within your control, and it tends to improve both how you feel and how much of the night gets treated. This is general sleep health rather than an apnea finding.'
    },
    lateNightClustering: {
      title: 'Events cluster later in the night',
      body: 'About {pct}% of your scored events fell in the final third of your nights. REM sleep concentrates in that part of the night, and breathing events are often worse during REM, so this pattern is consistent with REM-related events.',
      action: 'Be aware this is an inference from timing alone — your machine records airflow, not sleep stages, so it cannot actually tell REM from other sleep. It is worth mentioning, because it can matter for how therapy is assessed: a short night that ends early may miss the part where your events concentrate.'
    },
    longEvents: {
      title: 'Some breathing pauses lasted a long time',
      body: '{count} events lasted 30 seconds or more — about {perNight} per night, with the longest at {longest} seconds. This matters because AHI ignores duration entirely: a ten-second event and a minute-long one each count as exactly one.',
      action: 'Occasional long events are common and one of them is not an emergency. A steady pattern of them is worth mentioning, because duration carries information your AHI does not show.'
    },
    ahiMild: {
      title: 'AHI is mildly elevated on treatment',
      body: 'Your average AHI is {ahi} events per hour. On therapy the usual target is under 5, so some events are getting through.',
      action: 'Review the event mix below: mostly obstructive events may respond to a pressure adjustment, while mask leak or a short night can also inflate the number. Raise it with your clinician rather than changing settings yourself.'
    },
    ahiModerate: {
      title: 'AHI remains in the moderate range',
      body: 'Your average AHI is {ahi} events per hour, which is well above the under-5 target for someone on therapy.',
      action: 'This is worth a clinical conversation soon. Bring this report, and note whether the events are obstructive (suggesting pressure or mask issues) or central.'
    },
    ahiSevere: {
      title: 'AHI is high despite therapy',
      body: 'Your average AHI is {ahi} events per hour. At this level the therapy does not appear to be controlling your breathing during sleep.',
      action: 'Contact the clinician who manages your therapy. Do not simply raise the pressure yourself — a high residual AHI can also indicate central events, a poorly fitting mask, or the wrong therapy mode.'
    },
    reraBurden: {
      title: 'Low AHI but frequent arousals',
      body: 'Your AHI is under 5, yet your RDI is {rdi} per hour because of {rera} RERA events per hour. A RERA is a stretch of increasing breathing effort that ends in a brief arousal without ever meeting the apnea or hypopnea criteria — so you surface slightly out of sleep, repeatedly, while AHI stays clean. RDI is simply AHI plus these arousals.',
      action: 'This is one recognised explanation for still feeling tired while the machine reports good numbers, so mention the RERA rate specifically. But do not stop there: persistent sleepiness on well-controlled therapy has several other causes worth ruling out — including insufficient sleep, restless legs, narcolepsy, medication and depression — and none of them are fixed by changing settings.'
    },
    inconsistentNights: {
      title: 'A few nights stand out from the rest',
      body: '{count} of {total} nights had an AHI of 5 or above even though your overall average is good.',
      action: 'Look at what those nights had in common — alcohol, a cold, sleeping position, or a late start. Isolated bad nights are normal; a pattern is worth noting.'
    },
    centralDominant: {
      title: 'Most of your apneas are central, not obstructive',
      body: '{pct}% of recorded apneas ({central} of {total}) were central, at a rate of about {index} per hour — meaning your airway was open but the breathing drive briefly paused. This meets the usual definition of a treatment-related central pattern, which requires both a majority of events and a rate of at least 5 per hour. Reassuringly, this arises in a minority of people starting therapy and often settles on its own over weeks.',
      action: 'Report this to your clinician rather than acting on it. Pressure treats obstruction, not central events, and the options when they persist — a different mode, or in some cases a lower pressure — are genuinely clinical decisions. Do not lower your own pressure in response to this: sometimes that is the right answer and sometimes it is not, which is exactly why it should not be guessed at.'
    },
    centralPresent: {
      title: 'A meaningful share of central events',
      body: '{pct}% of your apneas were central rather than obstructive.',
      action: 'Worth monitoring. If this share grows, or you feel worse after a pressure increase, mention it at your next review.'
    },
    periodicBreathing: {
      title: 'Periodic breathing over much of the night',
      body: 'A periodic rise-and-fall breathing pattern was recorded across {pct}% of your therapy time. Be aware this percentage threshold is a screening line set by this app, not a medical standard — no clinical or manufacturer source publishes a "% of night" cutoff for this. The clinical definition works differently, requiring a characteristic cycle length and a central event rate sustained over about two hours.',
      action: 'Worth raising at a review, especially alongside your central-apnea figures above. Sustained periodic breathing can relate to heart or circulatory factors, so it is not something to adjust away with mask or pressure changes. Check your leak figures too — a large leak can produce a rising and falling airflow trace that resembles this.'
    },
    periodicBreathingMild: {
      title: 'Some periodic breathing detected',
      body: 'A periodic breathing pattern accounted for {pct}% of your therapy time. This threshold is a screening line set by this app rather than a clinical standard.',
      action: 'No action needed now. Keep an eye on whether it increases over coming weeks, and mention it at a routine review if it does.'
    },
    adherenceExcellent: {
      title: 'Excellent, consistent use',
      body: 'You reached 4 hours on {pct}% of nights used, averaging {hours} hours. That is the range where the benefits of therapy are well established.',
      action: 'Keep going. Consistency at this level is the single biggest factor in getting value from treatment.'
    },
    adherenceLow: {
      title: 'Use is below the usual benchmark',
      body: 'Only {pct}% of your nights reached 4 hours, averaging {hours} hours per night. It is worth knowing where that 4-hour line comes from: it is an insurance reimbursement rule, not a health target. The health evidence points at longer use — benefits accumulate well past four hours.',
      action: 'If discomfort, mask fit, dryness, pressure or bloating is cutting nights short, each of those is fixable, so raise the specific reason with your provider rather than resolving to try harder. Acting sooner matters more than it might seem: use in the first few weeks of therapy strongly predicts use months later, so a problem worth fixing is worth fixing now.'
    },
    sleepDurationShort: {
      title: 'Nights are on the short side',
      body: 'You averaged {hours} hours per night on therapy. That clears the 4-hour benchmark but leaves part of your sleep untreated.',
      action: 'Untreated sleep late in the night matters, because REM sleep clusters there and apneas are often worse during it. If you are sleeping longer than the machine records, look at why the mask comes off.'
    },
    nightsSkipped: {
      title: 'Some nights have no data',
      body: '{skipped} of the {span} days in this period have no recorded therapy.',
      action: 'If the machine was used on those nights, the card may have been out of the device. If it was not used, note what got in the way — gaps tend to have practical causes.'
    },
    usageIrregular: {
      title: 'Night-to-night use varies a lot',
      body: 'Your nightly hours vary with a standard deviation of {sd} hours, so some nights are much shorter than others.',
      action: 'A steadier routine usually improves both comfort and results. Look for what shortens the variable nights.'
    },
    leakEvents: {
      title: 'Large leak was recorded',
      body: '{events} large-leak events were recorded across {nights} night(s). During a large leak the machine cannot maintain pressure reliably, and its event detection becomes less trustworthy.',
      action: 'Check the cushion for wear, facial hair, and strap tension. A cushion that seals well when new often starts leaking after a few months. Leak also rises when you sleep with your mouth open.'
    },
    leakSevere: {
      title: 'Large leak for much of the night',
      body: 'You spent an average of {pct}% of each night in large leak, across {nights} night(s). At this level the machine cannot hold the pressure it is trying to deliver, and the event counts it reports become unreliable too — so your real AHI may differ from the figure above.',
      action: 'Treat this as the first thing to fix, ahead of any pressure question. Check the cushion for wear and replace it if it is more than a few months old, check the headgear is not overtightened (a too-tight strap deforms the seal and leaks more), and consider whether your mouth is falling open — a chin strap or a full-face mask addresses that.'
    },
    leakProbable: {
      title: 'Leak is taking up a meaningful part of the night',
      body: 'On average {pct}% of each night was spent in large leak, across {nights} night(s).',
      action: 'Worth acting on. The usual causes in order of likelihood are a worn cushion, a mask a size off, straps too tight or too loose, and mouth opening during sleep. If the leak clusters at the end of the night, the cushion is probably slipping as you move.'
    },
    leakPossible: {
      title: 'Some large leak, at a manageable level',
      body: 'Large leak accounted for about {pct}% of each night on average.',
      action: 'Not a priority. Every mask leaks by design — they vent deliberately to clear exhaled air. Chasing the last of the leak is usually counter-productive if it is at this level.'
    },
    leakSustained: {
      title: 'One long, continuous leak',
      body: 'The longest single large-leak period lasted about {minutes} minutes, even though your nightly average is otherwise low.',
      action: 'A long unbroken leak usually means the mask shifted and stayed shifted — often after turning over. If it happened once, it may not repeat; if you find it recurring on the same side, the cushion or size is likely the cause.'
    },
    maskRemoval: {
      title: 'The mask comes off during the night',
      body: 'There were {count} mask-off periods across the analysed nights.',
      action: 'Frequent removals usually mean discomfort, dryness or pressure intolerance rather than a conscious decision. Each is addressable: humidification for dryness, a different cushion size for discomfort, and a clinician conversation about ramp or pressure relief. One cause worth naming because it is common and rarely mentioned is aerophagia — swallowing air, causing bloating and burping — which affects roughly one in six users and is a frequent reason people abandon therapy. If that describes you, say so; it changes what gets adjusted.'
    },
    snoreHigh: {
      title: 'Frequent snoring detected',
      body: 'Snore events averaged {index} per hour. Snoring on therapy means the airway is still vibrating, which often accompanies flow limitation and can precede outright obstruction. Note that there is no clinical threshold for a "high" snore index on therapy — this cut is set by this app, and reported averages in published patient groups run much higher than it.',
      action: 'Treat it as a prompt rather than a grade. It can indicate pressure slightly below what you need, or that your mouth is opening during sleep — the latter is worth distinguishing, since a chin strap or a full-face mask addresses mouth opening while a pressure change would not. Worth mentioning at your next review.'
    },
    snoreModerate: {
      title: 'Some snoring on therapy',
      body: 'Snore events averaged {index} per hour, a modest level.',
      action: 'Not alarming on its own. If it rises alongside AHI, the two are probably related.'
    },
    pressureCeiling: {
      title: 'Therapy is reaching your pressure limit',
      body: 'On {nights} night(s) your 95th-percentile pressure reached the configured maximum of {max} cmH₂O, meaning the machine wanted more pressure than it was allowed to give.',
      action: 'A machine at its ceiling cannot respond to events it detects. Only your clinician should change that limit, but this is concrete evidence to bring them. Check your leak figures first: a large leak can drive an auto-adjusting machine upward chasing pressure it is losing through the mask, which looks the same on this chart.'
    },
    considerAutoTitration: {
      title: 'Fixed pressure with residual events',
      body: 'Your device is set to {mode} with a single fixed pressure, and your average AHI is {ahi}. A fixed pressure cannot rise when events occur.',
      action: 'Ask whether an auto-adjusting mode or a different fixed pressure would suit you better — as one option to consider, not a recommendation: guidelines do not establish that automatic modes are generally better. Check leak and short nights first, since both inflate a residual AHI. This is a settings discussion for your clinician, not a self-adjustment.'
    },
    ahiWorsening: {
      title: 'AHI is trending upward',
      body: 'Across this period your AHI rose by roughly {slope} events per hour per night.',
      action: 'A rising trend usually has a cause — weight change, a worn mask cushion, nasal congestion, alcohol, or a new medication. Identifying it early is easier than reversing a long drift.'
    },
    ahiImproving: {
      title: 'AHI is trending downward',
      body: 'Your AHI improved by roughly {slope} events per hour per night over this period.',
      action: 'Whatever changed recently appears to be working. Worth knowing what it was so you can keep it.'
    },
    usageDeclining: {
      title: 'Nightly use is declining',
      body: 'Your hours per night fell by about {slope} hours per night across this period.',
      action: 'Declining use often signals a comfort problem developing quietly. Catching it now is easier than restarting after a long gap.'
    },
    longApnea: {
      title: 'A notably long breathing pause',
      body: 'The longest single apnea recorded lasted {seconds} seconds. The value in knowing this is that AHI ignores duration completely — a brief event and a long one count the same — so a long pause is information the index hides.',
      action: 'One long event on one night is common and not an emergency. It is worth mentioning alongside any daytime symptoms, particularly if long events become a pattern rather than a one-off.'
    },
    goodStreak: {
      title: '{days} nights in a row at 4 hours or more',
      body: 'You have a run of {days} consecutive compliant nights.',
      action: 'This is the habit that makes therapy work. Nothing to change.'
    }
  },

  he: {
    noData: {
      title: 'לא נמצאו נתוני טיפול',
      body: 'הכרטיס נקרא בהצלחה אך אינו מכיל מקטעים עם זמן טיפול מוקלט.',
      action: 'ודא שבחרת את תיקיית השורש של הכרטיס ושהמכשיר הופעל כשהכרטיס היה מוכנס.'
    },
    shortSessionCaveat: {
      title: 'חלק מהלילות קצרים מדי לניקוד מהימן',
      body: '{count} מתוך {total} לילות נמשכו פחות משעתיים. כל מדד לשעה בדף הזה הוא ספירה חלקי שעות, כך שלילה קצר מייצר מספר שנראה בטוח מתוך מעט מאוד נתונים — שלושה אירועים בארבעים דקות נקראים כ‑AHI של כ‑4.5.',
      action: 'קרא את הלילות האלה כמידע על שימוש ולא כניקוד. שפוט את ה‑AHI שלך לפי הלילות המלאים, והתייחס לממוצעים כאן כמשוערים כל עוד לילות קצרים מעורבים בהם.'
    },
    leakUnreliable: {
      title: 'הנזילה גבוהה דיה כדי לעוות את שאר המספרים',
      body: 'בממוצע {pct}% מכל לילה עברו מעל רמת הנזילה הגדולה, ולכן המכשיר אינו מצליח לשמור על הלחץ שלו — וגם זיהוי האירועים שלו נעשה פחות אמין, מפני שהוא מזהה אירועים מזרימת האוויר שהוא מודד.',
      action: 'תקן קודם את הנזילה, ורק אז קרא מחדש את שאר הדוח. מספרים שנמדדו דרך נזילה גדולה עשויים לטעות לשני הכיוונים, ולכן אינם בסיס אמין לשום החלטה על לחץ.'
    },
    flowLimitation: {
      title: 'הגבלת זרימה למרות AHI תקין',
      body: 'ה‑AHI שלך מתחת ל‑5, אך המכשיר רשם הגבלת זרימה בכ‑{pct}% מזמן הטיפול. הגבלת זרימה היא היצרות חלקית שמפריעה לזרימת האוויר בלי לעמוד בקריטריון של אפנאה או היפופנאה, ולכן היא אינה מופיעה כלל ב‑AHI. תיאור אחד שפורסם לתבנית של התנגדות בדרכי האוויר העליונות משלב AHI תקין עם הגבלת זרימה בכשליש מהלילה.',
      action: 'זו שאלה ספציפית לשאול, במיוחד אם אתה מרגיש לא רענן למרות מספרים טובים. שתי הערות כנות: התבנית הזו נתונה במחלוקת בין מומחים, ומדד הגבלת הזרימה של המכשיר שלך אינו אותו אות שנמדד באותו מחקר — ולכן זו שאלה, לא מסקנה.'
    },
    csrPattern: {
      title: 'המכשיר סימן תבנית נשימה מסוג צ׳יין‑סטוקס',
      body: 'תבנית חוזרת של עלייה וירידה סומנה בכ‑{pct}% מזמן הטיפול. מבחינה קלינית התבנית הזו עשויה להיות קשורה למצבים לבביים או במחזור הדם, ולכן כדאי להעלות אותה בהקדם. חשוב לא פחות: תבניות שמכשיר מסמן כך מתגלות לעיתים קרובות כלא לבביות כלל — נזילת מסכה גדולה לבדה יכולה לייצר עקבת זרימה עולה ויורדת שמחקה אותן, וכך גם חסימה שאריתית וחלק מהתרופות.',
      action: 'הבא זאת לרופא בהקדם ולא בהמתנה, וציין זאת במפורש. לפני כן בדוק את נתוני הנזילה בדף הזה: אם הנזילה הייתה גבוהה באותם לילות, זה הסבר סביר וכדאי לומר גם אותו.'
    },
    centralShareHigh: {
      title: 'רוב האפנאות היו מרכזיות, אך היו מעטות',
      body: 'למעלה ממחצית האפנאות שלך היו מרכזיות ולא חסימתיות, אך הקצב המרכזי עצמו הוא רק כ‑{index} לשעה. ההגדרה המוכרת לתבנית מרכזית הקשורה לטיפול דורשת גם רוב אירועים וגם קצב של 5 לשעה לפחות, כך שזה עומד ברוב אך לא בקצב.',
      action: 'אין דחיפות. כדאי להזכיר בביקורת השגרתית הבאה כדי שיעקבו אחר זה, במיוחד אם הקצב יעלה.'
    },
    bedtimeIrregular: {
      title: 'שעות השינה שלך משתנות מאוד',
      body: 'שעות ההתחלה שלך מתפרסות על פני כ‑{spread} דקות. מחקרים מוצאים בעקביות שסדירות של שעות השינה חוזה תוצאות בריאות לא פחות מאורך השינה, ולוח זמנים לא סדיר קשור גם לשימוש פחות טוב בטיפול לאורך זמן.',
      action: 'שעת שינה קבועה יותר היא אחד הדברים המעטים כאן שנמצאים לגמרי בשליטתך, והיא נוטה לשפר גם את ההרגשה וגם את חלק הלילה שמקבל טיפול. זו תובנה של בריאות שינה כללית ולא ממצא על אפנאה.'
    },
    lateNightClustering: {
      title: 'האירועים מתרכזים לקראת סוף הלילה',
      body: 'כ‑{pct}% מהאירועים שנוקדו נפלו בשליש האחרון של הלילות שלך. שינת REM מתרכזת באותו חלק של הלילה, ואירועי נשימה לעיתים חמורים יותר בה, כך שהתבנית מתאימה לאירועים הקשורים ל‑REM.',
      action: 'שים לב שזו הסקה מתוך תזמון בלבד — המכשיר רושם זרימת אוויר ולא שלבי שינה, ולכן אינו יכול באמת להבדיל בין REM לשינה אחרת. כדאי להזכיר זאת, כי יש לזה משמעות לאופן שבו מעריכים את הטיפול: לילה קצר שמסתיים מוקדם עלול לפספס דווקא את החלק שבו האירועים שלך מתרכזים.'
    },
    longEvents: {
      title: 'חלק מהפסקות הנשימה נמשכו זמן רב',
      body: '{count} אירועים נמשכו 30 שניות ומעלה — כ‑{perNight} בלילה, כשהארוך ביותר עמד על {longest} שניות. לכך יש חשיבות מפני שה‑AHI מתעלם לחלוטין ממשך: אירוע של עשר שניות ואירוע של דקה נספרים שניהם כאחד בדיוק.',
      action: 'אירועים ארוכים בודדים הם דבר שכיח ואחד כזה אינו מצב חירום. תבנית עקבית שלהם כדאי להזכיר, כי המשך נושא מידע שה‑AHI שלך אינו מראה.'
    },
    ahiControlled: {
      title: 'ה‑AHI שלך בטווח התקין',
      body: 'ה‑AHI הממוצע שלך הוא {ahi} אירועים לשעה, מתחת לסף 5 שמשמש בדרך כלל להערכה אם הטיפול מאזן את המצב. כדאי לדעת: הטווחים מתחת ל‑5, 5–15 ו‑15–30 נקבעו לדירוג חומרה באבחון ולא לדירוג טיפול, וה‑AHI סופר אירוע של עשר שניות בדיוק כמו אירוע של חמישים שניות.',
      action: 'אין מה לשנות במדד הזה. המשך להשתמש במכשיר כפי שאתה עושה. אם אתה בכל זאת מרגיש עייף עם מספרים כאלה, כדאי להעלות זאת מול רופא — זה מצב מוכר, ולא משהו שנפתר בשינוי הגדרות.'
    },
    ahiMild: {
      title: 'ה‑AHI מוגבה במידה קלה תחת טיפול',
      body: 'ה‑AHI הממוצע שלך הוא {ahi} אירועים לשעה. תחת טיפול היעד המקובל הוא מתחת ל‑5, כך שחלק מהאירועים עוברים.',
      action: 'בדוק את הרכב האירועים למטה: אירועים חסימתיים בעיקרם עשויים להיענות להתאמת לחץ, אך גם נזילת מסכה או לילה קצר מנפחים את המספר. העלה זאת מול הרופא במקום לשנות הגדרות בעצמך.'
    },
    ahiModerate: {
      title: 'ה‑AHI נותר בטווח הבינוני',
      body: 'ה‑AHI הממוצע שלך הוא {ahi} אירועים לשעה, גבוה משמעותית מהיעד של מתחת ל‑5 עבור מטופל תחת טיפול.',
      action: 'כדאי לקיים שיחה רפואית בהקדם. קח איתך את הדוח הזה, וציין אם האירועים חסימתיים (מה שמצביע על לחץ או מסכה) או מרכזיים.'
    },
    ahiSevere: {
      title: 'ה‑AHI גבוה למרות הטיפול',
      body: 'ה‑AHI הממוצע שלך הוא {ahi} אירועים לשעה. ברמה כזו נראה שהטיפול אינו מאזן את הנשימה שלך בשינה.',
      action: 'פנה לרופא שמנהל את הטיפול. אל תעלה את הלחץ בעצמך — AHI שאריתי גבוה יכול לנבוע גם מאירועים מרכזיים, ממסכה שאינה אוטמת או ממצב טיפול שאינו מתאים.'
    },
    reraBurden: {
      title: 'AHI נמוך אך התעוררויות תכופות',
      body: 'ה‑AHI שלך מתחת ל‑5, אך ה‑RDI הוא {rdi} לשעה בגלל {rera} אירועי RERA לשעה. אירוע RERA הוא קטע של מאמץ נשימה גובר שמסתיים בהתעוררות קצרה בלי לעמוד אף פעם בקריטריון של אפנאה או היפופנאה — כלומר אתה עולה מעט מהשינה, שוב ושוב, בעוד ה‑AHI נשאר נקי. ה‑RDI הוא פשוט AHI בתוספת ההתעוררויות האלה.',
      action: 'זה הסבר מוכר אחד לתחושת עייפות למרות מספרים טובים, ולכן הזכר במיוחד את קצב ה‑RERA. אבל אל תעצור שם: לעייפות מתמשכת תחת טיפול מאוזן יש סיבות נוספות שכדאי לשלול — בהן שינה לא מספקת, תנועות רגליים, נרקולפסיה, תרופות ודיכאון — ואף אחת מהן אינה נפתרת בשינוי הגדרות.'
    },
    inconsistentNights: {
      title: 'כמה לילות בולטים לרעה',
      body: '{count} מתוך {total} לילות הגיעו ל‑AHI של 5 ומעלה, גם אם הממוצע הכללי שלך טוב.',
      action: 'בדוק מה היה משותף לאותם לילות — אלכוהול, מחלה, תנוחת שינה או שעת התחלה מאוחרת. לילות גרועים בודדים הם נורמליים; תבנית חוזרת שווה תיעוד.'
    },
    centralDominant: {
      title: 'רוב האפנאות שלך מרכזיות ולא חסימתיות',
      body: '{pct}% מהאפנאות שנרשמו ({central} מתוך {total}) היו מרכזיות, בקצב של כ‑{index} לשעה — כלומר דרכי האוויר היו פתוחות אך הדחף הנשימתי נעצר לרגע. זה עומד בהגדרה המקובלת לתבנית מרכזית הקשורה לטיפול, הדורשת גם רוב אירועים וגם קצב של 5 לשעה לפחות. מעודד לדעת שזה מופיע אצל מיעוט מהמתחילים טיפול ולעיתים נרגע מעצמו תוך שבועות.',
      action: 'דווח על כך לרופא ואל תפעל על סמך זה בעצמך. לחץ מטפל בחסימה ולא באירועים מרכזיים, והאפשרויות כשהם נמשכים — מצב טיפול אחר, ולעיתים דווקא לחץ נמוך יותר — הן החלטות קליניות לכל דבר. אל תוריד את הלחץ שלך בתגובה לזה: לפעמים זו התשובה הנכונה ולפעמים לא, ובדיוק בשל כך אין לנחש אותה.'
    },
    centralPresent: {
      title: 'חלק משמעותי של אירועים מרכזיים',
      body: '{pct}% מהאפנאות שלך היו מרכזיות ולא חסימתיות.',
      action: 'כדאי לעקוב. אם החלק הזה גדל, או אם אתה מרגיש פחות טוב לאחר העלאת לחץ, הזכר זאת בביקורת הבאה.'
    },
    periodicBreathing: {
      title: 'נשימה מחזורית בחלק ניכר מהלילה',
      body: 'תבנית נשימה מחזורית של עלייה וירידה נרשמה ב‑{pct}% מזמן הטיפול. שים לב שסף האחוזים הזה הוא קו סינון שקבע היישום הזה ולא תקן רפואי — אין מקור קליני או של יצרן שמפרסם סף של אחוז מהלילה לכך. ההגדרה הקלינית עובדת אחרת, ודורשת אורך מחזור מאפיין וקצב אירועים מרכזיים שנמשך כשעתיים.',
      action: 'כדאי להעלות בביקורת, במיוחד לצד נתוני האפנאה המרכזית שלמעלה. נשימה מחזורית מתמשכת עשויה להיות קשורה לגורמים לבביים או במחזור הדם, ולכן אין לכייל אותה בשינויי מסכה או לחץ. בדוק גם את נתוני הנזילה — נזילה גדולה יכולה לייצר עקבת זרימה עולה ויורדת שדומה לזה.'
    },
    periodicBreathingMild: {
      title: 'זוהתה נשימה מחזורית מסוימת',
      body: 'תבנית נשימה מחזורית היוותה {pct}% מזמן הטיפול שלך. הסף הזה הוא קו סינון של היישום הזה ולא תקן קליני.',
      action: 'אין צורך בפעולה כעת. עקוב אם הממצא גובר בשבועות הקרובים, והזכר אותו בביקורת שגרתית אם כן.'
    },
    adherenceExcellent: {
      title: 'שימוש מצוין ועקבי',
      body: 'הגעת ל‑4 שעות ב‑{pct}% מהלילות שהיו בשימוש, בממוצע {hours} שעות. זה הטווח שבו התועלת מהטיפול מבוססת היטב.',
      action: 'המשך כך. עקביות ברמה הזו היא הגורם היחיד המשמעותי ביותר להצלחת הטיפול.'
    },
    adherenceLow: {
      title: 'השימוש מתחת לאמת המידה המקובלת',
      body: 'רק {pct}% מהלילות שלך הגיעו ל‑4 שעות, בממוצע {hours} שעות בלילה. כדאי לדעת מאין בא קו 4 השעות: זהו כלל של החזר ביטוחי ולא יעד בריאותי. העדויות הבריאותיות מצביעות על שימוש ארוך יותר — התועלת ממשיכה להצטבר הרבה מעבר לארבע שעות.',
      action: 'אם אי‑נוחות, התאמת מסכה, יובש, לחץ או נפיחות מקצרים לילות — כל אחד מהם ניתן לתיקון, ולכן העלה את הסיבה המדויקת מול הספק במקום להחליט להתאמץ יותר. לפעול מוקדם חשוב יותר מכפי שנראה: השימוש בשבועות הראשונים של הטיפול חוזה היטב את השימוש כעבור חודשים, כך שבעיה שכדאי לתקן — כדאי לתקן עכשיו.'
    },
    sleepDurationShort: {
      title: 'הלילות נוטים להיות קצרים',
      body: 'ממוצע של {hours} שעות בלילה תחת טיפול. זה עובר את רף 4 השעות אך משאיר חלק מהשינה ללא טיפול.',
      action: 'שינה ללא טיפול בשעות המאוחרות משמעותית, כי שינת REM מתרכזת שם והאפנאות לעיתים חמורות יותר בה. אם אתה ישן יותר ממה שהמכשיר רושם, בדוק מדוע המסכה יורדת.'
    },
    nightsSkipped: {
      title: 'בכמה לילות אין נתונים',
      body: '{skipped} מתוך {span} הימים בתקופה זו ללא טיפול מוקלט.',
      action: 'אם המכשיר היה בשימוש באותם לילות, ייתכן שהכרטיס לא היה בתוכו. אם לא היה בשימוש, שים לב מה הפריע — לפערים יש בדרך כלל סיבות מעשיות.'
    },
    usageIrregular: {
      title: 'השימוש משתנה מאוד מלילה ללילה',
      body: 'שעות השימוש הלילי משתנות בסטיית תקן של {sd} שעות, כך שחלק מהלילות קצרים בהרבה מאחרים.',
      action: 'שגרה יציבה יותר בדרך כלל משפרת גם נוחות וגם תוצאות. חפש מה מקצר את הלילות המשתנים.'
    },
    leakEvents: {
      title: 'נרשמה נזילה גדולה',
      body: '{events} אירועי נזילה גדולה נרשמו ב‑{nights} לילות. בזמן נזילה גדולה המכשיר אינו מצליח לשמור לחץ באופן מהימן, וזיהוי האירועים שלו נעשה פחות אמין.',
      action: 'בדוק שחיקה של הכרית, שיער פנים ומתיחות הרצועות. כרית שאוטמת היטב כשהיא חדשה מתחילה לנזול לעיתים לאחר כמה חודשים. הנזילה עולה גם בשינה עם פה פתוח.'
    },
    leakSevere: {
      title: 'נזילה גדולה בחלק ניכר מהלילה',
      body: 'בממוצע {pct}% מכל לילה עברו בנזילה גדולה, ב‑{nights} לילות. ברמה כזו המכשיר אינו מצליח לשמור על הלחץ שהוא מנסה לספק, וגם ספירת האירועים שהוא מדווח נעשית לא אמינה — כך שה‑AHI האמיתי שלך עשוי להיות שונה מהמוצג למעלה.',
      action: 'זה הדבר הראשון לתקן, לפני כל שאלה של לחץ. בדוק שחיקה של הכרית והחלף אותה אם היא מעל כמה חודשים, ודא שהרצועות אינן מהודקות יתר על המידה (רצועה הדוקה מדי מעוותת את האטימה ומגבירה נזילה), ושקול אם הפה נפתח בשינה — רצועת סנטר או מסכה מלאה נותנות מענה לכך.'
    },
    leakProbable: {
      title: 'הנזילה תופסת חלק משמעותי מהלילה',
      body: 'בממוצע {pct}% מכל לילה עברו בנזילה גדולה, ב‑{nights} לילות.',
      action: 'כדאי לטפל. הסיבות השכיחות, לפי סדר הסבירות: כרית שחוקה, מסכה במידה לא מתאימה, רצועות הדוקות או רפויות מדי, ופתיחת הפה בשינה. אם הנזילה מתרכזת לקראת סוף הלילה, סביר שהכרית מחליקה עם התנועה.'
    },
    leakPossible: {
      title: 'נזילה גדולה מסוימת, ברמה נסבלת',
      body: 'נזילה גדולה היוותה כ‑{pct}% מכל לילה בממוצע.',
      action: 'לא בעדיפות. כל מסכה נוזלת מתוכנון — היא מאווררת בכוונה כדי לסלק אוויר נשוף. מרדף אחרי שאריות הנזילה ברמה כזו בדרך כלל אינו מועיל.'
    },
    leakSustained: {
      title: 'נזילה אחת ארוכה ורצופה',
      body: 'תקופת הנזילה הגדולה הארוכה ביותר נמשכה כ‑{minutes} דקות, גם אם הממוצע הלילי שלך נמוך.',
      action: 'נזילה ארוכה ורצופה מעידה בדרך כלל על מסכה שהוסטה ונשארה כך — לעיתים לאחר היפוך בשינה. אם זה קרה פעם אחת, ייתכן שלא יחזור; אם זה חוזר על אותו צד, סביר שהכרית או המידה הן הסיבה.'
    },
    maskRemoval: {
      title: 'המסכה יורדת במהלך הלילה',
      body: 'נרשמו {count} מקטעים של הסרת מסכה בלילות שנותחו.',
      action: 'הסרות תכופות נובעות בדרך כלל מאי‑נוחות, יובש או קשיי לחץ ולא מהחלטה מודעת. לכל אחד יש מענה: הלחה ליובש, מידת כרית אחרת לאי‑נוחות, ושיחה עם הרופא על עלייה הדרגתית או הקלת לחץ. סיבה אחת ששווה לציין בשמה כי היא שכיחה ורק לעיתים רחוקות מוזכרת היא אֶרוֹפגיה — בליעת אוויר הגורמת לנפיחות וגיהוקים — שפוגעת בכאחד מכל שישה משתמשים והיא סיבה תכופה לנטישת הטיפול. אם זה מתאר אותך, אמור זאת; זה משנה מה מכווננים.'
    },
    snoreHigh: {
      title: 'זוהו נחירות תכופות',
      body: 'אירועי נחירה בממוצע {index} לשעה. נחירה תחת טיפול מעידה שדרכי האוויר עדיין רועדות, מה שנלווה לעיתים להגבלת זרימה ויכול להקדים חסימה מלאה. שים לב שאין סף קליני למדד נחירה גבוה תחת טיפול — הקו הזה נקבע ביישום הזה, והממוצעים שדווחו בקבוצות מטופלים גבוהים ממנו בהרבה.',
      action: 'התייחס לזה כרמז ולא כדירוג. זה יכול להצביע על לחץ נמוך במקצת מהנדרש, או על פתיחת הפה בשינה — וכדאי להבחין ביניהם, שכן רצועת סנטר או מסכה מלאה נותנות מענה לפתיחת פה בעוד שינוי לחץ לא. כדאי להזכיר בביקורת הבאה.'
    },
    snoreModerate: {
      title: 'נחירה מסוימת תחת טיפול',
      body: 'אירועי נחירה בממוצע {index} לשעה, רמה מתונה.',
      action: 'לא מדאיג בפני עצמו. אם הוא עולה יחד עם ה‑AHI, השניים קשורים כנראה.'
    },
    pressureCeiling: {
      title: 'הטיפול מגיע לגבול הלחץ שהוגדר',
      body: 'ב‑{nights} לילות הלחץ באחוזון 95 הגיע למקסימום המוגדר של {max} ס״מ מים, כלומר המכשיר ביקש יותר לחץ ממה שהותר לו לספק.',
      action: 'מכשיר שהגיע לתקרה אינו יכול להגיב לאירועים שהוא מזהה. רק הרופא אמור לשנות את הגבול, אך זו עדות קונקרטית להביא אליו. בדוק קודם את נתוני הנזילה: נזילה גדולה עלולה לדחוף מכשיר אוטומטי כלפי מעלה במרדף אחרי לחץ שנאבד דרך המסכה, וזה נראה זהה בגרף הזה.'
    },
    considerAutoTitration: {
      title: 'לחץ קבוע עם אירועים שאריתיים',
      body: 'המכשיר מוגדר למצב {mode} בלחץ קבוע יחיד, וה‑AHI הממוצע שלך הוא {ahi}. לחץ קבוע אינו יכול לעלות כשמתרחשים אירועים.',
      action: 'שאל אם מצב אוטומטי או לחץ קבוע אחר יתאימו לך יותר — כאפשרות לשקול ולא כהמלצה: ההנחיות אינן קובעות שמצבים אוטומטיים טובים יותר באופן כללי. בדוק קודם נזילה ולילות קצרים, ששניהם מנפחים AHI שאריתי. זו שיחת הגדרות עם הרופא, לא כיול עצמי.'
    },
    ahiWorsening: {
      title: 'מגמת ה‑AHI עולה',
      body: 'בתקופה זו ה‑AHI שלך עלה בכ‑{slope} אירועים לשעה בכל לילה.',
      action: 'למגמת עלייה יש בדרך כלל סיבה — שינוי במשקל, כרית מסכה שחוקה, גדוש באף, אלכוהול או תרופה חדשה. זיהוי מוקדם קל יותר מתיקון מגמה ממושכת.'
    },
    ahiImproving: {
      title: 'מגמת ה‑AHI יורדת',
      body: 'ה‑AHI שלך השתפר בכ‑{slope} אירועים לשעה בכל לילה בתקופה זו.',
      action: 'מה שהשתנה לאחרונה נראה עובד. כדאי לדעת מה זה היה כדי לשמר אותו.'
    },
    usageDeclining: {
      title: 'השימוש הלילי בירידה',
      body: 'שעות השימוש בלילה ירדו בכ‑{slope} שעות לאורך התקופה.',
      action: 'ירידה בשימוש מאותתת לעיתים על בעיית נוחות שמתפתחת בשקט. לתפוס אותה כעת קל יותר מלחזור לטיפול לאחר הפסקה ארוכה.'
    },
    longApnea: {
      title: 'הפסקת נשימה ארוכה במיוחד',
      body: 'האפנאה הבודדת הארוכה ביותר שנרשמה נמשכה {seconds} שניות. הערך בידיעה הזו הוא שה‑AHI מתעלם לגמרי ממשך — אירוע קצר וארוך נספרים אותו דבר — ולכן הפסקה ארוכה היא מידע שהמדד מסתיר.',
      action: 'אירוע ארוך אחד בלילה אחד הוא דבר שכיח ואינו מצב חירום. כדאי להזכיר אותו לצד תסמינים ביום, במיוחד אם אירועים ארוכים נעשים תבנית ולא מקרה חד‑פעמי.'
    },
    goodStreak: {
      title: '{days} לילות רצופים של 4 שעות ומעלה',
      body: 'יש לך רצף של {days} לילות עמידה ביעד.',
      action: 'זה ההרגל שמייצר את הצלחת הטיפול. אין מה לשנות.'
    }
  }
};

/* ---------------------------------------------------------------------------
 * Runtime
 * -------------------------------------------------------------------------*/

/**
 * Pick the starting language.
 *
 * Order:
 *   1. the reader's own saved choice from the selector — always wins
 *   2. Hebrew if the browser asks for it (any Accept-Language tag beginning
 *      "he", or the legacy "iw")
 *   3. Hebrew
 *
 * Hebrew is the default and is NOT given up merely because a browser reports
 * some other language. Most browsers ship advertising only the OS locale, so
 * deferring to that would hand an English page to a reader who wants Hebrew.
 * English is one click away in the header, and that choice is remembered.
 */
export const DEFAULT_LANG = 'he';

export function detectLanguage () {
  const stored = safeGet(STORAGE_KEY);
  if (stored && LANGS[stored]) return stored;

  const prefs = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || ''];
  for (const tag of prefs) {
    const primary = String(tag).toLowerCase().split('-')[0];
    if (primary === 'he' || primary === 'iw') return 'he';   // iw = legacy Hebrew code
  }
  return DEFAULT_LANG;
}

export function persistLanguage (lang) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
}

function safeGet (k) {
  try { return localStorage.getItem(k); } catch { return null; }
}

/** Create a translator bound to one language. */
export function makeI18n (lang) {
  const table = STRINGS[lang] || STRINGS.en;
  const fallback = STRINGS.en;
  const insights = INSIGHT_TEXT[lang] || INSIGHT_TEXT.en;
  const meta = LANGS[lang] || LANGS.en;

  const t = (key, vars) => {
    let s = table[key] ?? fallback[key] ?? key;
    if (vars) s = interpolate(s, vars);
    return s;
  };

  return {
    lang,
    dir: meta.dir,
    locale: meta.locale,
    t,
    insight (id, values) {
      const src = insights[id] || INSIGHT_TEXT.en[id];
      if (!src) return null;
      return {
        title: interpolate(src.title, values),
        body: interpolate(src.body, values),
        action: interpolate(src.action, values)
      };
    },
    num (v, digits = 1) {
      if (v == null || !Number.isFinite(v)) return '—';
      return new Intl.NumberFormat(meta.locale, {
        minimumFractionDigits: digits, maximumFractionDigits: digits
      }).format(v);
    },
    int (v) {
      if (v == null || !Number.isFinite(v)) return '—';
      return new Intl.NumberFormat(meta.locale).format(Math.round(v));
    },
    date (d, opts = { day: '2-digit', month: 'short' }) {
      if (!d) return '—';
      return new Intl.DateTimeFormat(meta.locale, opts).format(d);
    },
    /** Short weekday name: ראשון / שני … in Hebrew, Sun / Mon … in English. */
    weekday (d, style = 'short') {
      if (!d) return '';
      return new Intl.DateTimeFormat(meta.locale, { weekday: style }).format(d);
    },
    time (d) {
      if (!d) return '—';
      return new Intl.DateTimeFormat(meta.locale, {
        hour: '2-digit', minute: '2-digit', hour12: false
      }).format(d);
    },
    duration (sec) {
      if (!Number.isFinite(sec) || sec <= 0) return '0:00';
      const h = Math.floor(sec / 3600);
      const m = Math.round((sec % 3600) / 60);
      return `${h}:${String(m === 60 ? 0 : m).padStart(2, '0')}`;
    }
  };
}

function interpolate (s, vars) {
  if (!vars) return s;
  return String(s).replace(/\{(\w+)\}/g, (m, k) => {
    const v = vars[k];
    if (v == null) return m;
    return typeof v === 'number'
      ? (Number.isInteger(v) ? String(v) : v.toFixed(1))
      : String(v);
  });
}
