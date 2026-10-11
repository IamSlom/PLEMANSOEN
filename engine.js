/* ============================================================
   ARABIC AI INTEGRITY CHECKER — DOCX Engine
   قراءة ملفات Word (docx) واستخراج النص + التنظيف + التقرير
   يعمل بالكامل في المتصفح — docx هو أرشيف ZIP يحوي XML
   ============================================================ */
"use strict";

const DOCX_ENGINE = (() => {

  /* الأجزاء النصية التي نفحصها داخل أرشيف docx */
  const SCAN_PART_RE = /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/;
  const PART_NAMES_AR = {
    "word/document.xml": "نص المستند الرئيسي",
    "word/footnotes.xml": "الحواشي السفلية",
    "word/endnotes.xml": "الحواشي الختامية",
    "word/comments.xml": "التعليقات"
  };

  const isScanPart = p => SCAN_PART_RE.test(p);
  const partArabicName = p => PART_NAMES_AR[p] || (p.indexOf("header") !== -1 ? "ترويسة صفحة" : p.indexOf("footer") !== -1 ? "تذييل صفحة" : p);

  /* تجاهل النسخ البديلة داخل mc:Fallback حتى لا تُحسب النصوص مرتين */
  function isUnderFallback(el) {
    let n = el.parentElement;
    while (n) {
      if (n.localName === "Fallback") return true;
      n = n.parentElement;
    }
    return false;
  }

  /* استخراج النص من XML لمستند وورد مع الحفاظ على فواصل الفقرات */
  function extractTextFromXml(xml) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(xml, "application/xml");
    } catch (e) {
      return "";
    }
    if (!doc || doc.getElementsByTagName("parsererror").length) return "";

    const out = [];
    const all = doc.getElementsByTagName("*");
    for (const el of all) {
      if (isUnderFallback(el)) continue;
      switch (el.localName) {
        case "p":          /* بداية فقرة جديدة */
          if (out.length) out.push("\n");
          break;
        case "br":
        case "cr":
          out.push("\n");
          break;
        case "tab":
          out.push("\t");
          break;
        case "t":          /* w:t — نص المستند الظاهر */
          out.push(el.textContent);
          break;
        /* نتجاهل: instrText (أكواد الحقول) و delText (حذف تتبع التغييرات) */
      }
    }
    return out.join("");
  }

  /* فتح ملف docx واستخراج نص كل الأجزاء المهمة */
  async function extractDocxParts(file) {
    if (typeof JSZip === "undefined") {
      throw new Error("مكتبة JSZip غير محمّلة — تحقق من اتصالك بالإنترنت ثم أعد المحاولة.");
    }
    let zip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch (e) {
      throw new Error("تعذّر قراءة الملف — تأكد أنه ملف Word بصيغة docx سليم (غير محمي بكلمة مرور).");
    }

    const paths = Object.keys(zip.files).filter(isScanPart).sort();
    if (paths.indexOf("word/document.xml") === -1) {
      throw new Error("الملف لا يحتوي بنية مستند Word صالحة (word/document.xml غير موجود).");
    }

    const parts = [];
    for (const p of paths) {
      const xml = await zip.file(p).async("string");
      parts.push({ path: p, label: partArabicName(p), text: extractTextFromXml(xml), xml });
    }
    const fullText = parts.map(x => x.text).join("\n");
    return { zip, parts, fullText };
  }

  /* تحليل كل الأجزاء ودمجها */
  function analyzeParts(parts) {
    const analyses = parts.map(pt => ARABIC_AI.analyzeText(pt.text, pt.label));
    return ARABIC_AI.mergeAnalyses(analyses);
  }

  /* ----------------------------------------------------------
     التنظيف: حذف العلامات الخفية (دائماً) والحركات (اختيارياً)
     من نص XML داخل الأرشيف مع الحفاظ على التنسيق
     ---------------------------------------------------------- */
  function cleanDocxXml(xml, opts) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(xml, "application/xml");
    } catch (e) { return xml; }
    if (!doc || doc.getElementsByTagName("parsererror").length) return xml;

    const re = ARABIC_AI.buildCleanRegex(opts);
    const all = doc.getElementsByTagName("*");
    for (const el of all) {
      if (el.localName !== "t") continue;
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3 && re.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(re, "");
        }
      }
    }
    /* نحافظ على سطر التعريف الأصلي للملف */
    const m = xml.match(/^<\?xml[^>]*\?>/);
    const decl = m ? m[0] : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return decl + new XMLSerializer().serializeToString(doc.documentElement);
  }

  async function buildCleanedDocx(zip, opts) {
    const out = new JSZip();
    const paths = Object.keys(zip.files);
    for (const p of paths) {
      const entry = zip.files[p];
      if (entry.dir) continue;
      if (isScanPart(p)) {
        const xml = await entry.async("string");
        out.file(p, cleanDocxXml(xml, opts));
      } else {
        out.file(p, await entry.async("uint8array"));
      }
    }
    return out.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE"
    });
  }

  /* ----------------------------------------------------------
     تقرير HTML مستقل قابل للطباعة والأرشفة
     ---------------------------------------------------------- */
  const esc = s => String(s).replace(/[&<>"']/g, m => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));

  function buildReportHtml(state) {
    const a = state.analysis, s = state.score;
    const now = new Date();
    const dt = now.toLocaleString("ar", { dateStyle: "full", timeStyle: "short" });

    const invRows = [...a.invCounts.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([cp, n]) => {
        const info = ARABIC_AI.classify(cp) || {};
        return "<tr><td><b>" + (info.short || "?") + "</b></td><td>" + esc(info.ar || info.name || "") +
          "</td><td dir='ltr'>" + ARABIC_AI.hex(cp) + "</td><td>" + n + "</td></tr>";
      }).join("");

    const harRows = [...a.harCounts.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([cp, n]) => {
        const info = ARABIC_AI.classify(cp) || {};
        return "<tr><td style='font-size:1.3em'>" + (info.ch || "◦") + "</td><td>" + esc(info.name || "") +
          "</td><td dir='ltr'>" + ARABIC_AI.hex(cp) + "</td><td>" + n + "</td></tr>";
      }).join("");

    const dedRows = s.deductions.map(d =>
      "<li class='" + d.kind + "'>" + esc(d.label) + " <b>(−" + d.points + " نقطة)</b></li>"
    ).join("") || "<li>لا خصومات — لم يُرصد أي مؤشر آلي.</li>";

    const ctxItems = a.occurrences.filter(o => o.kind === "inv").slice(0, 100).map(o => {
      const info = ARABIC_AI.classify(o.cp) || {};
      const partTxt = o.part ? " — " + esc(o.part) : "";
      return "<li><span class='chip'>" + (info.short || "?") + "</span> " +
        esc(o.before) + "<span class='chip'>[" + (info.short || "?") + "]</span>" + esc(o.after) +
        " <small>(فقرة " + (o.para + 1) + partTxt + ")</small></li>";
    }).join("");

    return "<!DOCTYPE html><html lang='ar' dir='rtl'><head><meta charset='utf-8'>" +
      "<title>تقرير فحص سلامة النص — " + esc(state.fileName || "نص ملصوق") + "</title>" +
      "<style>body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#1e293b;line-height:1.8}" +
      "h1{font-size:1.5em;border-bottom:3px solid #0f766e;padding-bottom:10px}h2{font-size:1.15em;color:#0f766e;margin-top:30px}" +
      "table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #d8dee9;padding:8px 10px;text-align:right}" +
      "th{background:#f1f5f9}.score{font-size:2.4em;font-weight:800;color:" + (s.score >= 65 ? "#0f766e" : s.score >= 40 ? "#b45309" : "#b91c1c") + "}" +
      ".meta{color:#64748b;font-size:.9em}.chip{display:inline-block;background:#fee2e2;color:#b91c1c;border-radius:4px;padding:0 6px;font-size:.85em;font-weight:700}" +
      "li.critical{color:#b91c1c}li.warn{color:#b45309}ol.ctx li{margin:8px 0}small{color:#64748b}" +
      ".note{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:.9em}</style></head><body>" +
      "<h1>تقرير فحص سلامة النص العربي</h1>" +
      "<p class='meta'>الملف: <b>" + esc(state.fileName || "نص ملصوق") + "</b> — التاريخ: " + dt +
      " — أُنشئ بواسطة أداة مُفتِّش النص العربي (فحص محلي داخل المتصفح)</p>" +
      "<div class='score'>" + s.score + " / 100</div>" +
      "<p><b>الحكم: " + esc(s.band) + "</b>" + (s.smallSample ? " <em>(عينة صغيرة — النتيجة إرشادية)</em>" : "") + "</p>" +
      "<h2>عوامل الخصم</h2><ol>" + dedRows + "</ol>" +
      "<h2>العلامات الخفية المرصودة</h2>" +
      (invRows ? "<table><tr><th>الرمز</th><th>الاسم</th><th>الكود</th><th>العدد</th></tr>" + invRows + "</table>" : "<p>لم يُرصد أي علامة خفية.</p>") +
      "<h2>الحركات والتشكيل</h2>" +
      (harRows ? "<table><tr><th>الحركة</th><th>الاسم</th><th>الكود</th><th>العدد</th></tr>" + harRows + "</table>" : "<p>لا توجد حركات في المستند.</p>") +
      "<p>إجمالي الحركات: <b>" + a.harakaTotal + "</b> — الحروف العربية: <b>" + a.arabicLetters +
      "</b> — الكثافة: <b>" + (s.density * 100).toFixed(1) + "%</b></p>" +
      (ctxItems ? "<h2>سياقات العلامات الخفية</h2><ol class='ctx'>" + ctxItems + "</ol>" : "") +
      "<div class='note'><b>تنبيه:</b> هذا الفحص استدلالي (Heuristic) ولا يُعد دليلاً قاطعاً على مصدر النص؛ " +
      "وجود الحركات طبيعي في المصاحف وكتب الشعر وكتب تعليم القراءة. استخدم التقرير كأداة مساعدة للمراجعة البشرية.</div>" +
      "</body></html>";
  }

  /* ----------------------------------------------------------
     تنزيل ملفات
     ---------------------------------------------------------- */
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const aEl = document.createElement("a");
    aEl.href = url;
    aEl.download = filename;
    document.body.appendChild(aEl);
    aEl.click();
    aEl.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ----------------------------------------------------------
     اختبار ذاتي: يبني مستند docx في الذاكرة وي checks خط الفحص كاملاً
     ---------------------------------------------------------- */
  async function runSelfTest() {
    const results = [];
    const check = (name, ok, extra) => results.push({ name, ok, extra: extra || "" });

    const ZWSP = "\u200B", RLM = "\u200F";
    const p1 = "نص" + ZWSP + "خفي" + RLM + "هنا";
    const p2 = "الْعَلَمُ نِعْمَةٌ وَالصَّبْرُ خَيْرٌ.";

    const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      '<w:p><w:r><w:t xml:space="preserve">' + p1 + '</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">' + p2 + '</w:t></w:r></w:p>' +
      '</w:body></w:document>';

    const ctXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>';

    const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';

    const zip = new JSZip();
    zip.file("[Content_Types].xml", ctXml);
    zip.file("_rels/.rels", relsXml);
    zip.file("word/document.xml", docXml);
    const blob = await zip.generateAsync({ type: "blob" });

    const { parts, fullText } = await extractDocxParts(blob);
    check("استخراج النص من docx", fullText.indexOf(p1) !== -1 && fullText.indexOf(p2) !== -1,
      "طول النص المستخرج: " + fullText.length);

    const analysis = analyzeParts(parts);
    const direct = ARABIC_AI.analyzeText(p1 + "\n" + p2);
    check("عدد العلامات الخفية", analysis.invisibleTotal === 2 && direct.invisibleTotal === 2,
      "متوقع 2 / فعلي " + analysis.invisibleTotal);
    check("عدد الحركات", analysis.harakaTotal === direct.harakaTotal,
      "متوقع " + direct.harakaTotal + " / فعلي " + analysis.harakaTotal);

    const score = ARABIC_AI.computeScore(analysis);
    check("حساب المؤشر", score.score < 100, "النتيجة: " + score.score);

    const cleaned = await buildCleanedDocx(zip, { stripHarakat: false });
    const re = await extractDocxParts(cleaned);
    const reAnalysis = analyzeParts(re.parts);
    check("النسخة المنظفة خالية من العلامات", reAnalysis.invisibleTotal === 0,
      "بقي " + reAnalysis.invisibleTotal);
    check("النسخة المنظفة حافظت على الحركات", reAnalysis.harakaTotal === analysis.harakaTotal,
      "الحركات: " + reAnalysis.harakaTotal);

    const cleanedHar = await buildCleanedDocx(zip, { stripHarakat: true });
    const reH = await extractDocxParts(cleanedHar);
    const reHA = analyzeParts(reH.parts);
    check("خيار إزالة الحركات يعمل", reHA.harakaTotal === 0 && reHA.invisibleTotal === 0,
      "حركات متبقية: " + reHA.harakaTotal);

    const passed = results.every(r => r.ok);
    return { passed, results };
  }

  return {
    SCAN_PART_RE, extractDocxParts, analyzeParts,
    cleanDocxXml, buildCleanedDocx, buildReportHtml, downloadBlob, runSelfTest
  };
})();
