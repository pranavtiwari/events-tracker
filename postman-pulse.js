/* ==========================================================================
   Postman Pulse — Live Google Sheet Sync & Broadsheet Intelligence Renderer
   ========================================================================== */

(function () {
  "use strict";

  const SHEET_ID = "1UjgqkNUpbaKR4rJoFtGwblOtlH7VqoKVMCM7YE4wnvQ";
  const XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
  const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
  const FALLBACK_URL = "data/postman-pulse-fallback.json";

  let historyData = [];
  let selectedDate = "";
  let activeSeries = "overall";
  let trendChart = null;

  const daySelect = document.getElementById("day-select");
  const reportSubtitle = document.getElementById("report-subtitle");
  const overallScoreEl = document.getElementById("overall-score");
  const overallDenomEl = document.getElementById("overall-denom");
  const scoreBadgesEl = document.getElementById("score-badges");
  const barPosEl = document.getElementById("bar-pos");
  const barNeuEl = document.getElementById("bar-neu");
  const barNegEl = document.getElementById("bar-neg");
  const mixLegendEl = document.getElementById("mix-legend");
  const channelBreakdownEl = document.getElementById("channel-breakdown");
  const doingWellEl = document.getElementById("doing-well-list");
  const doingPoorlyEl = document.getElementById("doing-poorly-list");
  const competitorListEl = document.getElementById("competitor-list");
  const mentionsListEl = document.getElementById("mentions-list");
  const mentionsCountLabelEl = document.getElementById("mentions-count-label");
  const trendFiltersEl = document.getElementById("trend-filters");
  const refreshBtn = document.getElementById("npRefreshBtn");

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatScore(val) {
    if (val === null || val === undefined || Number.isNaN(val)) return "—";
    return val > 0 ? "+" + val : String(val);
  }

  function scoreTone(val) {
    if (val === null || val === undefined || Number.isNaN(val)) return "muted";
    if (val > 10) return "pos";
    if (val < -10) return "neg";
    return "neu";
  }

  function parseNumber(val) {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "number") return Number.isNaN(val) ? null : Math.round(val * 10) / 10;
    const cleaned = String(val).trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : Math.round(n * 10) / 10;
  }

  function parseDateCell(val) {
    if (val === null || val === undefined || val === "") return "";
    if (val instanceof Date && !Number.isNaN(val.getTime())) {
      return val.toISOString().slice(0, 10);
    }
    const s = String(val).trim();
    // gviz Date(YYYY,M,D)
    const gvizMatch = s.match(/^Date\((\d+),(\d+),(\d+)/);
    if (gvizMatch) {
      const y = Number(gvizMatch[1]);
      const m = String(Number(gvizMatch[2]) + 1).padStart(2, "0");
      const d = String(Number(gvizMatch[3])).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // Excel serial date
    const serial = Number(s);
    if (!Number.isNaN(serial) && serial > 30000 && serial < 70000) {
      const epoch = Date.UTC(1899, 11, 30);
      const dt = new Date(epoch + Math.round(serial) * 86400000);
      return dt.toISOString().slice(0, 10);
    }
    return s;
  }

  function parseJsonList(val) {
    if (Array.isArray(val)) return val;
    if (!val || typeof val !== "string") return [];
    const trimmed = val.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function normalizeRecord(raw) {
    const date = parseDateCell(raw.date);
    if (!date) return null;
    return {
      date,
      overall_score: parseNumber(raw.overall_score),
      mentions_count: parseNumber(raw.mentions_count) ?? 0,
      confidence: String(raw.confidence || "low").trim().toLowerCase(),
      pos_pct: parseNumber(raw.pos_pct) ?? 0,
      neu_pct: parseNumber(raw.neu_pct) ?? 0,
      neg_pct: parseNumber(raw.neg_pct) ?? 0,
      news_blogs_score: parseNumber(raw.news_blogs_score),
      dev_communities_score: parseNumber(raw.dev_communities_score),
      review_sites_score: parseNumber(raw.review_sites_score),
      social_video_score: parseNumber(raw.social_video_score),
      insomnia_score: parseNumber(raw.insomnia_score),
      bruno_score: parseNumber(raw.bruno_score),
      hoppscotch_score: parseNumber(raw.hoppscotch_score),
      apidog_score: parseNumber(raw.apidog_score),
      doing_well: parseJsonList(raw.doing_well ?? raw.doing_well_json),
      doing_poorly: parseJsonList(raw.doing_poorly ?? raw.doing_poorly_json),
      mentions: parseJsonList(raw.mentions ?? raw.mentions_json),
    };
  }

  function setSyncState(state, message) {
    const pill = document.getElementById("npSyncPill");
    const text = document.getElementById("npSyncText");
    const timeEl = document.getElementById("npLastSynced");
    if (pill) {
      pill.classList.remove("is-loading", "is-live", "is-fallback");
      pill.classList.add(`is-${state}`);
    }
    if (text) text.textContent = message;
    if (timeEl && (state === "live" || state === "fallback")) {
      try {
        timeEl.textContent =
          "Updated " +
          new Intl.DateTimeFormat("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }).format(new Date());
      } catch {
        timeEl.textContent = "Updated " + new Date().toLocaleTimeString();
      }
    }
  }

  /* ------------------------------------------------------------------------
     Live Google Sheets Fetchers (XLSX -> gviz -> fallback JSON)
     ------------------------------------------------------------------------ */

  async function fetchFromXlsx() {
    if (typeof XLSX === "undefined") throw new Error("SheetJS unavailable");
    const res = await fetch(XLSX_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`XLSX HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
    const records = rows.map(normalizeRecord).filter(Boolean);
    if (!records.length) throw new Error("No rows in XLSX");
    records.sort((a, b) => a.date.localeCompare(b.date));
    return records;
  }

  async function fetchFromGviz() {
    const res = await fetch(GVIZ_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`gviz HTTP ${res.status}`);
    const text = await res.text();
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
    if (!match) throw new Error("Invalid gviz response");
    const payload = JSON.parse(match[1]);
    const cols = payload.table.cols.map((c) => (c.label || c.id || "").trim());
    const records = [];
    for (const row of payload.table.rows || []) {
      const obj = {};
      (row.c || []).forEach((cell, i) => {
        if (cols[i]) {
          obj[cols[i]] = cell ? (cell.v ?? cell.f ?? "") : "";
        }
      });
      const rec = normalizeRecord(obj);
      if (rec) records.push(rec);
    }
    if (!records.length) throw new Error("No rows in gviz");
    records.sort((a, b) => a.date.localeCompare(b.date));
    return records;
  }

  async function fetchFromFallback() {
    const res = await fetch(FALLBACK_URL);
    if (!res.ok) throw new Error(`Fallback HTTP ${res.status}`);
    const data = await res.json();
    const records = (Array.isArray(data) ? data : []).map(normalizeRecord).filter(Boolean);
    records.sort((a, b) => a.date.localeCompare(b.date));
    return records;
  }

  /* ------------------------------------------------------------------------
     Rendering Functions
     ------------------------------------------------------------------------ */

  function computeRollingAvg(values, windowSize) {
    const result = [];
    let seenNonNull = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i] !== null && values[i] !== undefined) {
        seenNonNull++;
      }
      if (i < 2 || seenNonNull < 2) {
        result.push(null);
        continue;
      }
      const start = Math.max(0, i - windowSize + 1);
      const slice = values.slice(start, i + 1).filter((v) => v !== null && v !== undefined);
      if (!slice.length) {
        result.push(null);
      } else {
        const avg = slice.reduce((acc, n) => acc + n, 0) / slice.length;
        result.push(Math.round(avg * 10) / 10);
      }
    }
    return result;
  }

  function populateDateDropdown() {
    daySelect.innerHTML = "";
    for (let i = historyData.length - 1; i >= 0; i--) {
      const item = historyData[i];
      const opt = document.createElement("option");
      opt.value = item.date;
      opt.textContent = item.date;
      if (item.date === selectedDate) opt.selected = true;
      daySelect.appendChild(opt);
    }
  }

  function renderTopRow(record, idx) {
    const mCount = record.mentions_count || 0;
    reportSubtitle.textContent = `Report for ${record.date} · ${mCount} ${mCount === 1 ? "mention" : "mentions"} scored`;

    if (record.overall_score === null || record.overall_score === undefined) {
      overallScoreEl.textContent = "No data";
      overallScoreEl.className = "pp-score-value neu";
      overallDenomEl.style.display = "none";
    } else {
      overallScoreEl.textContent = formatScore(record.overall_score);
      overallScoreEl.className = "pp-score-value " + scoreTone(record.overall_score);
      overallDenomEl.style.display = "inline";
    }

    let prevScore = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (historyData[i].overall_score !== null && historyData[i].overall_score !== undefined) {
        prevScore = historyData[i].overall_score;
        break;
      }
    }

    const priorScored = historyData
      .slice(Math.max(0, idx - 7), idx)
      .map((d) => d.overall_score)
      .filter((v) => v !== null && v !== undefined);
    const avg7 =
      priorScored.length > 0
        ? Math.round((priorScored.reduce((a, b) => a + b, 0) / priorScored.length) * 10) / 10
        : null;

    const badges = [];
    if (record.overall_score !== null && prevScore !== null) {
      const diff = Math.round((record.overall_score - prevScore) * 10) / 10;
      const cls = diff > 0 ? "delta-up" : diff < 0 ? "delta-down" : "";
      const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "•";
      badges.push(`<span class="pp-pill ${cls}">${arrow} ${Math.abs(diff)} vs previous period</span>`);
    } else {
      badges.push(`<span class="pp-pill">— vs previous period</span>`);
    }

    if (record.overall_score !== null && avg7 !== null) {
      const diffAvg = Math.round((record.overall_score - avg7) * 10) / 10;
      const cls = diffAvg > 0 ? "delta-up" : diffAvg < 0 ? "delta-down" : "";
      const arrow = diffAvg > 0 ? "▲" : diffAvg < 0 ? "▼" : "•";
      badges.push(`<span class="pp-pill ${cls}">${arrow} ${Math.abs(diffAvg)} vs 7-period avg</span>`);
    } else {
      badges.push(`<span class="pp-pill">— vs 7-period avg</span>`);
    }

    const conf = (record.confidence || "low").toLowerCase();
    badges.push(`<span class="pp-pill conf-${escapeHtml(conf)}">Confidence: ${escapeHtml(conf)}</span>`);
    scoreBadgesEl.innerHTML = badges.join("");

    // Mix of Mentions
    const pos = record.pos_pct || 0;
    const neu = record.neu_pct || 0;
    const neg = record.neg_pct || 0;
    barPosEl.style.width = pos + "%";
    barNeuEl.style.width = neu + "%";
    barNegEl.style.width = neg + "%";

    mixLegendEl.innerHTML = `
      <span class="pp-legend-item"><span class="pp-dot pos"></span>Positive ${pos}%</span>
      <span class="pp-legend-item"><span class="pp-dot neu"></span>Neutral ${neu}%</span>
      <span class="pp-legend-item"><span class="pp-dot neg"></span>Negative ${neg}%</span>
    `;

    const channels = [
      { label: "News & blogs", val: record.news_blogs_score },
      { label: "Dev communities", val: record.dev_communities_score },
      { label: "Review sites", val: record.review_sites_score },
      { label: "Social & video", val: record.social_video_score },
    ];

    channelBreakdownEl.innerHTML = channels
      .map(
        (ch) => `
      <div class="pp-channel-item">
        <span class="pp-channel-name" title="${escapeHtml(ch.label)}">${escapeHtml(ch.label)}</span>
        <span class="pp-channel-score ${scoreTone(ch.val)}">${formatScore(ch.val)}</span>
      </div>
    `
      )
      .join("");
  }

  function renderThemes(container, themes) {
    if (!themes || !themes.length) {
      container.innerHTML = '<p class="pp-empty">Nothing recorded for this date.</p>';
      return;
    }
    container.innerHTML = themes
      .map((t) => {
        const countLabel = `${t.count} ${t.count === 1 ? "mention" : "mentions"}`;
        const links = (t.sources || [])
          .map((s, i) => {
            const label = typeof s === "string" ? `Source ${i + 1}` : s.label || `Source ${i + 1}`;
            const url = typeof s === "string" ? s : s.url;
            return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
          })
          .join('<span class="bs-index-sep">·</span>');
        return `
        <div class="pp-theme-item">
          <div class="pp-theme-head">
            <span class="pp-theme-title">${escapeHtml(t.theme)}</span>
            <span class="pp-theme-count">${countLabel}</span>
          </div>
          <p class="pp-theme-summary">${escapeHtml(t.summary)}</p>
          ${links ? `<div class="pp-theme-sources">${links}</div>` : ""}
        </div>
      `;
      })
      .join("");
  }

  function renderCompetitors(record) {
    const items = [
      { name: "Postman", val: record.overall_score, isPostman: true },
      { name: "Insomnia", val: record.insomnia_score, isPostman: false },
      { name: "Bruno", val: record.bruno_score, isPostman: false },
      { name: "Hoppscotch", val: record.hoppscotch_score, isPostman: false },
      { name: "Apidog", val: record.apidog_score, isPostman: false },
    ];

    competitorListEl.innerHTML = items
      .map((item) => {
        const hasData = item.val !== null && item.val !== undefined;
        let barHtml = "";
        let scoreClass = "nodata";
        let scoreText = "No data";

        if (hasData) {
          const clamped = Math.max(-100, Math.min(100, item.val));
          const pct = Math.abs(clamped) / 2;
          const left = clamped >= 0 ? 50 : 50 - pct;
          const tone = clamped > 10 ? "pos" : clamped < -10 ? "neg" : "neu";
          const minVisualPct = clamped === 0 ? 1.2 : Math.max(pct, 1.5);
          const adjLeft = clamped === 0 ? 49.4 : left;
          barHtml = `<div class="pp-field-bar ${tone}" style="left:${adjLeft}%;width:${minVisualPct}%"></div>`;
          scoreClass = tone === "neu" ? "" : tone;
          scoreText = formatScore(item.val);
        }

        return `
        <div class="pp-field-row ${item.isPostman ? "is-postman" : ""}">
          <span class="pp-field-name">${escapeHtml(item.name)}</span>
          <div class="pp-field-track">
            <div class="pp-field-zero"></div>
            ${barHtml}
          </div>
          <span class="pp-field-score ${scoreClass}">${scoreText}</span>
        </div>
      `;
      })
      .join("");
  }

  function renderMentions(record) {
    const mentions = record.mentions || [];
    mentionsCountLabelEl.textContent = `${mentions.length} ${mentions.length === 1 ? "item" : "items"}`;
    if (!mentions.length) {
      mentionsListEl.innerHTML = '<p class="pp-empty">No mentions recorded for this date.</p>';
      return;
    }

    mentionsListEl.innerHTML = mentions
      .map((m) => {
        const tone = scoreTone(m.score);
        return `
        <div class="pp-mention-row">
          <span class="pp-mention-score ${tone}">${formatScore(m.score)}</span>
          <div class="pp-mention-body">
            <a class="pp-mention-title" href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.title)}</a>
            <div class="pp-mention-meta">${escapeHtml(m.meta || "")}</div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  function renderChart() {
    const canvas = document.getElementById("trend-chart");
    if (!canvas || typeof Chart === "undefined") return;
    const ctx = canvas.getContext("2d");
    const labels = historyData.map((d) => d.date);

    let datasets = [];

    if (activeSeries === "competitors") {
      const palette = [
        { key: "overall_score", label: "Postman", color: "#171614", width: 2.8 },
        { key: "insomnia_score", label: "Insomnia", color: "#6d28d9", width: 2 },
        { key: "bruno_score", label: "Bruno", color: "#9a5204", width: 2 },
        { key: "hoppscotch_score", label: "Hoppscotch", color: "#166534", width: 2 },
        { key: "apidog_score", label: "Apidog", color: "#1e40af", width: 2 },
      ];
      datasets = palette.map((p) => ({
        label: p.label,
        data: historyData.map((d) => d[p.key]),
        borderColor: p.color,
        backgroundColor: p.color,
        borderWidth: p.width,
        pointRadius: historyData.map((d) => (d.date === selectedDate ? 6 : 3.5)),
        pointHoverRadius: 6,
        spanGaps: false,
        tension: 0.25,
      }));
    } else {
      const keyMap = {
        overall: { field: "overall_score", label: "Overall score" },
        news_blogs: { field: "news_blogs_score", label: "News & blogs" },
        dev_communities: { field: "dev_communities_score", label: "Dev communities" },
        review_sites: { field: "review_sites_score", label: "Review sites" },
        social_video: { field: "social_video_score", label: "Social & video" },
      };
      const cfg = keyMap[activeSeries] || keyMap.overall;
      const rawValues = historyData.map((d) => d[cfg.field]);
      const rolling7 = computeRollingAvg(rawValues, 7);

      datasets = [
        {
          label: cfg.label,
          data: rawValues,
          borderColor: "#8c8577",
          backgroundColor: "#b5381b",
          borderWidth: 1.6,
          pointRadius: historyData.map((d) => (d.date === selectedDate ? 6.5 : 3.5)),
          pointBackgroundColor: historyData.map((d) => (d.date === selectedDate ? "#b5381b" : "#fcfbf8")),
          pointBorderColor: historyData.map((d) => (d.date === selectedDate ? "#b5381b" : "#171614")),
          pointBorderWidth: 2,
          pointHoverRadius: 6.5,
          spanGaps: false,
          tension: 0.2,
        },
        {
          label: "7-period rolling avg",
          data: rolling7,
          borderColor: "#171614",
          backgroundColor: "#171614",
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 4,
          spanGaps: true,
          tension: 0.3,
        },
      ];
    }

    if (trendChart) {
      trendChart.destroy();
    }

    trendChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: {
              usePointStyle: true,
              boxWidth: 8,
              padding: 16,
              color: "#423f39",
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
            },
          },
          tooltip: {
            backgroundColor: "#171614",
            titleFont: { family: "'JetBrains Mono', monospace", size: 12 },
            bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
            padding: 10,
            cornerRadius: 2,
            callbacks: {
              label: function (context) {
                const v = context.parsed.y;
                if (v === null || v === undefined) return context.dataset.label + ": No data";
                return context.dataset.label + ": " + (v > 0 ? "+" + v : v);
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: "#6f6a60",
              font: { family: "'JetBrains Mono', monospace", size: 11 },
            },
          },
          y: {
            min: -100,
            max: 100,
            ticks: {
              stepSize: 50,
              color: "#6f6a60",
              font: { family: "'JetBrains Mono', monospace", size: 11 },
              callback: (v) => (v > 0 ? "+" + v : v),
            },
            grid: {
              color: (c) => (c.tick && c.tick.value === 0 ? "#171614" : "#e3ddd0"),
              lineWidth: (c) => (c.tick && c.tick.value === 0 ? 1.5 : 1),
            },
          },
        },
      },
    });
  }

  function renderAll() {
    if (!historyData.length) return;
    if (!selectedDate || !historyData.some((d) => d.date === selectedDate)) {
      selectedDate = historyData[historyData.length - 1].date;
    }
    populateDateDropdown();
    const idx = historyData.findIndex((d) => d.date === selectedDate);
    const record = historyData[idx >= 0 ? idx : historyData.length - 1];
    renderTopRow(record, idx >= 0 ? idx : historyData.length - 1);
    renderThemes(doingWellEl, record.doing_well);
    renderThemes(doingPoorlyEl, record.doing_poorly);
    renderCompetitors(record);
    renderMentions(record);
    renderChart();
  }

  /* ------------------------------------------------------------------------
     Bootstrap & Live Sync Orchestration
     ------------------------------------------------------------------------ */

  async function loadData(forceLive) {
    setSyncState("loading", "Syncing live sheet…");
    if (refreshBtn) refreshBtn.disabled = true;

    // Instant first paint from fallback snapshot
    if (!historyData.length) {
      try {
        historyData = await fetchFromFallback();
        renderAll();
      } catch {
        // ignore; live fetch will handle
      }
    }

    if (forceLive) {
      try {
        let liveRecords = null;
        try {
          liveRecords = await fetchFromXlsx();
        } catch {
          liveRecords = await fetchFromGviz();
        }
        if (liveRecords && liveRecords.length) {
          const prevLatest = historyData.length ? historyData[historyData.length - 1].date : "";
          historyData = liveRecords;
          // Auto-advance if user was viewing the latest date
          if (!selectedDate || selectedDate === prevLatest) {
            selectedDate = historyData[historyData.length - 1].date;
          }
          renderAll();
          setSyncState("live", `Live · ${historyData.length} periods synced`);
          if (refreshBtn) refreshBtn.disabled = false;
          return;
        }
      } catch {
        // fall through to snapshot state
      }
    }

    setSyncState("fallback", `Snapshot · ${historyData.length} periods`);
    if (refreshBtn) refreshBtn.disabled = false;
  }

  daySelect.addEventListener("change", (e) => {
    selectedDate = e.target.value;
    renderAll();
  });

  trendFiltersEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".desk-pill");
    if (!btn) return;
    const series = btn.getAttribute("data-series");
    if (!series || series === activeSeries) return;
    activeSeries = series;
    trendFiltersEl.querySelectorAll(".desk-pill").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    renderChart();
  });

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => loadData(true));
  }

  if (window.Newspaper && window.Newspaper.hydrateDateline) {
    window.Newspaper.hydrateDateline();
  }
  loadData(true);
})();
