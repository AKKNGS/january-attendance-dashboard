/* =========================================================
   CONFIG (Vercel Static)
   ========================================================= */
const CONFIG = {
  mode: "vercel",
  apiBaseUrl: "/api",
};

/* =========================================================
   Global variables
   ========================================================= */
let rawData = [];
let headerRow = [];
let currentSheetName = "";
let currentMonth = "មករា";
let currentYear = "២០២៦";
let filteredData = [];
let currentPage = 1;
let pageSize = 25;

/* =========================================================
   Init
   ========================================================= */
window.addEventListener("load", initApp);

async function initApp() {
  toggleLoader(true, "កំពុងចាប់ផ្តើម...");

  try {
    const names = await getAllSheetNames();

    const select = document.getElementById("sheetSelect");
    select.innerHTML = '<option value="">ជ្រើសរើស Sheet...</option>';

    (names || []).forEach((n) => {
      const label = String(n).toLowerCase().includes("summary") ? "📊 " + n : "📅 " + n;
      select.add(new Option(label, n));
    });

    const start =
      (names || []).find((n) => String(n).toLowerCase().includes("summary")) ||
      (names || [])[0];

    if (start) {
      select.value = start;
      extractMonthFromSheetName(start);
      await loadData(start);
    }
  } catch (err) {
    alert("Init error: " + (err?.message || err));
  } finally {
    toggleLoader(false);
  }

  wireUIEvents();
}

/* =========================================================
   Data providers
   ========================================================= */
function getAllSheetNames() {
  return fetchJson(`${CONFIG.apiBaseUrl}/sheets`).then((res) => res.names || res);
}

function getSheetData(name) {
  const url = `${CONFIG.apiBaseUrl}/sheet?name=${encodeURIComponent(name)}`;
  return fetchJson(url);
}

/* ✅ Debug-friendly fetch */
async function fetchJson(url) {
  const r = await fetch(url, { method: "GET" });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!r.ok) {
    console.error("API Error:", url, r.status, data);
    throw new Error(`HTTP ${r.status} (${url}) -> ${text}`);
  }
  return data;
}

/* =========================================================
   UI events
   ========================================================= */
function wireUIEvents() {
  document.getElementById("sheetSelect").addEventListener("change", async (e) => {
    const name = e.target.value;
    if (!name) return;
    await loadData(name);
  });

  const searchInput = document.getElementById("searchInput");
  let t;
  searchInput.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => applyFilter(searchInput.value), 180);
  });

  document.getElementById("btnClearFilter").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    applyFilter("");
  });

  document.getElementById("btnPrint").addEventListener("click", printCurrentTable);

  document.getElementById("btnSortAtoZ").addEventListener("click", () => sortByBestNameCol(true));
  document.getElementById("btnSortZtoA").addEventListener("click", () => sortByBestNameCol(false));

  document.getElementById("btnPrevPage").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderUI(filteredData);
    }
  });

  document.getElementById("btnNextPage").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
    if (currentPage < totalPages) {
      currentPage++;
      renderUI(filteredData);
    }
  });
}

/* =========================================================
   Month extractor (optional)
   ========================================================= */
function extractMonthFromSheetName(sheetName) {
  const monthNames = {
    "មករា": ["january", "jan", "មករា", "១"],
    "កុម្ភៈ": ["february", "feb", "កុម្ភៈ", "២"],
    "មីនា": ["march", "mar", "មីនា", "៣"],
    "មេសា": ["april", "apr", "មេសា", "៤"],
    "ឧសភា": ["may", "ឧសភា", "៥"],
    "មិថុនា": ["june", "jun", "មិថុនា", "៦"],
    "កក្កដា": ["july", "jul", "កក្កដា", "៧"],
    "សីហា": ["august", "aug", "សីហា", "៨"],
    "កញ្ញា": ["september", "sep", "កញ្ញា", "៩"],
    "តុលា": ["october", "oct", "តុលា", "១០"],
    "វិច្ឆិកា": ["november", "nov", "វិច្ឆិកា", "១១"],
    "ធ្នូ": ["december", "dec", "ធ្នូ", "១២"],
  };

  const lowerName = String(sheetName || "").toLowerCase();
  for (const [month, keywords] of Object.entries(monthNames)) {
    if (keywords.some((k) => lowerName.includes(String(k).toLowerCase()))) {
      currentMonth = month;
      break;
    }
  }

  const pm = document.getElementById("printMonthYear");
  if (pm) pm.innerHTML = `ខែ${currentMonth} ឆ្នាំ ${currentYear}`;
}

/* =========================================================
   Load data
   ========================================================= */
async function loadData(name) {
  if (!name) return;

  currentSheetName = name;
  extractMonthFromSheetName(name);

  toggleLoader(true, "កំពុងទាញទិន្នន័យ " + name + "...");

  try {
    const res = await getSheetData(name);
    if (res && res.error) {
      alert("Error: " + res.error);
      return;
    }

    const data = res?.data ? res.data : res;
    if (!Array.isArray(data) || data.length === 0) {
      alert("Sheet ទទេ ឬ មិនមានទិន្នន័យ");
      return;
    }

    // Detect header row
    let hIdx = data.findIndex((row) =>
      (row || []).some((c) => /Reference|Employee|អត្តលេខ|ID|Total Permission|Total Scan|Name|Teachers/i.test(String(c)))
    );
    hIdx = hIdx === -1 ? 0 : hIdx;

    headerRow = data[hIdx] || [];

    rawData = data.filter((r, idx) => {
      const rr = r || [];
      const fullRow = rr.join(" ").toUpperCase();
      const isHeader = idx <= hIdx;
      const isTotal = fullRow.includes("សរុប") || (fullRow.includes("TOTAL") && !fullRow.includes("TOTAL PERMISSION"));
      const hasContent = rr.some((c) => String(c).trim() !== "");
      return !isHeader && !isTotal && hasContent;
    });

    filteredData = [...rawData];
    currentPage = 1;

    renderUI(filteredData);
    updateQuickStats();
  } catch (err) {
    console.error(err);
    alert("Load error: " + (err?.message || err));
  } finally {
    toggleLoader(false);
  }
}

/* =========================================================
   Render table
   ========================================================= */
function renderUI(rows) {
  const thead = document.getElementById("dataThead");
  const tbody = document.getElementById("dataTbody");
  if (!thead || !tbody) return;

  const safeHeaders = Array.isArray(headerRow) ? headerRow : [];
  const safeRows = Array.isArray(rows) ? rows : [];

  // Pagination
  const totalPages = Math.max(1, Math.ceil(safeRows.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * pageSize;
  const pageRows = safeRows.slice(start, start + pageSize);

  // Detect key columns
  const remarkIdx = findHeaderIndex(["REMARK", "NOTE", "STATUS", "Q"]);
  const timeIdxs = findAllHeaderIndexes([
    "CHECK IN", "CHECK OUT", "CLOCK IN", "CLOCK OUT", "TIME IN", "TIME OUT"
  ]);

  // Header
  thead.innerHTML =
    "<tr>" +
    safeHeaders.map((h) => `<th>${escapeHtml(String(h ?? ""))}</th>`).join("") +
    "</tr>";

  // Body
  const bodyHTML = pageRows
    .map((r) => {
      const row = Array.isArray(r) ? r : [];

      const remarkRaw = remarkIdx !== -1 ? String(row[remarkIdx] ?? "").trim().toUpperCase() : "";
      const rowClass =
        remarkRaw === "P" ? "row-permission" :
        remarkRaw === "M" ? "row-mission" : "";

      const tds = safeHeaders.map((_, i) => {
        const value = String(row[i] ?? "").trim();

        // If this is remark column, show badge
        if (i === remarkIdx) {
          if (remarkRaw === "P") {
            return `<td><span class="badge-remark badge-permission">Permission</span></td>`;
          }
          if (remarkRaw === "M") {
            return `<td><span class="badge-remark badge-mission">Mission</span></td>`;
          }
          return `<td>${escapeHtml(value)}</td>`;
        }

        // Highlight missing times for time-related columns
        const isTimeCol = timeIdxs.includes(i);
        if (isTimeCol && value === "") {
          return `<td class="missing-time" title="Missing time">—</td>`;
        }

        return `<td title="${escapeHtml(value)}">${escapeHtml(value)}</td>`;
      }).join("");

      return `<tr class="${rowClass}">${tds}</tr>`;
    })
    .join("");

  tbody.innerHTML = bodyHTML || `<tr><td class="text-center text-muted" colspan="50">គ្មានទិន្នន័យ</td></tr>`;

  // Footer info
  const info = document.getElementById("tableInfo");
  if (info) info.textContent = `${safeRows.length} rows • page ${currentPage} / ${totalPages}`;

  const pill = document.getElementById("pagePill");
  if (pill) pill.textContent = `${currentPage} / ${totalPages}`;
}

/* Helper: find multiple header indexes */
function findAllHeaderIndexes(keys) {
  if (!Array.isArray(headerRow)) return [];
  const H = headerRow.map((h) => String(h ?? "").trim().toUpperCase());
  const idxs = [];

  keys.forEach((k) => {
    const kk = String(k).trim().toUpperCase();
    H.forEach((h, i) => {
      if (h === kk || h.includes(kk)) idxs.push(i);
    });
  });

  // unique
  return Array.from(new Set(idxs));
}


/* =========================================================
   Filter + Sort
   ========================================================= */
function applyFilter(keyword) {
  const kw = String(keyword || "").trim().toLowerCase();
  filteredData = !kw
    ? [...rawData]
    : rawData.filter((row) => (row || []).join(" ").toLowerCase().includes(kw));

  currentPage = 1;
  renderUI(filteredData);
  updateQuickStats();
}

function sortByBestNameCol(asc = true) {
  if (!filteredData.length) return;

  const nameIdx = findHeaderIndex(["NAME", "TEACHER", "EMPLOYEE", "FULL NAME", "NAMES", "ឈ្មោះ"]);
  const idIdx = findHeaderIndex(["ID", "អត្តលេខ", "REFERENCE", "EMPLOYEE ID"]);
  const idx = nameIdx !== -1 ? nameIdx : idIdx !== -1 ? idIdx : 0;

  filteredData.sort((a, b) => {
    const A = String((a || [])[idx] ?? "").toLowerCase();
    const B = String((b || [])[idx] ?? "").toLowerCase();
    if (A < B) return asc ? -1 : 1;
    if (A > B) return asc ? 1 : -1;
    return 0;
  });

  currentPage = 1;
  renderUI(filteredData);
}

/* =========================================================
   Stats
   ========================================================= */
function updateQuickStats() {
  // Elements
  const rowsEl = document.getElementById("statRows");
  const scanEl = document.getElementById("statTotalScan");
  const permEl = document.getElementById("statTotalPermission");

  // If you changed HTML to statTotalMission:
  const missionEl =
    document.getElementById("statTotalMission") ||
    document.getElementById("statLateAbsent"); // fallback if you didn't change

  // Rows
  const n = Array.isArray(filteredData) ? filteredData.length : 0;
  if (rowsEl) rowsEl.textContent = String(n);

  // Column indexes
  const scanIdx = findHeaderIndex(["TOTAL SCAN", "TOTALSCAN", "SCAN", "TOTAL"]);
  const remarkIdx = findHeaderIndex(["REMARK", "STATUS", "NOTE", "COMMENT", "Q"]);

  let totalScan = 0;
  let totalPermission = 0;
  let totalMission = 0;

  (filteredData || []).forEach((r) => {
    const row = Array.isArray(r) ? r : [];

    // Total Scan
    if (scanIdx !== -1) totalScan += toNumber(row[scanIdx]);

    // Permission / Mission (P/M in Remark)
    if (remarkIdx !== -1) {
      const mark = String(row[remarkIdx] ?? "").trim().toUpperCase();
      if (mark === "P") totalPermission++;
      if (mark === "M") totalMission++;
    }
  });

  if (scanEl) scanEl.textContent = String(totalScan);
  if (permEl) permEl.textContent = String(totalPermission);

  // If you updated HTML to Total Mission:
  if (missionEl) {
    if (missionEl.id === "statLateAbsent") {
      missionEl.textContent = `Mission: ${totalMission}`; // old label
    } else {
      missionEl.textContent = String(totalMission); // new label
    }
  }
}



/* =========================================================
   Print (simple)
   ========================================================= */
function printCurrentTable() {
  window.print();
}

/* =========================================================
   Helpers
   ========================================================= */
function toggleLoader(show, text = "កំពុងដំណើរការ...") {
  const el = document.getElementById("appLoader");
  const t = document.getElementById("loaderText");
  if (t) t.textContent = text;
  if (!el) return;
  el.classList.toggle("d-none", !show);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function findHeaderIndex(keys) {
  if (!Array.isArray(headerRow)) return -1;

  const Hraw = headerRow.map((h) => String(h ?? ""));
  const H = Hraw.map((h) => norm(h));

  for (const k of keys) {
    const kk = norm(k);

    // exact match
    let idx = H.findIndex((h) => h === kk);
    if (idx !== -1) return idx;

    // contains match
    idx = H.findIndex((h) => h.includes(kk));
    if (idx !== -1) return idx;

    // also try match without spaces (TOTALSCAN)
    const kk2 = kk.replace(/\s+/g, "");
    idx = H.findIndex((h) => h.replace(/\s+/g, "") === kk2 || h.replace(/\s+/g, "").includes(kk2));
    if (idx !== -1) return idx;
  }

  return -1;
}


function toNumber(v) {
  const s = String(v ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, ""); // remove non-numeric
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}


function norm(str) {
  return String(str ?? "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")          // collapse spaces
    .replace(/[^\w\s]/g, "");      // remove symbols like / - etc.
}
