/* ==========================================================================
   The Primegraph Chronicle — Shared Live-Sync & Editorial Rendering Engine
   ========================================================================== */

(function () {
  "use strict";

  const DRIVE_FOLDER_URL =
    "https://drive.google.com/drive/folders/1cVHSyWRqsO2JVQhBGjZRvfGex4yH4EVy?usp=sharing";

  const DESKS = {
    biscope: {
      slug: "biscope",
      name: "Biscope",
      kicker: "WORLD & MORNING DISPATCH",
      page: "biscope.html",
      docId: "1ZjIHclb4JER3OD-4q7EZCxwrLN-YeCSRXax2mvNHBSg",
      fallback: "data/biscope.md",
      sourceUrl:
        "https://docs.google.com/document/d/1ZjIHclb4JER3OD-4q7EZCxwrLN-YeCSRXax2mvNHBSg/edit",
    },
    portfolio: {
      slug: "portfolio",
      name: "Portfolio Advice",
      kicker: "MARKETS & WEALTH DESK",
      page: "portfolio.html",
      docId: "1XunqS69487bkUNgWPVMiPVTXZ55n_NbJ12xFJIq632w",
      fallback: "data/portfolio-advice.md",
      sourceUrl:
        "https://docs.google.com/document/d/1XunqS69487bkUNgWPVMiPVTXZ55n_NbJ12xFJIq632w/edit",
    },
    "ai-research": {
      slug: "ai-research",
      name: "AI Research",
      kicker: "SCIENCE & AI DESK",
      page: "ai-research.html",
      docId: "1YN2rJCoJDRrADe9JJH5s4Qk0UjhN2JUgN6leJQnCFlM",
      fallback: "data/ai-research.md",
      sourceUrl:
        "https://docs.google.com/document/d/1YN2rJCoJDRrADe9JJH5s4Qk0UjhN2JUgN6leJQnCFlM/edit",
    },
    health: {
      slug: "health",
      name: "Health & Longevity",
      kicker: "VITALITY & SCIENCE DESK",
      page: "health.html",
      docId: "1nh3z0ZE2rxOr_Pu9zVaWA9ZD6oymBOv-LymugAksQJo",
      fallback: "data/health-and-longevity.md",
      sourceUrl:
        "https://docs.google.com/document/d/1nh3z0ZE2rxOr_Pu9zVaWA9ZD6oymBOv-LymugAksQJo/edit",
    },
    events: {
      slug: "events",
      name: "Bengaluru Events",
      kicker: "CITY CULTURE & LISTINGS",
      page: "events.html",
      sheetId: "1bD7iUv2YTf8aKaoOxntbqucqKP9RN7t825NWB8aTc0Q",
      fallback: "data/fallback-events.json",
      sourceUrl:
        "https://docs.google.com/spreadsheets/d/1bD7iUv2YTf8aKaoOxntbqucqKP9RN7t825NWB8aTc0Q/edit?gid=0#gid=0",
    },
  };

  /* ------------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------------ */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function unescapeGdocMarkdown(str) {
    // Google Docs Markdown export escapes punctuation like \. \- \+ \$ \& \| \( \) \[ \] \~ \= \! \< \>
    return String(str).replace(/\\([\\`*_{}[\]()#+\-.!|$&~=<>])/g, "$1");
  }

  function stripMarkdown(str) {
    return unescapeGdocMarkdown(str)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#+\s*/, "")
      .trim();
  }

  function slugify(text) {
    return stripMarkdown(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "section";
  }

  function formatTimeNow() {
    try {
      return new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date());
    } catch {
      return new Date().toLocaleTimeString();
    }
  }

  function formatTodayDateline() {
    try {
      return new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date());
    } catch {
      return new Date().toDateString();
    }
  }

  /* ------------------------------------------------------------------------
     Google Docs Markdown -> Clean Editorial HTML Parser
     ------------------------------------------------------------------------ */

  function renderInline(rawText) {
    // Protect inline code spans first
    const codeTokens = [];
    let text = rawText.replace(/`([^`]+)`/g, (_, code) => {
      const idx = codeTokens.length;
      codeTokens.push("<code>" + escapeHtml(unescapeGdocMarkdown(code)) + "</code>");
      return "\u0000CODE" + idx + "\u0000";
    });

    // Protect markdown links [label](url)
    const linkTokens = [];
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      const idx = linkTokens.length;
      const renderedLabel = renderEmphasis(escapeHtml(unescapeGdocMarkdown(label)));
      const safeUrl = escapeHtml(url);
      linkTokens.push(
        `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${renderedLabel}</a>`
      );
      return "\u0000LINK" + idx + "\u0000";
    });

    // Escape remaining HTML, unescape Google Docs backslashes, apply emphasis
    text = escapeHtml(unescapeGdocMarkdown(text));
    text = renderEmphasis(text);

    // Restore links and code
    text = text.replace(/\u0000LINK(\d+)\u0000/g, (_, i) => linkTokens[Number(i)]);
    text = text.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => codeTokens[Number(i)]);

    return text;
  }

  function renderEmphasis(text) {
    // Bold (**text**)
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // Italic (*text*)
    text = text.replace(/(^|[\s(—–\[])\*([^*\n]+)\*(?=$|[\s).,;:!?—–\]])/g, "$1<em>$2</em>");
    return text;
  }

  function splitTableRow(line) {
    let trimmed = line.trim();
    if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
    if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
    // Split on unescaped pipes
    const cells = [];
    let current = "";
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
        current += "|";
        i++;
      } else if (trimmed[i] === "|") {
        cells.push(current.trim());
        current = "";
      } else {
        current += trimmed[i];
      }
    }
    cells.push(current.trim());
    return cells;
  }

  function isTableSeparator(line) {
    const trimmed = line.trim();
    if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
    return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(trimmed);
  }

  function parseMarkdown(md) {
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    const seenIds = new Map();
    let i = 0;

    function uniqueId(base) {
      const count = seenIds.get(base) || 0;
      seenIds.set(base, count + 1);
      return count === 0 ? base : `${base}-${count + 1}`;
    }

    while (i < lines.length) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // Blank line
      if (!trimmed) {
        i++;
        continue;
      }

      // Stray Google Docs single-cell divider like \|---\| or |---|
      if (/^\\?\|-{3,}\\?\|$/.test(trimmed)) {
        out.push("<hr />");
        i++;
        continue;
      }

      // Horizontal rule
      if (/^[-*_]{3,}$/.test(trimmed)) {
        out.push("<hr />");
        i++;
        continue;
      }

      // Headings (# to ####)
      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const content = headingMatch[2].trim();
        const id = uniqueId(slugify(content));
        out.push(`<h${level} id="${id}">${renderInline(content)}</h${level}>`);
        i++;
        continue;
      }

      // GFM Table
      if (
        trimmed.startsWith("|") &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1])
      ) {
        const headers = splitTableRow(trimmed);
        i += 2; // skip header & separator
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          rows.push(splitTableRow(lines[i]));
          i++;
        }
        let tableHtml = '<div class="np-table-wrap"><table class="np-table"><thead><tr>';
        for (const h of headers) {
          tableHtml += `<th>${renderInline(h)}</th>`;
        }
        tableHtml += "</tr></thead><tbody>";
        for (const row of rows) {
          tableHtml += "<tr>";
          for (let c = 0; c < headers.length; c++) {
            tableHtml += `<td>${renderInline(row[c] || "")}</td>`;
          }
          tableHtml += "</tr>";
        }
        tableHtml += "</tbody></table></div>";
        out.push(tableHtml);
        continue;
      }

      // Unordered or ordered list (supports 1 level of nested sub-items)
      if (/^(\s*)([*\-+]|\d+\\?\.)\s+/.test(rawLine)) {
        const listResult = parseList(lines, i);
        out.push(listResult.html);
        i = listResult.nextIndex;
        continue;
      }

      // Paragraph (collect consecutive non-special lines)
      const paraLines = [];
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();
        if (
          !t ||
          /^#{1,4}\s+/.test(t) ||
          /^[-*_]{3,}$/.test(t) ||
          /^\\?\|-{3,}\\?\|$/.test(t) ||
          (t.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) ||
          /^(\s*)([*\-+]|\d+\\?\.)\s+/.test(l)
        ) {
          break;
        }
        paraLines.push(t);
        i++;
      }
      if (paraLines.length) {
        out.push(`<p>${renderInline(paraLines.join(" "))}</p>`);
      }
    }

    return out.join("\n");
  }

  function parseList(lines, startIndex) {
    const firstMatch = lines[startIndex].match(/^(\s*)([*\-+]|\d+\\?\.)\s+(.*)$/);
    const baseIndent = firstMatch[1].length;
    const isOrdered = /^\d+/.test(firstMatch[2]);
    const tag = isOrdered ? "ol" : "ul";

    let html = `<${tag}>`;
    let i = startIndex;

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        // Peek ahead: if next non-empty line is a list item at >= baseIndent, keep going
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length) {
          const nextM = lines[j].match(/^(\s*)([*\-+]|\d+\\?\.)\s+/);
          if (nextM && nextM[1].length >= baseIndent) {
            const nextIsOrdered = /^\d+/.test(nextM[2]);
            if (nextM[1].length > baseIndent || nextIsOrdered === isOrdered) {
              i = j;
              continue;
            }
          }
        }
        break;
      }

      const match = line.match(/^(\s*)([*\-+]|\d+\\?\.)\s+(.*)$/);
      if (!match) break;

      const indent = match[1].length;
      const itemOrdered = /^\d+/.test(match[2]);

      if (indent < baseIndent) break;
      if (indent === baseIndent && itemOrdered !== isOrdered) break;

      if (indent > baseIndent) {
        // Nested list attached to previous <li>
        const nested = parseList(lines, i);
        if (html.endsWith("</li>")) {
          html = html.slice(0, -5) + nested.html + "</li>";
        } else {
          html += nested.html;
        }
        i = nested.nextIndex;
        continue;
      }

      html += `<li>${renderInline(match[3].trim())}</li>`;
      i++;
    }

    html += `</${tag}>`;
    return { html, nextIndex: i };
  }

  /* ------------------------------------------------------------------------
     Live Google Doc Fetcher (with Local Snapshot Fallback)
     ------------------------------------------------------------------------ */

  async function fetchDocMarkdown(desk, { forceLive = true } = {}) {
    const liveUrl = `https://docs.google.com/document/d/${desk.docId}/export?format=md`;

    if (forceLive) {
      try {
        const res = await fetch(liveUrl, { cache: "no-store" });
        if (res.ok) {
          const text = await res.text();
          if (text && text.trim().length > 40) {
            return { markdown: text, source: "live" };
          }
        }
      } catch {
        // Fall through to local fallback
      }
    }

    const fallbackRes = await fetch(desk.fallback);
    if (!fallbackRes.ok) {
      throw new Error(`Unable to load ${desk.name}`);
    }
    return { markdown: await fallbackRes.text(), source: "fallback" };
  }

  /* ------------------------------------------------------------------------
     TOC Builder
     ------------------------------------------------------------------------ */

  function buildToc(articleEl, tocListEl, headingSelector = "h1, h2, h3") {
    if (!tocListEl) return;
    const headings = Array.from(articleEl.querySelectorAll(headingSelector));
    if (!headings.length) {
      tocListEl.innerHTML = `<li class="toc-empty">No sections detected</li>`;
      return;
    }

    tocListEl.innerHTML = headings
      .map((h) => {
        const level = Number(h.tagName.slice(1));
        const isSub = level >= 3 || (headingSelector === "h1, h2" && level === 2);
        const label = h.textContent.trim();
        return `<li class="${isSub ? "toc-sub" : ""}"><a href="#${h.id}">${escapeHtml(label)}</a></li>`;
      })
      .join("");
  }

  /* ------------------------------------------------------------------------
     Desk-Specific Enhancers
     ------------------------------------------------------------------------ */

  function enhancePortfolioArticle(articleEl, toolbarEl) {
    const tables = articleEl.querySelectorAll("table.np-table");
    tables.forEach((table) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
        th.textContent.trim().toLowerCase()
      );
      const isDecisionTable =
        headers.includes("ticker") && headers.includes("action");
      if (!isDecisionTable) return;

      const tickerIdx = headers.indexOf("ticker");
      const dayIdx = headers.indexOf("1 day %");
      const slDeltaIdx = headers.indexOf("sl delta");
      const actionIdx = headers.indexOf("action");

      // Right-align numeric columns
      table.querySelectorAll("thead th").forEach((th, idx) => {
        if (idx !== tickerIdx && idx !== actionIdx) {
          th.classList.add("num");
        }
      });

      const actionCounts = { all: 0, SL: 0, Acc: 0, PB: 0, OK: 0 };

      table.querySelectorAll("tbody tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        actionCounts.all++;

        cells.forEach((td, idx) => {
          const raw = td.textContent.trim();
          if (idx === tickerIdx) {
            td.classList.add("ticker-cell");
          } else if (idx === actionIdx) {
            const key = raw.toUpperCase();
            tr.dataset.action = key;
            if (key === "SL") actionCounts.SL++;
            else if (key === "ACC") actionCounts.Acc++;
            else if (key === "PB") actionCounts.PB++;
            else if (key === "OK") actionCounts.OK++;

            const cls =
              key === "ACC"
                ? "action-acc"
                : key === "SL"
                ? "action-sl"
                : key === "PB"
                ? "action-pb"
                : "action-ok";
            td.innerHTML = `<span class="action-badge ${cls}">${escapeHtml(raw)}</span>`;
          } else {
            td.classList.add("num");
            if (idx === dayIdx || idx === slDeltaIdx) {
              const num = parseFloat(raw.replace(/[^\d.-]/g, ""));
              if (!Number.isNaN(num)) {
                if (num > 0) td.classList.add("val-pos");
                else if (num < 0) td.classList.add("val-neg");
              }
            }
          }
        });
      });

      // Render filter pills in toolbar
      if (toolbarEl) {
        toolbarEl.classList.remove("hidden");
        toolbarEl.innerHTML = `
          <div class="fp-section-label">Filter Decision Table</div>
          <div class="desk-pills" role="group" aria-label="Filter holdings by action">
            <button type="button" class="desk-pill active" data-action-filter="ALL">All (${actionCounts.all})</button>
            <button type="button" class="desk-pill" data-action-filter="SL">SL Alert (${actionCounts.SL})</button>
            <button type="button" class="desk-pill" data-action-filter="ACC">Accumulate (${actionCounts.Acc})</button>
            <button type="button" class="desk-pill" data-action-filter="PB">Profit Book (${actionCounts.PB})</button>
            <button type="button" class="desk-pill" data-action-filter="OK">OK (${actionCounts.OK})</button>
          </div>
        `;
        toolbarEl.querySelectorAll("[data-action-filter]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const chosen = btn.dataset.actionFilter;
            toolbarEl
              .querySelectorAll("[data-action-filter]")
              .forEach((b) => b.classList.toggle("active", b === btn));
            table.querySelectorAll("tbody tr").forEach((tr) => {
              const match = chosen === "ALL" || tr.dataset.action === chosen;
              tr.classList.toggle("hidden", !match);
            });
          });
        });
      }
    });
  }

  function enhanceAiResearchArticle(articleEl, toolbarEl) {
    // Group each H2 item (and its following siblings until next H1/H2/HR) into .research-entry
    const children = Array.from(articleEl.children);
    let currentPart = "papers";
    let idx = 0;

    while (idx < children.length) {
      const el = children[idx];
      if (el.tagName === "H1") {
        const txt = el.textContent.toLowerCase();
        if (txt.includes("part 2") || txt.includes("article") || txt.includes("essay")) {
          currentPart = "essays";
        } else if (txt.includes("part 1") || txt.includes("paper")) {
          currentPart = "papers";
        }
        el.dataset.partHeading = currentPart;
        idx++;
        continue;
      }

      if (el.tagName === "H2") {
        const wrapper = document.createElement("section");
        wrapper.className = "research-entry";
        wrapper.dataset.part = currentPart;
        el.parentNode.insertBefore(wrapper, el);
        wrapper.appendChild(el);
        idx++;
        while (
          idx < children.length &&
          children[idx].tagName !== "H1" &&
          children[idx].tagName !== "H2"
        ) {
          wrapper.appendChild(children[idx]);
          idx++;
        }
        continue;
      }
      idx++;
    }

    if (!toolbarEl) return;
    const entries = Array.from(articleEl.querySelectorAll(".research-entry"));
    const papersCount = entries.filter((e) => e.dataset.part === "papers").length;
    const essaysCount = entries.filter((e) => e.dataset.part === "essays").length;

    toolbarEl.classList.remove("hidden");
    toolbarEl.innerHTML = `
      <input type="search" id="researchSearchInput" class="desk-search" placeholder="Filter papers, authors, topics (e.g. MCP, spatial, interpretability)…" autocomplete="off" />
      <div class="desk-pills" role="group" aria-label="Filter by section">
        <button type="button" class="desk-pill active" data-part-filter="all">All (${entries.length})</button>
        <button type="button" class="desk-pill" data-part-filter="papers">Research Papers (${papersCount})</button>
        <button type="button" class="desk-pill" data-part-filter="essays">Long-Form Essays (${essaysCount})</button>
      </div>
    `;

    let activePart = "all";
    let query = "";

    function applyFilter() {
      const q = query.trim().toLowerCase();
      entries.forEach((entry) => {
        const partOk = activePart === "all" || entry.dataset.part === activePart;
        const textOk = !q || entry.textContent.toLowerCase().includes(q);
        entry.classList.toggle("is-filtered-out", !(partOk && textOk));
      });
    }

    toolbarEl.querySelector("#researchSearchInput").addEventListener("input", (e) => {
      query = e.target.value;
      applyFilter();
    });

    toolbarEl.querySelectorAll("[data-part-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activePart = btn.dataset.partFilter;
        toolbarEl
          .querySelectorAll("[data-part-filter]")
          .forEach((b) => b.classList.toggle("active", b === btn));
        applyFilter();
      });
    });
  }

  /* ------------------------------------------------------------------------
     Sync Status Helper
     ------------------------------------------------------------------------ */

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
      timeEl.textContent = `Updated ${formatTimeNow()}`;
    }
  }

  function hydrateDateline() {
    const el = document.getElementById("npEditionDate");
    if (el) el.textContent = formatTodayDateline();
  }

  /* ------------------------------------------------------------------------
     Document Desk Page Controller
     ------------------------------------------------------------------------ */

  async function initDocPage(slug) {
    hydrateDateline();
    const desk = DESKS[slug];
    if (!desk) return;

    const articleEl = document.getElementById("editorialArticle");
    const tocListEl = document.getElementById("editorialTocList");
    const toolbarEl = document.getElementById("deskToolbar");
    const refreshBtn = document.getElementById("npRefreshBtn");

    function renderMarkdownContent(md) {
      articleEl.innerHTML = parseMarkdown(md);
      const tocSelector =
        slug === "ai-research"
          ? "h1, h2"
          : slug === "health"
          ? "h1, h2"
          : slug === "portfolio"
          ? "h1"
          : "h3, h4";
      buildToc(articleEl, tocListEl, tocSelector);

      if (slug === "portfolio") {
        enhancePortfolioArticle(articleEl, toolbarEl);
      } else if (slug === "ai-research") {
        enhanceAiResearchArticle(articleEl, toolbarEl);
      }
    }

    async function loadDesk(forceLive) {
      setSyncState("loading", "Syncing live edition…");
      if (refreshBtn) refreshBtn.disabled = true;

      // Fast first paint from fallback snapshot on initial load
      if (!articleEl.dataset.rendered) {
        try {
          const snap = await fetchDocMarkdown(desk, { forceLive: false });
          renderMarkdownContent(snap.markdown);
          articleEl.dataset.rendered = "1";
        } catch {
          // ignore; live fetch will handle
        }
      }

      try {
        const result = await fetchDocMarkdown(desk, { forceLive });
        renderMarkdownContent(result.markdown);
        articleEl.dataset.rendered = "1";
        if (result.source === "live") {
          setSyncState("live", "Live · Google Docs");
        } else {
          setSyncState("fallback", "Snapshot edition");
        }
      } catch (err) {
        setSyncState("fallback", "Offline snapshot");
        if (!articleEl.dataset.rendered) {
          articleEl.innerHTML = `<p>Could not load ${escapeHtml(desk.name)}. <a href="${desk.sourceUrl}" target="_blank" rel="noopener noreferrer">Open source document directly</a>.</p>`;
        }
      } finally {
        if (refreshBtn) refreshBtn.disabled = false;
      }
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => loadDesk(true));
    }

    loadDesk(true);
  }

  /* ------------------------------------------------------------------------
     Front Page (Homepage) Live Summary Controller
     ------------------------------------------------------------------------ */

  function extractBiscopeSummary(md) {
    const lines = md.split("\n");
    const dateLine =
      lines.find((l) => /^\*\*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i.test(l.trim())) ||
      "";
    const weatherLine = lines.find((l) => /Local Weather/i.test(l)) || "";
    const globalLine = lines.find((l) => /Global Overview/i.test(l)) || "";
    const leadHeadingLine = lines.find((l) => /^####\s+Lead Story/i.test(l.trim())) || "";

    // Find paragraph right after Lead Story heading
    let leadPara = "";
    const leadIdx = lines.findIndex((l) => /^####\s+Lead Story/i.test(l.trim()));
    if (leadIdx !== -1) {
      for (let i = leadIdx + 1; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t && !t.startsWith("*") && !t.startsWith("#")) {
          leadPara = stripMarkdown(t);
          break;
        }
      }
    }

    // Grab top 3 Quick Hits bullets
    const quickIdx = lines.findIndex((l) => /Quick Hits/i.test(l));
    const quickHits = [];
    if (quickIdx !== -1) {
      for (let i = quickIdx + 1; i < lines.length && quickHits.length < 3; i++) {
        const t = lines[i].trim();
        if (t.startsWith("###")) break;
        if (t.startsWith("* ")) {
          const clean = stripMarkdown(t.slice(2));
          const colon = clean.indexOf(":");
          if (colon > 0 && colon < 45) {
            quickHits.push({
              topic: clean.slice(0, colon),
              body: clean.slice(colon + 1).trim().slice(0, 170) + "…",
            });
          } else {
            quickHits.push({ topic: "Dispatch", body: clean.slice(0, 170) + "…" });
          }
        }
      }
    }

    return {
      date: stripMarkdown(dateLine),
      weather: stripMarkdown(weatherLine).replace(/^[-*]\s*Local Weather:\s*/i, ""),
      headline:
        stripMarkdown(leadHeadingLine).replace(/^Lead Story:\s*/i, "") ||
        "Daily World & Morning Briefing",
      lead: leadPara || stripMarkdown(globalLine).replace(/^[-*]\s*Global Overview:\s*/i, ""),
      quickHits,
    };
  }

  function extractPortfolioSummary(md) {
    const lines = md.split("\n");
    const titleLine = lines.find((l) => /^#\s+.*Portfolio Advice/i.test(l.trim())) || "";
    const gapLine = lines.find((l) => /Gap-Up|Nifty 50/i.test(l) && l.trim().startsWith("*")) || "";
    const sipLine = lines.find((l) => /SIP Posture|SIP Guidance/i.test(l)) || "";

    const actions = [];
    const actIdx = lines.findIndex((l) => /Priority Buy\/Sell Actions/i.test(l));
    if (actIdx !== -1) {
      for (let i = actIdx + 1; i < lines.length && actions.length < 3; i++) {
        const t = lines[i].trim();
        if (t.startsWith("#")) break;
        if (/^\d+\.\s+/.test(t)) {
          const clean = stripMarkdown(t.replace(/^\d+\.\s+/, ""));
          const colon = clean.indexOf(":");
          actions.push({
            title: colon > 0 ? clean.slice(0, colon) : "Action",
            detail: colon > 0 ? clean.slice(colon + 1).trim().slice(0, 130) + "…" : clean,
          });
        }
      }
    }

    // Extract Nifty figure & SIP stance if present
    const cleanGap = stripMarkdown(gapLine);
    const niftyPctMatch = cleanGap.match(/Nifty 50[^%]*?([+-]?\d+(?:\.\d+)?%)/i);
    const niftyNote = niftyPctMatch
      ? `Nifty 50 ${niftyPctMatch[1]}`
      : "Indian Equities Brief";
    const sipMatch = stripMarkdown(sipLine).match(/(HOLD\s*\/\s*PAUSE SIP|RESUME SIP|DEPLOY|PAUSE)/i);

    return {
      edition: stripMarkdown(titleLine).replace(/^Portfolio Advice\s*[—–-]\s*/i, ""),
      niftyNote,
      sipStance: sipMatch ? sipMatch[0] : "See Desk",
      summary: stripMarkdown(gapLine).replace(/^[-*]\s*[^:]+:\s*/, ""),
      actions,
    };
  }

  function extractAiSummary(md) {
    const lines = md.split("\n");
    const titleLine = lines.find((l) => /^#\s+/.test(l.trim())) || "";
    const h2s = lines
      .filter((l) => /^##\s+/.test(l.trim()))
      .map((l) => stripMarkdown(l).replace(/^\d+\.\s*/, ""));

    const part2Idx = lines.findIndex((l) => /^#\s+.*Part 2/i.test(l.trim()));
    let paperCount = h2s.length;
    let essayCount = 0;
    if (part2Idx !== -1) {
      paperCount = lines.slice(0, part2Idx).filter((l) => /^##\s+/.test(l.trim())).length;
      essayCount = lines.slice(part2Idx).filter((l) => /^##\s+/.test(l.trim())).length;
    }

    return {
      edition: stripMarkdown(titleLine).replace(/^Weekly AI Research[^:]*:\s*/i, ""),
      paperCount,
      essayCount,
      leadPaper: h2s[0] || "Weekly AI Research Papers",
      highlights: h2s.slice(0, 3),
    };
  }

  function extractHealthSummary(md) {
    const lines = md.split("\n");
    const editionLine = lines.find((l) => /Edition Date:/i.test(l)) || "";
    const articles = lines
      .filter((l) => /^##\s+/.test(l.trim()))
      .map((l) => stripMarkdown(l));

    return {
      edition: stripMarkdown(editionLine).replace(/^Edition Date:\s*/i, ""),
      leadArticle: articles[0] || "Vitality & Longevity Digest",
      articles: articles.slice(0, 3),
    };
  }

  function renderFrontPageData(data) {
    // 1. Biscope Lead Dispatch
    if (data.biscope) {
      const b = extractBiscopeSummary(data.biscope);
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.textContent = val;
      };
      set("fpBiscopeDate", b.date);
      set("fpBiscopeHeadline", b.headline);
      set("fpBiscopeLead", b.lead);
      set("fpBiscopeWeather", b.weather);
      const list = document.getElementById("fpBiscopeHits");
      if (list && b.quickHits.length) {
        list.innerHTML = b.quickHits
          .map(
            (h) =>
              `<li><strong>${escapeHtml(h.topic)}:</strong> ${escapeHtml(h.body)}</li>`
          )
          .join("");
      }
    }

    // 2. Portfolio Advice
    if (data.portfolio) {
      const p = extractPortfolioSummary(data.portfolio);
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.textContent = val;
      };
      set("fpPortfolioDate", p.edition);
      set("fpPortfolioSummary", p.summary);
      set("fpPortfolioNifty", p.niftyNote);
      set("fpPortfolioSip", p.sipStance);
      const list = document.getElementById("fpPortfolioActions");
      if (list && p.actions.length) {
        list.innerHTML = p.actions
          .map(
            (a) =>
              `<li><strong>${escapeHtml(a.title)}:</strong> ${escapeHtml(a.detail)}</li>`
          )
          .join("");
      }
    }

    // 3. AI Research
    if (data["ai-research"]) {
      const ai = extractAiSummary(data["ai-research"]);
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.textContent = val;
      };
      set("fpAiDate", ai.edition);
      set("fpAiHeadline", ai.leadPaper);
      const stats = document.getElementById("fpAiStats");
      if (stats) {
        stats.innerHTML = `
          <span class="fp-stat-chip">${ai.paperCount} Research Papers</span>
          <span class="fp-stat-chip">${ai.essayCount} Long-Form Essays</span>
        `;
      }
      const list = document.getElementById("fpAiList");
      if (list && ai.highlights.length) {
        list.innerHTML = ai.highlights
          .map((title) => `<li>${escapeHtml(title)}</li>`)
          .join("");
      }
    }

    // 4. Health & Longevity
    if (data.health) {
      const h = extractHealthSummary(data.health);
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.textContent = val;
      };
      set("fpHealthDate", h.edition);
      set("fpHealthHeadline", h.leadArticle);
      const list = document.getElementById("fpHealthList");
      if (list && h.articles.length) {
        list.innerHTML = h.articles
          .map((title) => `<li>${escapeHtml(title)}</li>`)
          .join("");
      }
    }

    // 5. Bangalore Events
    if (data.events && Array.isArray(data.events)) {
      const total = data.events.length;
      const p1 = data.events.filter((e) =>
        String(e.priorityZone || e.zone || "").includes("Priority 1")
      ).length;
      const stats = document.getElementById("fpEventsStats");
      if (stats) {
        stats.innerHTML = `
          <span class="fp-stat-chip">${total} Live Listings</span>
          ${p1 ? `<span class="fp-stat-chip">${p1} Priority 1 · East</span>` : ""}
        `;
      }
      const list = document.getElementById("fpEventsList");
      if (list && data.events.length) {
        const sample = data.events.slice(0, 3);
        list.innerHTML = sample
          .map((ev) => {
            const name = ev.eventName || ev.name || ev.title || "Upcoming Event";
            const meta = [ev.dateDisplay || ev.date, ev.locality || ev.venue]
              .filter(Boolean)
              .join(" · ");
            return `<li><strong>${escapeHtml(name)}</strong>${meta ? " — " + escapeHtml(meta) : ""}</li>`;
          })
          .join("");
      }
    }
  }

  async function initFrontPage() {
    hydrateDateline();
    const refreshBtn = document.getElementById("npRefreshBtn");
    const docKeys = ["biscope", "portfolio", "ai-research", "health"];

    async function loadAll(forceLive) {
      setSyncState("loading", "Syncing all 5 desks…");
      if (refreshBtn) refreshBtn.disabled = true;

      // Load fallback events JSON
      let eventsData = [];
      try {
        const evRes = await fetch(DESKS.events.fallback);
        if (evRes.ok) {
          const parsed = await evRes.json();
          eventsData = Array.isArray(parsed) ? parsed : parsed.events || [];
        }
      } catch {
        // ignore
      }

      const results = { events: eventsData };
      let liveCount = 0;

      await Promise.all(
        docKeys.map(async (key) => {
          try {
            const res = await fetchDocMarkdown(DESKS[key], { forceLive });
            results[key] = res.markdown;
            if (res.source === "live") liveCount++;
          } catch {
            // fallback already handled in fetchDocMarkdown
          }
        })
      );

      renderFrontPageData(results);

      if (liveCount > 0) {
        setSyncState("live", `Live · ${liveCount}/${docKeys.length} Docs Synced`);
      } else {
        setSyncState("fallback", "Snapshot edition");
      }

      if (refreshBtn) refreshBtn.disabled = false;
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => loadAll(true));
    }

    // Instant initial paint from snapshots, then live refresh
    await loadAll(false);
    loadAll(true);
  }

  /* ------------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------------ */

  window.Newspaper = {
    DESKS,
    DRIVE_FOLDER_URL,
    initFrontPage,
    initDocPage,
    hydrateDateline,
  };
})();
