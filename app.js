const SPREADSHEET_ID = "1bD7iUv2YTf8aKaoOxntbqucqKP9RN7t825NWB8aTc0Q";
const SHEET_GID = "0";
const XLSX_EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=xlsx&gid=${SHEET_GID}`;
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;
const FALLBACK_URL = "data/fallback-events.json";
const STORAGE_KEY_SAVED = "blr_events_saved_v1";
const STORAGE_KEY_SEEN = "blr_events_seen_v1";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const state = {
  title: "Bengaluru Upcoming Events",
  subtitle: "Curated guide to live performances, concerts, plays, and sports prioritized by location.",
  events: [],
  savedIds: new Set(loadSavedIds()),
  filters: {
    search: "",
    zone: "all",
    category: "all",
    subgenre: "all",
    locality: "all",
    timeframe: "all",
    savedOnly: false,
    newOnly: false,
  },
  sort: "dateAsc",
  view: "cards",
  syncSource: "loading",
  lastSynced: null,
};

// DOM Elements
const els = {
  syncStatusBadge: document.getElementById("syncStatusBadge"),
  syncStatusText: document.getElementById("syncStatusText"),
  lastSyncedText: document.getElementById("lastSyncedText"),
  refreshBtn: document.getElementById("refreshBtn"),
  dashboardTitle: document.getElementById("dashboardTitle"),
  dashboardSubtitle: document.getElementById("dashboardSubtitle"),
  savedFilterBtn: document.getElementById("savedFilterBtn"),
  savedCountBadge: document.getElementById("savedCountBadge"),
  newOnlyBtn: document.getElementById("newOnlyBtn"),
  newCountBadge: document.getElementById("newCountBadge"),
  viewBtns: document.querySelectorAll(".view-btn"),
  kpiCards: document.querySelectorAll(".kpi-card"),
  kpiAllCount: document.getElementById("kpiAllCount"),
  kpiZone1Count: document.getElementById("kpiZone1Count"),
  kpiZone2Count: document.getElementById("kpiZone2Count"),
  kpiZone3Count: document.getElementById("kpiZone3Count"),
  kpiZone1Meta: document.getElementById("kpiZone1Meta"),
  kpiZone2Meta: document.getElementById("kpiZone2Meta"),
  kpiZone3Meta: document.getElementById("kpiZone3Meta"),
  searchInput: document.getElementById("searchInput"),
  timeframeSelect: document.getElementById("timeframeSelect"),
  subgenreSelect: document.getElementById("subgenreSelect"),
  localitySelect: document.getElementById("localitySelect"),
  sortSelect: document.getElementById("sortSelect"),
  categoryPills: document.getElementById("categoryPills"),
  resultsCountText: document.getElementById("resultsCountText"),
  resetFiltersBtn: document.getElementById("resetFiltersBtn"),
  eventsContainer: document.getElementById("eventsContainer"),
  eventModal: document.getElementById("eventModal"),
  modalBody: document.getElementById("modalBody"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
};

function loadSavedIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedIds() {
  try {
    localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify([...state.savedIds]));
  } catch {
    // ignore storage errors
  }
}

function loadSeenMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SEEN);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistSeenMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function makeEventId(ev) {
  return `${ev.eventName}__${ev.date}__${ev.venue}`.toLowerCase().replace(/\s+/g, "_");
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBroadCategory(rawCat) {
  const c = (rawCat || "").toLowerCase();
  if (c.startsWith("plays") || c.includes("theatre")) return "Plays";
  if (c.startsWith("sports")) return "Sports";
  if (c.startsWith("music")) return "Music";
  return "Other";
}

function getBroadCategoryLabel(broad) {
  switch (broad) {
    case "Music":
      return "Live Music & Concerts";
    case "Plays":
      return "Plays & Theatre";
    case "Sports":
      return "Sports & Tournaments";
    default:
      return "Other Events";
  }
}

function getZoneClass(zone) {
  if (!zone) return "z3";
  if (zone.includes("Priority 1")) return "z1";
  if (zone.includes("Priority 2")) return "z2";
  return "z3";
}

function getZoneShortLabel(zone) {
  if (!zone) return "Bengaluru";
  if (zone.includes("Priority 1")) return "P1 · East";
  if (zone.includes("Priority 2")) return "P2 · Central";
  if (zone.includes("Priority 3")) return "P3 · Rest";
  return zone;
}

function parseDateRange(dateStr) {
  if (!dateStr) return { start: null, end: null };
  const matches = [...String(dateStr).matchAll(/\d{4}-\d{2}-\d{2}/g)].map((m) => m[0]);
  if (matches.length === 0) return { start: null, end: null };
  const parseLocal = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const start = parseLocal(matches[0]);
  const end = matches.length > 1 ? parseLocal(matches[matches.length - 1]) : start;
  return { start, end };
}

function formatDisplayDate(dateStr) {
  const { start, end } = parseDateRange(dateStr);
  if (!start) return dateStr || "TBA";
  const fmt = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (end && end.getTime() !== start.getTime()) {
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }
  return fmt.format(start);
}

function extractPriceTag(summary) {
  if (!summary) return "";
  const m = summary.match(/\(([^)]*(?:₹|free|limited|entry|pass|ticket)[^)]*)\)\s*\.?$/i);
  return m ? m[1] : "";
}

function enrichEvent(raw) {
  const { start, end } = parseDateRange(raw.date);
  const broadCategory = getBroadCategory(raw.category);
  return {
    ...raw,
    id: makeEventId(raw),
    broadCategory,
    broadCategoryLabel: getBroadCategoryLabel(broadCategory),
    zoneClass: getZoneClass(raw.priorityZone),
    zoneShort: getZoneShortLabel(raw.priorityZone),
    startDate: start,
    endDate: end,
    displayDate: formatDisplayDate(raw.date),
    priceTag: extractPriceTag(raw.summary),
  };
}

// Excel / XLSX Parsing Helpers
function excelSerialToIsoDate(serial) {
  if (typeof XLSX !== "undefined" && XLSX.SSF && XLSX.SSF.parse_date_code) {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = String(parsed.y).padStart(4, "0");
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const utcDays = Math.floor(serial - 25569);
  const dt = new Date(utcDays * 86400 * 1000);
  return dt.toISOString().slice(0, 10);
}

function excelSerialToTime(serial) {
  const totalMinutes = Math.round((serial % 1) * 24 * 60);
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function extractHyperlinkFromCell(cell) {
  if (!cell) return "";
  if (cell.l && cell.l.Target) return cell.l.Target;
  if (cell.f) {
    const m = cell.f.match(/HYPERLINK\(\s*"([^"]+)"/i);
    if (m) return m[1];
  }
  if (typeof cell.v === "string" && cell.v.startsWith("http")) {
    return cell.v;
  }
  return "";
}

function parseXlsxWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array", cellFormula: true, cellNF: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws["!ref"]) throw new Error("Empty worksheet");

  const range = XLSX.utils.decode_range(ws["!ref"]);
  const getCell = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
  const getText = (r, c) => {
    const cell = getCell(r, c);
    if (!cell) return "";
    if (cell.w != null && String(cell.w).trim() !== "") return String(cell.w).trim();
    if (cell.v != null) return String(cell.v).trim();
    return "";
  };

  const title = getText(0, 0) || state.title;
  const subtitle = getText(1, 0) || state.subtitle;

  // Dynamically locate the header row
  let headerRow = -1;
  const colMap = {};
  for (let r = 0; r <= Math.min(range.e.r, 30); r++) {
    let foundEventName = false;
    for (let c = 0; c <= range.e.c; c++) {
      const val = getText(r, c).toLowerCase();
      if (val === "event name") foundEventName = true;
    }
    if (foundEventName) {
      headerRow = r;
      for (let c = 0; c <= range.e.c; c++) {
        const key = getText(r, c).toLowerCase();
        if (key) colMap[key] = c;
      }
      break;
    }
  }

  if (headerRow === -1) throw new Error("Header row not found");

  const idxZone = colMap["priority zone"] ?? 0;
  const idxName = colMap["event name"] ?? 1;
  const idxCat = colMap["category"] ?? 2;
  const idxDate = colMap["date"] ?? 3;
  const idxTime = colMap["time"] ?? 4;
  const idxVenue = colMap["venue"] ?? 5;
  const idxLocality = colMap["locality"] ?? 6;
  const idxSummary = colMap["summary"] ?? 7;
  const idxLink = colMap["booking link"] ?? 8;
  const idxAdded =
    colMap["added at"] ??
    colMap["added"] ??
    colMap["date added"] ??
    colMap["created"] ??
    colMap["timestamp"];

  const events = [];
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const eventName = getText(r, idxName);
    if (!eventName) continue;

    const dateCell = getCell(r, idxDate);
    let dateStr = "";
    if (dateCell) {
      if (dateCell.t === "n" && dateCell.v > 30000) {
        dateStr = excelSerialToIsoDate(dateCell.v);
      } else {
        dateStr = getText(r, idxDate);
      }
    }

    const timeCell = getCell(r, idxTime);
    let timeStr = "";
    if (timeCell) {
      if (timeCell.t === "n" && timeCell.v >= 0 && timeCell.v < 1) {
        timeStr = excelSerialToTime(timeCell.v);
      } else {
        timeStr = getText(r, idxTime);
      }
    }

    const linkCell = getCell(r, idxLink);
    const bookingLink = extractHyperlinkFromCell(linkCell);

    let addedAt = null;
    if (idxAdded !== undefined) {
      const addedCell = getCell(r, idxAdded);
      if (addedCell) {
        if (addedCell.t === "n" && addedCell.v > 30000) {
          const utcMs = Math.round((addedCell.v - 25569) * 86400 * 1000);
          addedAt = utcMs;
        } else {
          const parsed = Date.parse(getText(r, idxAdded));
          if (!Number.isNaN(parsed)) addedAt = parsed;
        }
      }
    }

    events.push(
      enrichEvent({
        priorityZone: getText(r, idxZone),
        eventName,
        category: getText(r, idxCat),
        date: dateStr,
        time: timeStr,
        venue: getText(r, idxVenue),
        locality: getText(r, idxLocality),
        summary: getText(r, idxSummary),
        bookingLink,
        addedAt,
      })
    );
  }

  return { title, subtitle, events };
}

function parseGvizResponse(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Invalid GViz response");
  const json = JSON.parse(text.slice(start, end + 1));
  const rows = json.table?.rows || [];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const vals = (rows[i].c || []).map((cell) => (cell?.v ? String(cell.v).trim().toLowerCase() : ""));
    if (vals.includes("event name")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("GViz header row not found");

  const events = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const c = rows[i].c || [];
    const getVal = (idx) => {
      const cell = c[idx];
      if (!cell) return "";
      if (cell.f != null) return String(cell.f).trim();
      if (cell.v != null) return String(cell.v).trim();
      return "";
    };
    const name = getVal(1);
    if (!name) continue;
    events.push(
      enrichEvent({
        priorityZone: getVal(0),
        eventName: name,
        category: getVal(2),
        date: getVal(3),
        time: getVal(4),
        venue: getVal(5),
        locality: getVal(6),
        summary: getVal(7),
        bookingLink: "",
      })
    );
  }
  return { title: state.title, subtitle: state.subtitle, events };
}

async function fetchLiveData() {
  setSyncStatus("loading", "Syncing live sheet…");
  els.refreshBtn.classList.add("spinning");

  try {
    if (typeof XLSX === "undefined") {
      throw new Error("SheetJS not loaded");
    }
    const res = await fetch(XLSX_EXPORT_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const data = parseXlsxWorkbook(buffer);
    applyLoadedData(data, "live");
  } catch (xlsxErr) {
    console.warn("XLSX live fetch failed, trying GViz:", xlsxErr);
    try {
      const res = await fetch(GVIZ_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = parseGvizResponse(text);
      applyLoadedData(data, "live");
    } catch (gvizErr) {
      console.warn("GViz live fetch failed, using fallback snapshot:", gvizErr);
      try {
        const res = await fetch(FALLBACK_URL, { cache: "no-store" });
        const data = await res.json();
        applyLoadedData(
          {
            title: data.title || state.title,
            subtitle: data.subtitle || state.subtitle,
            events: (data.events || []).map(enrichEvent),
          },
          "fallback"
        );
      } catch (fallbackErr) {
        console.error("All data sources failed:", fallbackErr);
        setSyncStatus("fallback", "Unable to load events");
      }
    }
  } finally {
    els.refreshBtn.classList.remove("spinning");
  }
}

function setSyncStatus(mode, text) {
  els.syncStatusBadge.className = `sync-badge sync-${mode}`;
  els.syncStatusText.textContent = text;
}

async function applyNewEventFlags(events) {
  const now = Date.now();
  let seenMap = loadSeenMap();

  // On first visit, seed seenMap from fallback baseline (marked >24h old)
  // so only newly added events in the live sheet are highlighted as <24h.
  if (!seenMap) {
    seenMap = {};
    const olderThan24h = now - (TWENTY_FOUR_HOURS_MS + 60 * 60 * 1000);
    try {
      const res = await fetch(FALLBACK_URL, { cache: "no-store" });
      if (res.ok) {
        const baseline = await res.json();
        for (const raw of baseline.events || []) {
          seenMap[makeEventId(raw)] = olderThan24h;
        }
      }
    } catch {
      // ignore baseline fetch errors
    }
  }

  for (const ev of events) {
    if (ev.addedAt != null) {
      ev.firstSeenAt = ev.addedAt;
      ev.isNew24h = now - ev.addedAt <= TWENTY_FOUR_HOURS_MS && ev.addedAt <= now + 60000;
      seenMap[ev.id] = ev.addedAt;
    } else {
      if (seenMap[ev.id] == null) {
        seenMap[ev.id] = now;
      }
      ev.firstSeenAt = seenMap[ev.id];
      ev.isNew24h = now - seenMap[ev.id] <= TWENTY_FOUR_HOURS_MS;
    }
  }

  persistSeenMap(seenMap);
}

async function applyLoadedData(data, source) {
  state.title = data.title || state.title;
  state.subtitle = data.subtitle || state.subtitle;
  state.events = data.events || [];
  state.syncSource = source;
  state.lastSynced = new Date();

  await applyNewEventFlags(state.events);

  els.dashboardTitle.textContent = state.title;
  els.dashboardSubtitle.textContent = state.subtitle;

  if (source === "live") {
    setSyncStatus("live", `Live · Google Sheets (${state.events.length} events)`);
  } else {
    setSyncStatus("fallback", `Cached Snapshot (${state.events.length} events)`);
  }

  const timeFmt = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  els.lastSyncedText.textContent = `Synced ${timeFmt.format(state.lastSynced)}`;

  populateDynamicSelects();
  renderAll();
}

function populateDynamicSelects() {
  const currentSub = state.filters.subgenre;
  const currentLoc = state.filters.locality;

  const subgenres = [...new Set(state.events.map((e) => e.category).filter(Boolean))].sort();
  els.subgenreSelect.innerHTML = `<option value="all">All Genres (${subgenres.length})</option>` +
    subgenres.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
  els.subgenreSelect.value = subgenres.includes(currentSub) ? currentSub : "all";

  const localities = [...new Set(state.events.map((e) => e.locality).filter(Boolean))].sort();
  els.localitySelect.innerHTML = `<option value="all">All Localities (${localities.length})</option>` +
    localities.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
  els.localitySelect.value = localities.includes(currentLoc) ? currentLoc : "all";
}

function getFilteredEvents() {
  const { search, zone, category, subgenre, locality, timeframe, savedOnly, newOnly } = state.filters;
  const q = search.trim().toLowerCase();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filtered = state.events.filter((ev) => {
    if (savedOnly && !state.savedIds.has(ev.id)) return false;
    if (newOnly && !ev.isNew24h) return false;
    if (zone !== "all" && ev.priorityZone !== zone) return false;
    if (category !== "all" && ev.broadCategory !== category) return false;
    if (subgenre !== "all" && ev.category !== subgenre) return false;
    if (locality !== "all" && ev.locality !== locality) return false;

    if (timeframe !== "all" && ev.startDate) {
      const start = ev.startDate;
      const end = ev.endDate || start;
      if (timeframe === "weekend") {
        // Find upcoming Friday–Sunday window
        const day = today.getDay();
        const daysToFri = (5 - day + 7) % 7;
        const fri = new Date(today);
        fri.setDate(today.getDate() + (day === 6 || day === 0 ? -((day + 2) % 7) : daysToFri));
        const sun = new Date(fri);
        sun.setDate(fri.getDate() + 2);
        if (end < fri || start > sun) return false;
      } else if (timeframe === "next7") {
        const limit = new Date(today);
        limit.setDate(today.getDate() + 7);
        if (end < today || start > limit) return false;
      } else if (timeframe === "next14") {
        const limit = new Date(today);
        limit.setDate(today.getDate() + 14);
        if (end < today || start > limit) return false;
      } else if (timeframe === "thisMonth") {
        if (start.getMonth() !== today.getMonth() || start.getFullYear() !== today.getFullYear()) return false;
      } else if (timeframe === "nextMonth") {
        const nextM = (today.getMonth() + 1) % 12;
        const nextY = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
        if (start.getMonth() !== nextM || start.getFullYear() !== nextY) return false;
      }
    }

    if (q) {
      const hay = `${ev.eventName} ${ev.category} ${ev.venue} ${ev.locality} ${ev.summary} ${ev.priorityZone}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (state.sort === "nameAsc") {
      return a.eventName.localeCompare(b.eventName);
    }
    if (state.sort === "zoneAsc") {
      const z = a.priorityZone.localeCompare(b.priorityZone);
      if (z !== 0) return z;
    }
    const da = a.startDate ? a.startDate.getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.startDate ? b.startDate.getTime() : Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return a.eventName.localeCompare(b.eventName);
  });

  return filtered;
}

function renderKPIs() {
  const total = state.events.length;
  const z1 = state.events.filter((e) => e.priorityZone.includes("Priority 1")).length;
  const z2 = state.events.filter((e) => e.priorityZone.includes("Priority 2")).length;
  const z3 = state.events.filter((e) => e.priorityZone.includes("Priority 3")).length;
  const newCount = state.events.filter((e) => e.isNew24h).length;

  const pct = (n) => (total ? `${((n / total) * 100).toFixed(1)}% of total` : "0%");

  els.kpiAllCount.textContent = total;
  els.kpiZone1Count.textContent = z1;
  els.kpiZone2Count.textContent = z2;
  els.kpiZone3Count.textContent = z3;

  els.kpiZone1Meta.textContent = `${pct(z1)} · Whitefield, Bellandur, ORR`;
  els.kpiZone2Meta.textContent = `${pct(z2)} · CBD, Vasanth Nagar, Malleshwaram`;
  els.kpiZone3Meta.textContent = `${pct(z3)} · Indiranagar, Koramangala, JP Nagar`;

  els.kpiCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.zone === state.filters.zone);
  });

  els.savedCountBadge.textContent = state.savedIds.size;
  els.savedFilterBtn.setAttribute("aria-pressed", String(state.filters.savedOnly));

  els.newCountBadge.textContent = newCount;
  els.newOnlyBtn.setAttribute("aria-pressed", String(state.filters.newOnly));
}

function hasActiveFilters() {
  const f = state.filters;
  return (
    f.search !== "" ||
    f.zone !== "all" ||
    f.category !== "all" ||
    f.subgenre !== "all" ||
    f.locality !== "all" ||
    f.timeframe !== "all" ||
    f.savedOnly ||
    f.newOnly
  );
}

function syncFilterUI() {
  els.searchInput.value = state.filters.search;
  els.timeframeSelect.value = state.filters.timeframe;
  els.subgenreSelect.value = state.filters.subgenre;
  els.localitySelect.value = state.filters.locality;
  els.sortSelect.value = state.sort;

  els.categoryPills.querySelectorAll("[data-category]").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.category === state.filters.category);
  });
  els.newOnlyBtn.setAttribute("aria-pressed", String(state.filters.newOnly));

  els.resetFiltersBtn.classList.toggle("hidden", !hasActiveFilters());
}

function renderEvents() {
  const list = getFilteredEvents();
  els.resultsCountText.textContent = `Showing ${list.length} of ${state.events.length} events`;
  els.resetFiltersBtn.classList.toggle("hidden", !hasActiveFilters());

  if (list.length === 0) {
    els.eventsContainer.innerHTML = `
      <div class="empty-state">
        <h3>No matching events found</h3>
        <p>Try adjusting your search query, priority zone, or date filter.</p>
        <button class="btn-primary-sm" type="button" id="emptyResetBtn">Reset all filters</button>
      </div>
    `;
    document.getElementById("emptyResetBtn")?.addEventListener("click", resetFilters);
    return;
  }

  if (state.view === "cards") {
    els.eventsContainer.innerHTML = `<div class="cards-grid">${list.map(renderCardHtml).join("")}</div>`;
  } else if (state.view === "timeline") {
    els.eventsContainer.innerHTML = renderTimelineHtml(list);
  } else {
    els.eventsContainer.innerHTML = renderTableHtml(list);
  }

  attachEventInteractions();
}

function renderBookmarkSvg() {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
}

function renderNewBadgeHtml(ev) {
  return ev.isNew24h ? `<span class="new-badge" title="Added in the last 24 hours">New · 24h</span>` : "";
}

function renderCardHtml(ev) {
  const isSaved = state.savedIds.has(ev.id);
  return `
    <article class="event-card${ev.isNew24h ? " is-new" : ""}" data-event-id="${escapeHtml(ev.id)}" tabindex="0">
      <div class="card-top">
        <div class="badge-row">
          ${renderNewBadgeHtml(ev)}
          <span class="zone-badge ${ev.zoneClass}">${escapeHtml(ev.zoneShort)}</span>
          <span class="cat-badge">${escapeHtml(ev.category)}</span>
        </div>
        <button class="save-icon-btn ${isSaved ? "saved" : ""}" type="button" data-save-id="${escapeHtml(ev.id)}" title="${isSaved ? "Remove from shortlist" : "Save to shortlist"}" aria-label="Save event">
          ${renderBookmarkSvg()}
        </button>
      </div>
      <h3 class="event-title">${escapeHtml(ev.eventName)}</h3>
      <div class="event-datetime">
        <span>${escapeHtml(ev.displayDate)}</span>
        ${ev.time ? `<span>· ${escapeHtml(ev.time)}</span>` : ""}
      </div>
      <div class="event-venue">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>${escapeHtml(ev.venue)}${ev.locality ? ` · ${escapeHtml(ev.locality)}` : ""}</span>
      </div>
      <p class="event-summary">${escapeHtml(ev.summary)}</p>
      <div class="card-footer">
        ${ev.priceTag ? `<span class="price-tag">${escapeHtml(ev.priceTag)}</span>` : ""}
        <div class="card-actions">
          ${ev.bookingLink ? `<a class="btn-primary-sm" href="${escapeHtml(ev.bookingLink)}" target="_blank" rel="noopener noreferrer" data-stop-modal="true">Book ↗</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderTimelineHtml(list) {
  const groups = new Map();
  for (const ev of list) {
    const key = ev.displayDate || "TBA";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }

  let html = `<div class="timeline-list">`;
  for (const [dateLabel, items] of groups.entries()) {
    html += `
      <div class="timeline-group">
        <div class="timeline-group-header">
          <span class="timeline-date-pill">${escapeHtml(dateLabel)}</span>
          <span class="timeline-count">${items.length} event${items.length > 1 ? "s" : ""}</span>
        </div>
        <div class="timeline-items">
          ${items
            .map((ev) => {
              const isSaved = state.savedIds.has(ev.id);
              return `
                <div class="timeline-item${ev.isNew24h ? " is-new" : ""}" data-event-id="${escapeHtml(ev.id)}" tabindex="0">
                  <div class="timeline-item-main">
                    <div class="badge-row">
                      ${renderNewBadgeHtml(ev)}
                      <span class="zone-badge ${ev.zoneClass}">${escapeHtml(ev.zoneShort)}</span>
                      <span class="cat-badge">${escapeHtml(ev.category)}</span>
                      ${ev.time ? `<span class="cat-badge">${escapeHtml(ev.time)}</span>` : ""}
                    </div>
                    <h3 class="event-title">${escapeHtml(ev.eventName)}</h3>
                    <div class="event-venue">${escapeHtml(ev.venue)}${ev.locality ? ` · ${escapeHtml(ev.locality)}` : ""}</div>
                  </div>
                  <div class="card-actions">
                    <button class="save-icon-btn ${isSaved ? "saved" : ""}" type="button" data-save-id="${escapeHtml(ev.id)}" aria-label="Save event">
                      ${renderBookmarkSvg()}
                    </button>
                    ${ev.bookingLink ? `<a class="btn-primary-sm" href="${escapeHtml(ev.bookingLink)}" target="_blank" rel="noopener noreferrer" data-stop-modal="true">Book ↗</a>` : ""}
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }
  html += `</div>`;
  return html;
}

function renderTableHtml(list) {
  return `
    <div class="table-wrap">
      <table class="events-table">
        <thead>
          <tr>
            <th>Date &amp; Time</th>
            <th>Event</th>
            <th>Category</th>
            <th>Venue &amp; Locality</th>
            <th>Zone</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map((ev) => {
              const isSaved = state.savedIds.has(ev.id);
              return `
                <tr class="${ev.isNew24h ? "is-new" : ""}" data-event-id="${escapeHtml(ev.id)}">
                  <td style="white-space:nowrap;font-family:var(--font-mono);font-size:0.78rem;">
                    <div><strong>${escapeHtml(ev.displayDate)}</strong></div>
                    <div style="color:var(--text-muted)">${escapeHtml(ev.time || "TBA")}</div>
                  </td>
                  <td>
                    <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;font-weight:700;">
                      <span>${escapeHtml(ev.eventName)}</span>
                      ${renderNewBadgeHtml(ev)}
                    </div>
                    ${ev.priceTag ? `<span class="price-tag" style="margin-top:4px;display:inline-block;">${escapeHtml(ev.priceTag)}</span>` : ""}
                  </td>
                  <td><span class="cat-badge">${escapeHtml(ev.category)}</span></td>
                  <td>
                    <div style="font-weight:600;">${escapeHtml(ev.venue)}</div>
                    <div style="color:var(--text-muted);font-size:0.78rem;">${escapeHtml(ev.locality)}</div>
                  </td>
                  <td><span class="zone-badge ${ev.zoneClass}">${escapeHtml(ev.zoneShort)}</span></td>
                  <td style="white-space:nowrap;">
                    <div style="display:flex;align-items:center;gap:0.4rem;">
                      <button class="save-icon-btn ${isSaved ? "saved" : ""}" type="button" data-save-id="${escapeHtml(ev.id)}" aria-label="Save event">
                        ${renderBookmarkSvg()}
                      </button>
                      ${ev.bookingLink ? `<a class="btn-primary-sm" href="${escapeHtml(ev.bookingLink)}" target="_blank" rel="noopener noreferrer" data-stop-modal="true">Book ↗</a>` : ""}
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function attachEventInteractions() {
  els.eventsContainer.querySelectorAll("[data-stop-modal='true']").forEach((a) => {
    a.addEventListener("click", (e) => e.stopPropagation());
  });

  els.eventsContainer.querySelectorAll("[data-save-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSaveEvent(btn.dataset.saveId);
    });
  });

  els.eventsContainer.querySelectorAll("[data-event-id]").forEach((card) => {
    card.addEventListener("click", () => openEventModal(card.dataset.eventId));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openEventModal(card.dataset.eventId);
      }
    });
  });
}

function toggleSaveEvent(id) {
  if (state.savedIds.has(id)) {
    state.savedIds.delete(id);
  } else {
    state.savedIds.add(id);
  }
  persistSavedIds();
  renderAll();
}

function buildGoogleCalendarUrl(ev) {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const text = encodeURIComponent(ev.eventName);
  const location = encodeURIComponent(`${ev.venue}${ev.locality ? `, ${ev.locality}, Bengaluru` : ", Bengaluru"}`);
  const details = encodeURIComponent(`${ev.summary}${ev.bookingLink ? `\n\nBooking: ${ev.bookingLink}` : ""}`);
  let datesParam = "";
  if (ev.startDate) {
    const fmtIso = (d) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const startStr = fmtIso(ev.startDate);
    const endDt = new Date(ev.endDate || ev.startDate);
    endDt.setDate(endDt.getDate() + 1);
    datesParam = `&dates=${startStr}/${fmtIso(endDt)}`;
  }
  return `${base}&text=${text}&location=${location}&details=${details}${datesParam}`;
}

function openEventModal(id) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return;

  const isSaved = state.savedIds.has(ev.id);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ev.venue} ${ev.locality} Bengaluru`)}`;
  const gcalUrl = buildGoogleCalendarUrl(ev);

  els.modalBody.innerHTML = `
    <div class="badge-row">
      ${renderNewBadgeHtml(ev)}
      <span class="zone-badge ${ev.zoneClass}">${escapeHtml(ev.priorityZone)}</span>
      <span class="cat-badge">${escapeHtml(ev.category)}</span>
    </div>
    <h2 id="modalTitle" class="modal-title">${escapeHtml(ev.eventName)}</h2>
    <div class="modal-meta-grid">
      <div class="modal-meta-item">
        <label>Date</label>
        <span>${escapeHtml(ev.displayDate)}${ev.date && ev.date !== ev.displayDate ? ` (${escapeHtml(ev.date)})` : ""}</span>
      </div>
      <div class="modal-meta-item">
        <label>Time</label>
        <span>${escapeHtml(ev.time || "TBA")}</span>
      </div>
      <div class="modal-meta-item">
        <label>Venue</label>
        <span>${escapeHtml(ev.venue)}</span>
      </div>
      <div class="modal-meta-item">
        <label>Locality</label>
        <span>${escapeHtml(ev.locality || "Bengaluru")}</span>
      </div>
    </div>
    <p class="modal-summary">${escapeHtml(ev.summary)}</p>
    <div class="modal-actions">
      ${ev.bookingLink ? `<a class="btn-primary-lg" href="${escapeHtml(ev.bookingLink)}" target="_blank" rel="noopener noreferrer">Open Booking Link ↗</a>` : ""}
      <button class="btn-secondary-lg" type="button" id="modalSaveBtn">
        ${isSaved ? "Saved in Shortlist ✓" : "Save to Shortlist"}
      </button>
      <a class="btn-secondary-lg" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Map ↗</a>
      <a class="btn-secondary-lg" href="${gcalUrl}" target="_blank" rel="noopener noreferrer">+ Google Calendar</a>
    </div>
  `;

  document.getElementById("modalSaveBtn")?.addEventListener("click", () => {
    toggleSaveEvent(ev.id);
    openEventModal(ev.id);
  });

  els.eventModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeEventModal() {
  els.eventModal.classList.add("hidden");
  document.body.style.overflow = "";
}

function resetFilters() {
  state.filters = {
    search: "",
    zone: "all",
    category: "all",
    subgenre: "all",
    locality: "all",
    timeframe: "all",
    savedOnly: false,
    newOnly: false,
  };
  syncFilterUI();
  renderAll();
}

function renderAll() {
  renderKPIs();
  renderEvents();
}

// Event Listeners
els.refreshBtn.addEventListener("click", fetchLiveData);

els.searchInput.addEventListener("input", (e) => {
  state.filters.search = e.target.value;
  renderEvents();
});

els.timeframeSelect.addEventListener("change", (e) => {
  state.filters.timeframe = e.target.value;
  renderEvents();
});

els.subgenreSelect.addEventListener("change", (e) => {
  state.filters.subgenre = e.target.value;
  renderEvents();
});

els.localitySelect.addEventListener("change", (e) => {
  state.filters.locality = e.target.value;
  renderEvents();
});

els.sortSelect.addEventListener("change", (e) => {
  state.sort = e.target.value;
  renderEvents();
});

els.resetFiltersBtn.addEventListener("click", resetFilters);

els.savedFilterBtn.addEventListener("click", () => {
  state.filters.savedOnly = !state.filters.savedOnly;
  renderAll();
});

els.newOnlyBtn.addEventListener("click", () => {
  state.filters.newOnly = !state.filters.newOnly;
  syncFilterUI();
  renderEvents();
});

els.kpiCards.forEach((card) => {
  card.addEventListener("click", () => {
    const zone = card.dataset.zone;
    state.filters.zone = state.filters.zone === zone && zone !== "all" ? "all" : zone;
    renderAll();
  });
});

els.categoryPills.querySelectorAll("[data-category]").forEach((pill) => {
  pill.addEventListener("click", () => {
    state.filters.category = pill.dataset.category;
    syncFilterUI();
    renderEvents();
  });
});

els.viewBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.view = btn.dataset.view;
    els.viewBtns.forEach((b) => b.classList.toggle("active", b === btn));
    renderEvents();
  });
});

els.modalCloseBtn.addEventListener("click", closeEventModal);
els.eventModal.addEventListener("click", (e) => {
  if (e.target === els.eventModal) closeEventModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.eventModal.classList.contains("hidden")) {
    closeEventModal();
  }
});

// Initialize
fetchLiveData();
