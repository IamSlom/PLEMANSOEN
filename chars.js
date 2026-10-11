/* ============================================================
   ARABIC AI INTEGRITY CHECKER — Character Database & Analysis Core
   ملف قاعدة بيانات العلامات الخفية والحركات العربية + منطق التحليل
   ============================================================ */
"use strict";

const ARABIC_AI = (() => {

  /* ----------------------------------------------------------
     1) العلامات الخفية / رموز التحكم غير المرئية
        Invisible & control characters (typical AI / copy-paste artifacts)
     ---------------------------------------------------------- */
  const INVISIBLE = [
    { cp: 0x200B, short: "ZWSP", name: "Zero Width Space", ar: "مسافة صفرية العرض", sev: "high",
      note: "مسافة لا تُرى ولا تُطبع — أشهر أثر تخلفه أدوات الذكاء الاصطناعي والنسخ من مصادر رقمية." },
    { cp: 0x200C, short: "ZWNJ", name: "Zero Width Non-Joiner", ar: "فاصل صفري غير واصل", sev: "medium",
      note: "له استخدام نادر ومشروع (كالفارسية)، لكنه مشبوه في مستند عربي عادي." },
    { cp: 0x200D, short: "ZWJ", name: "Zero Width Joiner", ar: "واصل صفري", sev: "medium",
      note: "يُستخدم لتكوين الإيموجي المركبة، وقد يُحقن آلياً داخل الكلمات العربية." },
    { cp: 0x200E, short: "LRM", name: "Left-to-Right Mark", ar: "علامة اتجاه يسار-إلى-يمين", sev: "medium",
      note: "علامة تحكم اتجاهية غير مرئية تربك ترتيب النص أحياناً." },
    { cp: 0x200F, short: "RLM", name: "Right-to-Left Mark", ar: "علامة اتجاه يمين-إلى-يسار", sev: "medium",
      note: "علامة تحكم اتجاهية غير مرئية — شائعة في النصوص المنسوخة من الويب أو المولدة آلياً." },
    { cp: 0x061C, short: "ALM", name: "Arabic Letter Mark", ar: "علامة الحرف العربي الخفية", sev: "high",
      note: "علامة اتجاهية خفية مخصصة للعربية ولا مبرر لوجودها في معظم المستندات." },
    { cp: 0x2060, short: "WJ", name: "Word Joiner", ar: "رابط الكلمات", sev: "high",
      note: "غير مرئية تماماً ولا تملك أي وظيفة ظاهرة في نص عربي عادي — مؤشر قوي." },
    { cp: 0x2061, short: "FA", name: "Function Application", ar: "تطبيق دالة (خفي)", sev: "high",
      note: "رمز رياضي خفي يتسرب أحياناً من نماذج لغوية كتبت معادلات." },
    { cp: 0x2062, short: "IT", name: "Invisible Times", ar: "علامة ضرب خفية", sev: "high",
      note: "رمز رياضي خفي — لا يظهر إطلاقاً في النص الظاهر." },
    { cp: 0x2063, short: "IS", name: "Invisible Separator", ar: "فاصل خفي", sev: "high",
      note: "رمز فاصل رياضي غير مرئي." },
    { cp: 0x2064, short: "IP", name: "Invisible Plus", ar: "علامة جمع خفية", sev: "high",
      note: "رمز جمع غير مرئي — أثر نموذجي لمخرجات الذكاء الاصطناعي الرياضية." },
    { cp: 0x2066, short: "LRI", name: "Left-to-Right Isolate", ar: "عزل اتجاهي LRI", sev: "medium",
      note: "علامة عزل اتجاهي حديثة وغير مرئية." },
    { cp: 0x2067, short: "RLI", name: "Right-to-Left Isolate", ar: "عزل اتجاهي RLI", sev: "medium",
      note: "علامة عزل اتجاهي حديثة وغير مرئية." },
    { cp: 0x2068, short: "FSI", name: "First Strong Isolate", ar: "عزل أول قوي FSI", sev: "medium",
      note: "علامة عزل اتجاهي حديثة وغير مرئية." },
    { cp: 0x2069, short: "PDI", name: "Pop Directional Isolate", ar: "إغلاق عزل اتجاهي PDI", sev: "medium",
      note: "علامة إغلاق لعلامات العزل — تأتي أزواجاً معها." },
    { cp: 0x202A, short: "LRE", name: "Left-to-Right Embedding", ar: "تضمين اتجاهي LRE", sev: "medium",
      note: "علامة تضمين اتجاهي قديمة وغير مرئية." },
    { cp: 0x202B, short: "RLE", name: "Right-to-Left Embedding", ar: "تضمين اتجاهي RLE", sev: "medium",
      note: "علامة تضمين اتجاهي قديمة وغير مرئية." },
    { cp: 0x202C, short: "PDF", name: "Pop Directional Formatting", ar: "إغلاق تضمين اتجاهي", sev: "medium",
      note: "علامة إغلاق اتجاهي غير مرئية." },
    { cp: 0x202D, short: "LRO", name: "Left-to-Right Override", ar: "تجاوز اتجاهي LRO", sev: "medium",
      note: "علامة تجاوز اتجاهي قوية وغير مرئية." },
    { cp: 0x202E, short: "RLO", name: "Right-to-Left Override", ar: "تجاوز اتجاهي RLO", sev: "high",
      note: "قد يُستخدم في هجمات الخداع البصري (عكس شكل النص) — وجوده خطر." },
    { cp: 0xFEFF, short: "BOM", name: "BOM / Zero Width No-Break Space", ar: "علامة ترتيب البايتات BOM", sev: "medium",
      note: "تتسرب عادةً من ملفات نصية أو تحويلات برمجية، وقد تظهر كعيب عرض في بداية المستند." },
    { cp: 0x00AD, short: "SHY", name: "Soft Hyphen", ar: "شرطة اختيارية خفية", sev: "low",
      note: "غير مرئية إلا عند نهاية السطر — قد تكون طبيعية أو أثر معالجة آلية." },
    { cp: 0x180E, short: "MVS", name: "Mongolian Vowel Separator", ar: "فاصل حروف العلة المنغولي", sev: "high",
      note: "أعيد تصنيفه كرمز تحكم — لا مبرر إطلاقاً لوجوده في نص عربي." }
  ];

  /* ----------------------------------------------------------
     2) الحركات العربية الأساسية (التشكيل الظاهر)
        Main Arabic diacritics (harakat)
     ---------------------------------------------------------- */
  const HARAKAT_MAIN = [
    { cp: 0x064B, ch: "\u064B", name: "فتحتان (تنوين فتح)", en: "Fathatan" },
    { cp: 0x064C, ch: "\u064C", name: "ضمتان (تنوين ضم)", en: "Dammatan" },
    { cp: 0x064D, ch: "\u064D", name: "كسرتان (تنوين كسر)", en: "Kasratan" },
    { cp: 0x064E, ch: "\u064E", name: "فتحة", en: "Fatha" },
    { cp: 0x064F, ch: "\u064F", name: "ضمة", en: "Damma" },
    { cp: 0x0650, ch: "\u0650", name: "كسرة", en: "Kasra" },
    { cp: 0x0651, ch: "\u0651", name: "شدة", en: "Shadda" },
    { cp: 0x0652, ch: "\u0652", name: "سكون", en: "Sukun" },
    { cp: 0x0670, ch: "\u0670", name: "ألف خنجرية", en: "Superscript Alef" }
  ];

  /* ----------------------------------------------------------
     3) حركات موسّعة + علامات قرآنية (تغطية شاملة)
        Extended marks & Quranic annotation signs
     ---------------------------------------------------------- */
  const HARAKAT_EXT = [
    { cp: 0x0653, name: "مدة علوية", en: "Maddah Above" },
    { cp: 0x0654, name: "همزة علوية", en: "Hamza Above" },
    { cp: 0x0655, name: "همزة سفلية", en: "Hamza Below" },
    { cp: 0x0656, name: "ألف سفلية", en: "Subscript Alef" },
    { cp: 0x0657, name: "ضمة معكوسة", en: "Inverted Damma" },
    { cp: 0x0658, name: "علامة النون الغنة", en: "Noon Ghunnah" },
    { cp: 0x0659, name: "زواراي (راء مغربية)", en: "Zwarakay" },
    { cp: 0x065A, name: "فوقية صغيرة", en: "Vowel Sign Small V Above" },
    { cp: 0x065B, name: "فوقية معكوسة", en: "Inverted Small V Above" },
    { cp: 0x065C, name: "نقطة سفلية", en: "Vowel Sign Dot Below" },
    { cp: 0x065D, name: "ضمة منعكسة", en: "Reversed Damma" },
    { cp: 0x065E, name: "فتحة بنقطتين", en: "Fatha with Two Dots" },
    { cp: 0x065F, name: "فتحة بثلاث نقاط", en: "Fatha with Three Dots" },
    { cp: 0x0615, name: "تاء صغيرة علوية (قرآني)", en: "Small High Teh" },
    { cp: 0x0616, name: "ليغاتورة علوية صغيرة (قرآني)", en: "Small High Ligature Alef" },
    { cp: 0x0617, name: "زاي علوية (قرآني)", en: "High Zain" },
    { cp: 0x0618, name: "فاء فارسية صغيرة علوية (قرآني)", en: "Small High Farsi Yeh" },
    { cp: 0x0619, name: "نون صغيرة علوية (قرآني)", en: "Small High Noon" },
    { cp: 0x061A, name: "ميم معزولة صغيرة علوية (قرآني)", en: "Small High Meem Isolated" },
    { cp: 0x06E5, name: "واو صغيرة علوية", en: "Small Waw" },
    { cp: 0x06E6, name: "ياء صغيرة علوية", en: "Small Ya" },
    { cp: 0x06E7, name: "ياء صغيرة علوية (قرآني)", en: "Small High Yeh" },
    { cp: 0x06E8, name: "نون صغيرة علوية (قرآني)", en: "Small High Noon" }
  ];

  /* نطاقات قرآنية موسعة تُفحص حرفاً حرفاً */
  const HARAKAT_RANGES = [
    { from: 0x06D6, to: 0x06DC, name: "علامات قرآنية علوية صغيرة" },
    { from: 0x06DF, to: 0x06E4, name: "علامات قرآنية علوية (وقف وخاتمات)" },
    { from: 0x06EA, to: 0x06ED, name: "علامات قرآنية فراغية" },
    { from: 0x08D3, to: 0x08FF, name: "علامات قرآنية موسعة (Arabic Extended-A)" }
  ];

  /* ----------------------------------------------------------
     4) فهارس البحث السريع
     ---------------------------------------------------------- */
  const invisibleMap = new Map();
  INVISIBLE.forEach(c => invisibleMap.set(c.cp, c));

  const harakaMap = new Map();
  HARAKAT_MAIN.forEach(c => harakaMap.set(c.cp, { ...c, group: "main" }));
  HARAKAT_EXT.forEach(c => harakaMap.set(c.cp, { ...c, group: "ext" }));

  function classifyRange(cp) {
    for (const r of HARAKAT_RANGES) {
      if (cp >= r.from && cp <= r.to) return { cp, name: r.name, group: "quranic" };
    }
    return null;
  }

  function isInvisible(cp) { return invisibleMap.has(cp); }
  function isHaraka(cp) { return harakaMap.has(cp) || !!classifyRange(cp); }
  function classify(cp) { return invisibleMap.get(cp) || harakaMap.get(cp) || classifyRange(cp) || null; }

  const SEV_ORDER = { high: 0, medium: 1, low: 2 };

  /* حروف عربية (بدون حركات) — مع تجاهل نطاق العلامات الموسعة 08D3+ */
  function isArabicLetterSafe(cp) {
    if (cp >= 0x08A0 && cp <= 0x08FF) return cp <= 0x08B4;
    return (cp >= 0x0620 && cp <= 0x063F) ||
           (cp >= 0x0641 && cp <= 0x064A) ||
           (cp >= 0x066E && cp <= 0x066F) ||
           (cp >= 0x0671 && cp <= 0x06D3) ||
           (cp >= 0x06FA && cp <= 0x06FF) ||
           (cp >= 0x0750 && cp <= 0x077F);
  }

  const hex = cp => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");

  /* ----------------------------------------------------------
     5) تحليل نصّ وإرجاع إحصاءات كاملة
     ---------------------------------------------------------- */
  const MAX_STORED_OCCURRENCES = 600;

  function analyzeText(text, partLabel) {
    const res = {
      part: partLabel || "النص",
      totalChars: text.length,
      wordsTotal: 0,
      arabicLetters: 0,
      harakaTotal: 0,
      invisibleTotal: 0,
      invCounts: new Map(),   /* cp -> n */
      harCounts: new Map(),   /* cp -> n */
      occurrences: [],        /* { kind:'inv'|'har', cp, para, before, after } */
      paraStats: [],          /* { index, letters, harakat, density, snippet } */
      wordsWithHaraka: 0,
      wordsFullyVocalized: 0
    };

    const paras = String(text).split(/\r?\n/);

    paras.forEach((para, pIndex) => {
      let letters = 0, har = 0, inv = 0;

      /* إحصاء الكلمات ونسب التشكيل */
      const words = para.split(/\s+/).filter(Boolean);
      res.wordsTotal += words.length;
      for (const w of words) {
        let L = 0, H = 0;
        for (const ch of w) {
          const cp = ch.codePointAt(0);
          if (isArabicLetterSafe(cp)) L++;
          else if (isHaraka(cp)) H++;
        }
        if (L > 0 && H > 0) res.wordsWithHaraka++;
        if (L >= 2 && H >= L) res.wordsFullyVocalized++;
      }

      /* المسح حرفاً حرفاً */
      let i = 0;
      for (const ch of para) {
        const cp = ch.codePointAt(0);
        const width = ch.length; /* لدعم الأزواج الرمزية */
        if (isArabicLetterSafe(cp)) letters++;
        else if (isHaraka(cp)) {
          har++; res.harCounts.set(cp, (res.harCounts.get(cp) || 0) + 1);
          if (res.occurrences.length < MAX_STORED_OCCURRENCES) {
            res.occurrences.push({ kind: "har", cp, para: pIndex,
              before: para.slice(Math.max(0, i - 25), i),
              after: para.slice(i + width, i + width + 25) });
          }
        }
        else if (isInvisible(cp)) {
          inv++; res.invCounts.set(cp, (res.invCounts.get(cp) || 0) + 1);
          if (res.occurrences.length < MAX_STORED_OCCURRENCES) {
            res.occurrences.push({ kind: "inv", cp, para: pIndex,
              before: para.slice(Math.max(0, i - 30), i),
              after: para.slice(i + width, i + width + 30) });
          }
        }
        i += width;
      }

      res.arabicLetters += letters;
      res.harakaTotal += har;
      res.invisibleTotal += inv;

      if (para.trim()) {
        res.paraStats.push({
          index: pIndex,
          letters,
          harakat: har,
          invisible: inv,
          density: letters ? har / letters : 0,
          snippet: para.trim().slice(0, 90)
        });
      }
    });

    return res;
  }

  /* دمج تحليلات عدة أجزاء (document + headers + footers + ...) */
  function mergeAnalyses(list) {
    if (list.length === 1) return list[0];
    const m = {
      part: "المستند كاملاً",
      totalChars: 0, wordsTotal: 0, arabicLetters: 0,
      harakaTotal: 0, invisibleTotal: 0,
      invCounts: new Map(), harCounts: new Map(),
      occurrences: [], paraStats: [],
      wordsWithHaraka: 0, wordsFullyVocalized: 0
    };
    for (const a of list) {
      m.totalChars += a.totalChars; m.wordsTotal += a.wordsTotal;
      m.arabicLetters += a.arabicLetters; m.harakaTotal += a.harakaTotal;
      m.invisibleTotal += a.invisibleTotal;
      m.wordsWithHaraka += a.wordsWithHaraka;
      m.wordsFullyVocalized += a.wordsFullyVocalized;
      a.invCounts.forEach((v, k) => m.invCounts.set(k, (m.invCounts.get(k) || 0) + v));
      a.harCounts.forEach((v, k) => m.harCounts.set(k, (m.harCounts.get(k) || 0) + v));
      a.occurrences.forEach(o => m.occurrences.push({ ...o, part: a.part }));
      a.paraStats.forEach(p => m.paraStats.push({ ...p, part: a.part }));
    }
    return m;
  }

  /* ----------------------------------------------------------
     6) مؤشر سلامة النص (Heuristic score)
        - العلامات الخفية وزنها الأثقل (أقوى مؤشر آلي)
        - كثافة الحركات مؤشر إضافي (النص المولد آلياً يُشكَّل تشكيلاً كاملاً غالباً)
     ---------------------------------------------------------- */
  function computeScore(a) {
    const deductions = [];
    let score = 100;

    let invHigh = 0, invMed = 0, invLow = 0;
    a.invCounts.forEach((n, cp) => {
      const info = invisibleMap.get(cp);
      const sev = info ? info.sev : "medium";
      if (sev === "high") invHigh += n;
      else if (sev === "low") invLow += n;
      else invMed += n;
    });

    if (a.invisibleTotal > 0) {
      const d = Math.min(55, Math.round(10 + invHigh * 7 + invMed * 3 + invLow));
      deductions.push({
        label: "وجود " + a.invisibleTotal + " علامة خفية غير مرئية (Zero-Width / علامات اتجاه)",
        points: d, kind: "critical"
      });
      score -= d;
    }

    const density = a.arabicLetters > 0 ? a.harakaTotal / a.arabicLetters : 0;
    let dDens = 0;
    if (density >= 0.40) dDens = 55;
    else if (density >= 0.20) dDens = 30 + (density - 0.20) / 0.20 * 25;
    else if (density >= 0.08) dDens = 10 + (density - 0.08) / 0.12 * 20;
    else if (density >= 0.02) dDens = (density - 0.02) / 0.06 * 10;
    dDens = Math.round(dDens);
    if (dDens > 0) {
      deductions.push({
        label: "كثافة حركات مرتفعة (" + (density * 100).toFixed(1) + "% من الحروف مشكَّلة) — نمط شائع في النصوص المولّدة آلياً",
        points: dDens, kind: "warn"
      });
      score -= dDens;
    }

    const fullVocRatio = a.wordsTotal > 0 ? a.wordsFullyVocalized / a.wordsTotal : 0;
    if (a.arabicLetters > 150 && fullVocRatio > 0.8) {
      deductions.push({
        label: "تشكيل شبه كامل لمعظم كلمات النص (نمط التشكيل الآلي الموحّد)",
        points: 8, kind: "warn"
      });
      score -= 8;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let band, bandKey;
    if (score >= 85)      { band = "سليم غالباً — لا مؤشرات واضحة على معالجة آلية"; bandKey = "good"; }
    else if (score >= 65) { band = "مؤشرات طفيفة — راجع التفاصيل أدناه";           bandKey = "ok"; }
    else if (score >= 40) { band = "مؤشرات قوية على معالجة أو توليد آلي";          bandKey = "warn"; }
    else                  { band = "مؤشرات قوية جداً — النص يحتمل بشدة أنه مولّد آلياً"; bandKey = "bad"; }

    return {
      score, band, bandKey, deductions,
      density, fullVocRatio,
      smallSample: a.arabicLetters < 120,
      invHigh, invMed, invLow
    };
  }

  /* ----------------------------------------------------------
     7) تنظيف النص / بناء نمط الحذف
     ---------------------------------------------------------- */
  function cleanText(text, opts) {
    opts = opts || {};
    let out = "";
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (isInvisible(cp)) continue;
      if (opts.stripHarakat && isHaraka(cp)) continue;
      out += ch;
    }
    return out;
  }

  /* بناء Regex للحروف المراد حذفها من XML المستند */
  function buildCleanRegex(opts) {
    const cps = INVISIBLE.map(c => c.cp);
    if (opts && opts.stripHarakat) {
      HARAKAT_MAIN.forEach(c => cps.push(c.cp));
      HARAKAT_EXT.forEach(c => cps.push(c.cp));
      HARAKAT_RANGES.forEach(r => { for (let c = r.from; c <= r.to; c++) cps.push(c); });
    }
    const cls = cps.map(cp => "\\u" + cp.toString(16).padStart(4, "0")).join("");
    return new RegExp("[" + cls + "]", "g");
  }

  return {
    INVISIBLE, HARAKAT_MAIN, HARAKAT_EXT, HARAKAT_RANGES,
    isInvisible, isHaraka, classify, isArabicLetter: isArabicLetterSafe,
    hex, analyzeText, mergeAnalyses, computeScore, cleanText, buildCleanRegex,
    SEV_ORDER
  };
})();
