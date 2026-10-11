/* ============================================================
   ARABIC AI INTEGRITY CHECKER — UI Controller
   التحكم بالواجهة: الرفع، الفحص، عرض النتائج، التنزيلات
   ============================================================ */
"use strict";

(() => {
  const $ = id => document.getElementById(id);

  const esc = s => String(s).replace(/[&<>"']/g, m => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));

  const fmt = n => Number(n).toLocaleString("ar-EG");

  const state = {
    fileName: null,
    fileSize: 0,
    isDocx: false,
    zip: null,
    parts: [],
    fullText: "",
    analysis: null,
    score: null
  };

  const SEV_AR = { high: "خطورة عالية", medium: "خطورة متوسطة", low: "خطورة منخفضة" };
  const SEV_CLS = { high: "sev-high", medium: "sev-med", low: "sev-low" };
  const BAND_CLS = { good: "band-good", ok: "band-ok", warn: "band-warn", bad: "band-bad" };

  const PREVIEW_PARA_LIMIT = 200;
  let previewTruncated = false;

  /* ====================== حالة الفحص ====================== */

  function showStatus(msg) {
    $("scanStatus").hidden = false;
    $("statusText").textContent = msg;
  }
  function hideStatus() { $("scanStatus").hidden = true; }

  function showError(msg) {
    const box = $("errorBox");
    box.hidden = false;
    box.innerHTML = "<strong>تعذّر إكمال الفحص:</strong> " + esc(msg);
  }
  function clearError() { $("errorBox").hidden = true; $("errorBox").innerHTML = ""; }

  function resetResults() {
    $("results").hidden = true;
    state.analysis = null; state.score = null;
  }

  /* ====================== رفع الملفات ====================== */

  function wireDropzone() {
    const dz = $("dropzone");
    const input = $("fileInput");

    dz.addEventListener("click", e => { if (e.target.tagName !== "A") input.click(); });
    dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });

    input.addEventListener("change", () => {
      if (input.files && input.files[0]) handleFile(input.files[0]);
      input.value = "";
    });

    ["dragenter", "dragover"].forEach(ev =>
      dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach(ev =>
      dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("dragging"); }));
    dz.addEventListener("drop", e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }

  async function handleFile(file) {
    clearError();
    resetResults();

    const name = file.name || "";
    if (!/\.docx$/i.test(name)) {
      showError("الرجاء رفع ملف Word بصيغة .docx فقط (الصيغة القديمة .doc غير مدعومة — افتح الملف في Word واحفظه باسم docx).");
      return;
    }

    showStatus("جارٍ فتح الملف واستخراج النصوص…");
    try {
      const { zip, parts, fullText } = await DOCX_ENGINE.extractDocxParts(file);
      if (!fullText.trim()) {
        hideStatus();
        showError("تم فتح الملف لكنه لا يحتوي نصاً قابلاً للفحص (قد يكون صوراً ممسوحة ضوئياً فقط).");
        return;
      }
      Object.assign(state, {
        fileName: name, fileSize: file.size, isDocx: true,
        zip, parts, fullText
      });
      showStatus("جارٍ تحليل الأحرف والبحث عن العلامات…");
      await finishScan();
    } catch (err) {
      hideStatus();
      showError(err && err.message ? err.message : "خطأ غير متوقع أثناء قراءة الملف.");
    }
  }

  async function scanPastedText() {
    clearError();
    resetResults();
    const txt = $("pasteText").value;
    if (!txt.trim()) {
      showError("الصق نصاً أولاً قبل الفحص.");
      return;
    }
    showStatus("جارٍ تحليل النص الملصوق…");
    Object.assign(state, {
      fileName: null, fileSize: new Blob([txt]).size, isDocx: false,
      zip: null, fullText: txt,
      parts: [{ path: "(نص ملصوق)", label: "نص ملصوق", text: txt }]
    });
    await finishScan();
  }

  async function finishScan() {
    /* نمنح المتصفح فرصة لرسم شريط الحالة قبل الحساب */
    await new Promise(r => setTimeout(r, 30));
    state.analysis = DOCX_ENGINE.analyzeParts(state.parts);
    state.score = ARABIC_AI.computeScore(state.analysis);
    hideStatus();
    renderAll();
    $("results").hidden = false;
    $("actionsRow").classList.remove("actions-hidden");
    $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ====================== العرض ====================== */

  function renderAll() {
    renderVerdict();
    renderKPIs();
    renderInvisible();
    renderHarakat();
    renderParts();
    renderPreview();
    updateButtons();
  }

  function renderVerdict() {
    const s = state.score;
    const CIRC = 2 * Math.PI * 54; /* r=54 */
    const arc = $("scoreArc");
    arc.style.strokeDasharray = CIRC;
    arc.style.strokeDashoffset = CIRC * (1 - s.score / 100);
    arc.setAttribute("class", "ring-arc " + s.bandKey);

    $("scoreNum").textContent = fmt(s.score);
    $("bandText").textContent = s.band;
    $("bandText").className = "band-text " + BAND_CLS[s.bandKey];
    $("smallSampleNote").hidden = !s.smallSample;

    const ul = $("dedList");
    ul.innerHTML = "";
    if (!s.deductions.length) {
      const li = document.createElement("li");
      li.className = "ded ok";
      li.textContent = "لا خصومات — لم يُرصد أي مؤشر آلي في النص.";
      ul.appendChild(li);
    } else {
      s.deductions.forEach(d => {
        const li = document.createElement("li");
        li.className = "ded " + d.kind;
        const txt = document.createElement("span");
        txt.textContent = d.label;
        const pts = document.createElement("b");
        pts.className = "ded-pts";
        pts.textContent = "−" + d.points + " نقطة";
        li.appendChild(txt); li.appendChild(pts);
        ul.appendChild(li);
      });
    }
  }

  function renderKPIs() {
    const a = state.analysis, s = state.score;
    setKpi("kpiWords", fmt(a.wordsTotal));
    setKpi("kpiLetters", fmt(a.arabicLetters));
    setKpi("kpiInvisible", fmt(a.invisibleTotal), a.invisibleTotal > 0 ? "bad" : "good");
    setKpi("kpiHarakat", fmt(a.harakaTotal), a.harakaTotal > 0 ? "warn" : "good");
    setKpi("kpiDensity", (s.density * 100).toFixed(1) + "%", s.density >= 0.08 ? "warn" : "good");
    setKpi("kpiFullVoc", (s.fullVocRatio * 100).toFixed(0) + "%", s.fullVocRatio > 0.8 ? "warn" : "good");
  }
  function setKpi(id, val, tone) {
    const el = $(id);
    el.querySelector(".kpi-val").textContent = val;
    el.classList.remove("kpi-bad", "kpi-warn", "kpi-good");
    if (tone) el.classList.add("kpi-" + tone);
  }

  function renderInvisible() {
    const a = state.analysis;
    const tbody = $("invTableBody");
    const empty = $("invEmpty");
    const ctxWrap = $("ctxList");
    tbody.innerHTML = "";
    ctxWrap.innerHTML = "";

    const entries = [...a.invCounts.entries()].sort((x, y) =>
      (y[1] - x[1]) || (ARABIC_AI.INVISIBLE.find(c => c.cp === x[0]) ? 0 : 0));

    if (!entries.length) {
      empty.hidden = false;
      $("invTable").hidden = true;
      $("ctxSection").hidden = true;
      return;
    }
    empty.hidden = true;
    $("invTable").hidden = false;

    entries.forEach(([cp, n]) => {
      const info = ARABIC_AI.classify(cp) || {};
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "sym-badge";
      badge.textContent = info.short || "?";
      td1.appendChild(badge);

      const td2 = document.createElement("td");
      td2.innerHTML = "<b>" + esc(info.ar || info.name || "") + "</b><small>" + esc(info.name || "") + "</small>";

      const td3 = document.createElement("td");
      td3.className = "mono";
      td3.dir = "ltr";
      td3.textContent = ARABIC_AI.hex(cp);

      const td4 = document.createElement("td");
      td4.innerHTML = "<span class='" + SEV_CLS[info.sev || "medium"] + "'>" + SEV_AR[info.sev || "medium"] + "</span>";

      const td5 = document.createElement("td");
      td5.className = "count-cell";
      td5.textContent = fmt(n);

      tr.append(td1, td2, td3, td4, td5);
      tbody.appendChild(tr);
    });

    /* سياقات الظهور */
    const invOcc = a.occurrences.filter(o => o.kind === "inv");
    if (invOcc.length) {
      $("ctxSection").hidden = false;
      const shown = invOcc.slice(0, 40);
      shown.forEach(o => {
        const info = ARABIC_AI.classify(o.cp) || {};
        const li = document.createElement("li");
        li.className = "ctx-item";

        const chip = document.createElement("span");
        chip.className = "ctx-chip";
        chip.textContent = info.short || "?";

        const partTxt = o.part && o.part !== "النص" ? " — " + o.part : "";
        const meta = document.createElement("span");
        meta.className = "ctx-meta";
        meta.textContent = "فقرة " + fmt(o.para + 1) + partTxt;

        const ctx = document.createElement("div");
        ctx.className = "ctx-text";
        ctx.appendChild(document.createTextNode("… " + o.before));
        const mid = document.createElement("mark");
        mid.className = "ctx-mark";
        mid.textContent = "[" + (info.short || "?") + "]";
        ctx.appendChild(mid);
        ctx.appendChild(document.createTextNode(o.after + " …"));

        li.append(chip, meta, ctx);
        ctxWrap.appendChild(li);
      });
      if (invOcc.length > shown.length) {
        const more = document.createElement("li");
        more.className = "ctx-more";
        more.textContent = "… و" + fmt(invOcc.length - shown.length) + " موضعاً آخر (الكامل في التقرير القابل للتنزيل)";
        ctxWrap.appendChild(more);
      }
    } else {
      $("ctxSection").hidden = true;
    }
  }

  function renderHarakat() {
    const a = state.analysis, s = state.score;
    const chips = $("harChips");
    const extList = $("harExtList");
    const empty = $("harEmpty");
    chips.innerHTML = "";
    extList.innerHTML = "";

    const mainEntries = ARABIC_AI.HARAKAT_MAIN
      .map(h => ({ info: h, n: a.harCounts.get(h.cp) || 0 }))
      .filter(e => e.n > 0)
      .sort((x, y) => y.n - x.n);

    if (!mainEntries.length && a.harakaTotal === 0) {
      empty.hidden = false;
      $("harGrid").hidden = true;
      $("harStats").hidden = true;
      extList.hidden = true;
      return;
    }
    empty.hidden = true;
    $("harGrid").hidden = false;
    $("harStats").hidden = false;

    const maxN = Math.max(1, ...mainEntries.map(e => e.n));
    mainEntries.forEach(e => {
      const chip = document.createElement("div");
      chip.className = "har-chip";
      const ch = document.createElement("span");
      ch.className = "har-glyph";
      ch.textContent = e.info.ch;
      const name = document.createElement("span");
      name.className = "har-name";
      name.textContent = e.info.name;
      const n = document.createElement("span");
      n.className = "har-count";
      n.textContent = fmt(e.n);
      const bar = document.createElement("div");
      bar.className = "har-bar";
      const fill = document.createElement("div");
      fill.className = "har-bar-fill";
      fill.style.width = (e.n / maxN * 100).toFixed(1) + "%";
      bar.appendChild(fill);
      chip.append(ch, name, n, bar);
      chips.appendChild(chip);
    });

    /* الحركات الموسعة والقرآنية إن وُجدت */
    const extEntries = [...a.harCounts.entries()]
      .filter(([cp]) => {
        const info = ARABIC_AI.classify(cp);
        return info && info.group !== "main";
      })
      .sort((x, y) => y[1] - x[1]);

    if (extEntries.length) {
      extList.hidden = false;
      const title = document.createElement("h4");
      title.textContent = "علامات موسّعة وقرآنية مرصودة";
      extList.appendChild(title);
      extEntries.forEach(([cp, n]) => {
        const info = ARABIC_AI.classify(cp) || {};
        const li = document.createElement("li");
        const glyph = document.createElement("span");
        glyph.className = "har-glyph small";
        glyph.textContent = info.ch || "◦";
        const txt = document.createElement("span");
        txt.textContent = info.name || "";
        const code = document.createElement("span");
        code.className = "mono";
        code.dir = "ltr";
        code.textContent = ARABIC_AI.hex(cp) + " × " + fmt(n);
        li.append(glyph, txt, code);
        extList.appendChild(li);
      });
    } else {
      extList.hidden = true;
    }

    /* لوحة الكثافة */
    const pct = (s.density * 100).toFixed(1);
    $("densityVal").textContent = pct + "%";
    let interp;
    if (s.density < 0.02) interp = "تشكيل نادر — الطبيعة المعتادة للكتابة العربية اليومية (الحكم المباشر: طبيعي).";
    else if (s.density < 0.08) interp = "تشكيل خفيف وموزّع على مواضع ضرورية — نمط بشري مألوف (أسماء، مواضع لبس).";
    else if (s.density < 0.20) interp = "تشكيل متوسط — قد يكون نصاً تعليمياً أو دينياً، أو بداية تشكيل آلي كامل.";
    else if (s.density < 0.40) interp = "تشكيل مرتفع — النمط المعتاد للنصوص المولّدة آلياً؛ راجع السياق.";
    else interp = "تشكيل شبه كامل — أكثر الأنماط شيوعاً في مخرجات نماذج الذكاء الاصطناعي العربية.";
    $("densityInterp").textContent = interp;

    /* أكثر الفقرات تشكيلاً */
    const hot = [...a.paraStats].filter(p => p.harakat > 0).sort((x, y) => y.harakat - x.harakat).slice(0, 5);
    const hotList = $("paraHot");
    hotList.innerHTML = "";
    if (hot.length) {
      $("paraHotWrap").hidden = false;
      hot.forEach(p => {
        const li = document.createElement("li");
        const snip = document.createElement("span");
        snip.className = "hot-snip";
        snip.textContent = p.snippet + (p.snippet.length >= 90 ? "…" : "");
        const tag = document.createElement("span");
        tag.className = "hot-tag";
        tag.textContent = fmt(p.harakat) + " حركة" + (p.invisible ? " + " + fmt(p.invisible) + " علامة خفية!" : "");
        li.append(snip, tag);
        hotList.appendChild(li);
      });
    } else {
      $("paraHotWrap").hidden = true;
    }
  }

  function renderParts() {
    const tbl = $("partTable");
    if (!state.isDocx) {
      $("partSection").hidden = true;
      return;
    }
    $("partSection").hidden = false;
    const tbody = $("partTableBody");
    tbody.innerHTML = "";
    state.parts.forEach(pt => {
      const an = ARABIC_AI.analyzeText(pt.text);
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      td1.innerHTML = "<b>" + esc(pt.label) + "</b><small dir='ltr'>" + esc(pt.path) + "</small>";
      const td2 = document.createElement("td");
      td2.textContent = fmt(pt.text.length);
      const td3 = document.createElement("td");
      td3.textContent = an.invisibleTotal ? fmt(an.invisibleTotal) : "—";
      td3.className = an.invisibleTotal ? "cell-bad" : "";
      const td4 = document.createElement("td");
      td4.textContent = an.harakaTotal ? fmt(an.harakaTotal) : "—";
      tr.append(td1, td2, td3, td4);
      tbody.appendChild(tr);
    });
  }

  function renderPreview() {
    const box = $("previewBox");
    box.textContent = "";
    const paras = state.fullText.split(/\r?\n/).filter(p => p.trim());
    previewTruncated = paras.length > PREVIEW_PARA_LIMIT;
    const slice = paras.slice(0, PREVIEW_PARA_LIMIT);

    const frag = document.createDocumentFragment();
    slice.forEach(para => {
      const pEl = document.createElement("p");
      pEl.className = "pv-para";
      let buf = "";
      const flush = () => {
        if (buf) { pEl.appendChild(document.createTextNode(buf)); buf = ""; }
      };
      for (const ch of para) {
        const cp = ch.codePointAt(0);
        if (ARABIC_AI.isInvisible(cp)) {
          flush();
          const info = ARABIC_AI.classify(cp) || {};
          const tag = document.createElement("span");
          tag.className = "mk mk-inv";
          tag.textContent = info.short || "?";
          tag.title = (info.ar || info.name || "") + " (" + ARABIC_AI.hex(cp) + ")";
          pEl.appendChild(tag);
        } else if (ARABIC_AI.isHaraka(cp)) {
          flush();
          const info = ARABIC_AI.classify(cp) || {};
          const tag = document.createElement("span");
          tag.className = "mk mk-har";
          tag.textContent = ch;
          tag.title = info.name || "";
          pEl.appendChild(tag);
        } else {
          buf += ch;
        }
      }
      flush();
      frag.appendChild(pEl);
    });
    box.appendChild(frag);
    $("previewNote").hidden = !previewTruncated;
  }

  function updateButtons() {
    $("dlReport").disabled = false;
    $("dlClean").disabled = !state.isDocx;
    $("dlText").disabled = false;
  }

  /* ====================== التنزيلات ====================== */

  function baseName() {
    return state.fileName ? state.fileName.replace(/\.docx$/i, "") : "نص-ملصوق";
  }

  function wireActions() {
    $("dlReport").addEventListener("click", () => {
      if (!state.analysis) return;
      const html = DOCX_ENGINE.buildReportHtml(state);
      DOCX_ENGINE.downloadBlob("integrity-report-" + baseName() + ".html",
        new Blob([html], { type: "text/html;charset=utf-8" }));
    });

    $("dlClean").addEventListener("click", async () => {
      if (!state.isDocx || !state.zip) return;
      const btn = $("dlClean");
      btn.disabled = true;
      btn.textContent = "جارٍ بناء النسخة المنقّاة…";
      try {
        const opts = { stripHarakat: $("cleanHarakatChk").checked };
        const blob = await DOCX_ENGINE.buildCleanedDocx(state.zip, opts);
        DOCX_ENGINE.downloadBlob(baseName() + ".cleaned.docx", blob);
      } catch (e) {
        showError("تعذّر إنشاء النسخة المنقّاة: " + (e.message || e));
      } finally {
        btn.disabled = false;
        btn.textContent = "تنزيل نسخة Word منقّاة (docx)";
      }
    });

    $("dlText").addEventListener("click", () => {
      if (!state.analysis) return;
      const opts = { stripHarakat: $("cleanHarakatChk").checked };
      const txt = ARABIC_AI.cleanText(state.fullText, opts);
      DOCX_ENGINE.downloadBlob(baseName() + ".cleaned.txt",
        new Blob([txt], { type: "text/plain;charset=utf-8" }));
    });

    $("scanAgain").addEventListener("click", () => {
      resetResults();
      clearError();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ====================== التبويبات والاختبار الذاتي ====================== */

  function wireMisc() {
    $("pasteToggle").addEventListener("click", () => {
      const area = $("pasteArea");
      area.hidden = !area.hidden;
      $("pasteToggle").textContent = area.hidden
        ? "أو الصق نصاً مباشرة للفحص"
        : "إخفاء حقل اللصق";
      if (!area.hidden) $("pasteText").focus();
    });

    $("scanPasteBtn").addEventListener("click", scanPastedText);

    const st = $("selftestBtn");
    st.addEventListener("click", runSelfTestUI);

    if (new URLSearchParams(location.search).get("selftest") === "1") {
      setTimeout(runSelfTestUI, 300);
    }

    $("yearSpan").textContent = new Date().getFullYear();
  }

  async function runSelfTestUI() {
    const out = $("selftestOut");
    out.hidden = false;
    out.innerHTML = "<p>جارٍ تشغيل الاختبار الذاتي…</p>";
    try {
      const r = await DOCX_ENGINE.runSelfTest();
      const lis = r.results.map(x =>
        "<li class='" + (x.ok ? "pass" : "fail") + "'>" + esc(x.name) +
        (x.extra ? " <small>— " + esc(x.extra) + "</small>" : "") + "</li>").join("");
      out.innerHTML =
        "<h4>" + (r.passed ? "الاختبار الذاتي: ناجح" : "الاختبار الذاتي: فشل") + " (" +
        r.results.filter(x => x.ok).length + "/" + r.results.length + ")</h4><ul>" + lis + "</ul>";
    } catch (e) {
      out.innerHTML = "<p class='fail'>فشل الاختبار الذاتي: " + esc(e.message || e) + "</p>";
    }
  }

  /* ====================== جداول التغطية ====================== */

  function renderCoverage() {
    const inv = $("coverageInv");
    const rows = ARABIC_AI.INVISIBLE.map(c =>
      "<tr>" +
      "<td><span class='sym-badge'>" + esc(c.short) + "</span></td>" +
      "<td class='mono' dir='ltr'>" + ARABIC_AI.hex(c.cp) + "</td>" +
      "<td>" + esc(c.ar || "") + "</td>" +
      "<td dir='ltr' class='mono'>" + esc(c.name) + "</td>" +
      "<td><span class='" + SEV_CLS[c.sev] + "'>" + SEV_AR[c.sev] + "</span></td>" +
      "</tr>").join("");
    inv.innerHTML =
      "<table class='data-table'><thead><tr><th>الرمز</th><th>الكود</th><th>الاسم العربي</th><th>الاسم التقني</th><th>التقييم</th></tr></thead><tbody>" +
      rows + "</tbody></table>";

    const har = $("coverageHar");
    const harRows = ARABIC_AI.HARAKAT_MAIN.concat(ARABIC_AI.HARAKAT_EXT).map(h =>
      "<tr>" +
      "<td class='har-cell'>" + (h.ch || "◦") + "</td>" +
      "<td class='mono' dir='ltr'>" + ARABIC_AI.hex(h.cp) + "</td>" +
      "<td>" + esc(h.name) + "</td>" +
      "<td dir='ltr' class='mono'>" + esc(h.en || "") + "</td>" +
      "<td>" + (h.group === "main" ? "أساسية" : "موسّعة") + "</td>" +
      "</tr>").join("");
    const rangeRows = ARABIC_AI.HARAKAT_RANGES.map(r =>
      "<tr>" +
      "<td class='har-cell'>…</td>" +
      "<td class='mono' dir='ltr'>" + ARABIC_AI.hex(r.from) + " – " + ARABIC_AI.hex(r.to) + "</td>" +
      "<td colspan='3'>" + esc(r.name) + "</td>" +
      "</tr>").join("");
    har.innerHTML =
      "<table class='data-table'><thead><tr><th>الحركة</th><th>الكود</th><th>الاسم</th><th>الاسم الإنجليزي</th><th>الفئة</th></tr></thead><tbody>" +
      harRows + rangeRows + "</tbody></table>";
  }

  /* ====================== الإقلاع ====================== */

  document.addEventListener("DOMContentLoaded", () => {
    wireDropzone();
    wireActions();
    wireMisc();
    renderCoverage();
    if (typeof JSZip === "undefined") {
      $("cdnWarn").hidden = false;
    }
  });
})();
