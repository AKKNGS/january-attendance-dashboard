/* =========================================================
   CONFIG (IMPORTANT for Vercel)
   ========================================================= */
const CONFIG = {
  // "gas" = use google.script.run (Apps Script web app)
  // "vercel" = use fetch() to your API endpoint that returns JSON
  mode: "vercel",

  // For Vercel mode:
  // If you deploy Vercel API routes, set "/api"
  // Example:
  //   GET  /api/sheets -> { names: ["January", "Summary", ...] }
  //   GET  /api/sheet?name=January -> { data: [...] } or [...]
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
let summarySheetData = null;

let currentPage = 1;
let pageSize = 25;

/* =========================================================
   App init
   ========================================================= */
window.addEventListener("load", initApp);

async function initApp() {
  toggleLoader(true, "កំពុងចាប់ផ្តើម...");

  if (isMobileDevice()) {
    document.body.classList.add("mobile-device");
    showMobileOptimizations();
  }

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

  setupEventListeners();
  wireUIEvents();
}

/* =========================================================
   Data providers (GAS vs Vercel)
   ========================================================= */
function getAllSheetNames() {
  if (CONFIG.mode === "gas" && window.google?.script?.run) {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .getAllSheetNames();
    });
  }

  // Vercel mode
  return fetchJson(`${CONFIG.apiBaseUrl}/sheets`).then((res) => res.names || res);
}

function getSheetData(name) {
  if (CONFIG.mode === "gas" && window.google?.script?.run) {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .getSheetData(name);
    });
  }

  // Vercel mode
  const url = `${CONFIG.apiBaseUrl}/sheet?name=${encodeURIComponent(name)}`;
  return fetchJson(url);
}

async function fetchJson(url) {
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`HTTP ${r.status} (${url})`);
  return r.json();
}

/* =========================================================
   Mobile helpers
   ========================================================= */
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function showMobileOptimizations() {
  const tableContainer = document.querySelector(".table-responsive");
  if (!tableContainer) return;

  let startX, startY;
  tableContainer.addEventListener(
    "touchstart",
    function (e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    false
  );

  tableContainer.addEventListener(
    "touchend",
    function (e) {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;

      const diffX = startX - endX;
      const diffY = startY - endY;

      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 30) {
        tableContainer.scrollLeft += diffX > 0 ? 120 : -120;
      }
    },
    false
  );
}

/* =========================================================
   Event listeners
   ========================================================= */
function setupEventListeners() {
  const modal = document.getElementById("teacherSummaryModal");
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === this) closeTeacherSummary();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeTeacherSummary();
      showDashboard();
    }
  });

  window.addEventListener("orientationchange", function () {
    setTimeout(function () {
      if (filteredData.length > 0) renderUI(filteredData);
    }, 300);
  });
}

function wireUIEvents() {
  // Sheet change
  const sheetSelect = document.getElementById("sheetSelect");
  sheetSelect.addEventListener("change", async () => {
    const name = sheetSelect.value;
    if (!name) return;
    await loadData(name);
  });

  // Search filter
  const searchInput = document.getElementById("searchInput");
  let t;
  searchInput.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      applyFilter(searchInput.value);
    }, 180);
  });

  // Clear
  document.getElementById("btnClearFilter").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    applyFilter("");
  });

  // Print
  document.getElementById("btnPrint").addEventListener("click", () => printCurrentTable());

  // Sorting buttons
  document.getElementById("btnSortAtoZ").addEventListener("click", () => sortByBestNameCol(true));
  document.getElementById("btnSortZtoA").addEventListener("click", () => sortByBestNameCol(false));

  // Pagination
  document.getElementById("btnPrevPage").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderUI(filteredData);
      scrollToTopTable();
    }
  });
  document.getElementById("btnNextPage").addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
    if (currentPage < totalPages) {
      currentPage++;
      renderUI(filteredData);
      scrollToTopTable();
    }
  });

  // Bottom nav
  document.getElementById("navDashboard").addEventListener("click", showDashboard);
  document.getElementById("navStats").addEventListener("click", showSummaryStats);
  document.getElementById("navTeacherSummary").addEventListener("click", showTeacherSummary);

  // Back on summary page
  document.getElementById("btnBackToDashboard").addEventListener("click", showDashboard);
}

/* =========================================================
   Navigation
   ========================================================= */
function showDashboard() {
  document.getElementById("mainDashboard").style.display = "block";
  document.getElementById("summaryStatsPage").classList.remove("show");
  document.getElementById("teacherSummaryModal").classList.remove("show");
  setActiveNav(0);
  scrollToTop();
}

function showSummaryStats() {
  document.getElementById("mainDashboard").style.display = "none";
  document.getElementById("summaryStatsPage").classList.add("show");
  document.getElementById("teacherSummaryModal").classList.remove("show");
  setActiveNav(1);
  updateTotalStatistics();
  scrollToTop();
}

async function showTeacherSummary() {
  document.getElementById("teacherSummaryModal").classList.add("show");
  setActiveNav(2);

  if (summarySheetData) {
    loadSummarySheetData();
    return;
  }

  const sheetSelect = document.getElementById("sheetSelect");
  const summaryOption = Array.from(sheetSelect.options).find(
    (opt) => opt.value && opt.value.toLowerCase().includes("summary")
  );

  if (summaryOption) {
    toggleLoader(true, "កំពុងទាញទិន្នន័យ Summary...");
    await loadData(summaryOption.value);
    toggleLoader(false);
  } else {
    document.getElementById("teacherSummaryBody").innerHTML =
      '<tr><td colspan="50" class="text-center">រកមិនឃើញ Sheet Summary</td></tr>';
  }
}

function closeTeacherSummary() {
  document.getElementById("teacherSummaryModal").classList.remove("show");
}

function setActiveNav(index) {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((item, i) => item.classList.toggle("active", i === index));
}

/* =========================================================
   Month extractor
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

  const sm = document.getElementById("summaryMonthYear");
  if (sm) sm.innerHTML = `ខែ${currentMonth} ឆ្នាំ ${currentYear}`;

  const sm2 = document.getElementById("summaryMonthYear2");
  if (sm2) sm2.innerHTML = `ខែ${currentMonth} ឆ្នាំ ${currentYear}`;
}

/* =========================================================
   Load data
   ========================================================= */
async function loadData(name) {
  if (!name) return;

  currentSheetName = name;
  extractMonthFromSheetName(name);

  toggleLoader(true, "កំពុងទាញទិន្នន័យ " + name + "...");

  const mobileTitle = document.querySelector(".mobile-header h1");
  if (mobileTitle && name.toLowerCase().includes("summary")) {
    mobileTitle.textContent = "របាយការណ៍ប្រចាំខែ";
  } else if (mobileTitle) {
    mobileTitle.textContent = "របាយការណ៍វត្តមាន";
  }

  try {
    const res = await getSheetData(name);

    if (res && res.error) {
      alert("មានបញ្ហាក្នុងការទាញទិន្នន័យ: " + res.error);
      return;
    }

    const data = res?.data ? res.data : res;
    if (!data || !Array.isArray(data) || data.length === 0) {
      alert("Sheet ទទេ ឬ មិនមានទិន្នន័យ");
      return;
    }

    // detect header row
    let hIdx = data.findIndex((row) =>
      (row || []).some((c) =>
        /Reference|Employee|អត្តលេខ|ID|Total Permission|Total Scan|Name|Teachers/i.test(String(c))
      )
    );
    hIdx = hIdx === -1 ? 0 : hIdx;

    headerRow = data[hIdx] || [];

    rawData = data.filter((r, idx) => {
      const rr = r || [];
      const fullRow = rr.join(" ").toUpperCase();
      const isHeader = idx <= hIdx;
      const isTotal =
        fullRow.includes("សរុប") ||
        (fullRow.includes("TOTAL") && !fullRow.includes("TOTAL PERMISSION"));
      const hasContent = rr.some((c) => String(c).trim() !== "");
      return !isHeader && !isTotal && hasContent;
    });

    filteredData = [...rawData];
    currentPage = 1;

    // BRAK -> BRORSER
    filteredData.forEach((row) => {
      row.forEach((cell, index) => {
        if (typeof cell === "string" && cell.includes("BRAK")) row[index] = cell.replace(/BRAK/g, "BRORSER");
      });
    });

    headerRow = headerRow.map((cell) =>
      typeof cell === "string" && cell.includes("BRAK") ? cell.replace(/BRAK/g, "BRORSER") : cell
    );

    if (name.toLowerCase().includes("summary")) {
      summarySheetData = { header: headerRow, data: filteredData };
      if (document.getElementById("teacherSummaryModal").classList.contains("show")) {
        loadSummarySheetData();
      }
    } else {
      // If not summary sheet, do not override summarySheetData (keep cached)
    }

    renderUI(filteredData);
    updateQuickStats();
  } catch (err) {
    alert("Load error: " + (err?.message || err));
  } finally {
    toggleLoader(false);
  }
}

/* =========================================================
   Render Summary modal table
   ========================================================= */
function loadSummarySheetData() {
  if (!summarySheetData) {
    document.getElementById("teacherSummaryBody").innerHTML =
      '<tr><td colspan="50" class="text-center">មិនទាន់មានទិន្នន័យ Summary</td></tr>';
    return;
  }

  const thead = document.querySelector("#teacherSummaryTable thead");
  const tbody = document.getElementById("teacherSummaryBody");

  const headerHTML = (summarySheetData.header || [])
    .map((header) => {
      const h = String(header || "");
      let displayHeader = h;
      if (isMobileDevice() && h.length > 15) displayHeader = h.substring(0, 12) + "...";
      return `<th title="${escapeHtml(h)}">${escapeHtml(displayHeader)}</th>`;
    })
    .join("");

  thead.innerHTML = `<tr>${headerHTML}</tr>`;

  const rowsHTML = (summarySheetData.data || [])
    .map((row) => {
      const cellsHTML = (row || [])
        .map((cell) => {
          const c = cell === null || cell === undefined ? "" : String(cell);
          let displayCell = c;
          if (isMobileDevice() && c.length > 20) displayCell = c.substring(0, 17) + "...";
          return `<td title="${escapeHtml(c)}">${escapeHtml(displayCell)}</td>`;
        })
        .join("");
      return `<tr>${cellsHTML}</tr>`;
    })
    .join("");

  tbody.innerHTML = rowsHTML || '<tr><td colspan="50" class="text-center">គ្មានទិន្នន័យ</td></tr>';
}

/* =========================================================
   Render main table + pagination
   ========================================================= */
function renderUI(rows) {
  // Safe guard
  const thead = document.getElementById("dataThead");
  const tbody = document.getElementById("dataTbody");
  if (!thead || !tbody) return;

  const safeHeaders = Array.isArray(headerRow) ? headerRow : [];
  const safeRows = Array.isArray(rows) ? rows : [];

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(safeRows.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = safeRows.slice(start, end);

  // Head
  const headHTML = safeHeaders
    .map((h) => {
      const hh = String(h ?? "");
      let display = hh;
      if (isMobileDevice() && display.length > 16) display = display.slice(0, 13) + "...";
      return `<th title="${escapeHtml(hh)}">${escapeHtml(display)}</th>`;
    })
    .join("");

  thead.innerHTML = `<tr>${headHTML}</tr>`;

  // Body
  const bodyHTML = pageRows
    .map((r) => {
      const row = Array.isArray(r) ? r : [];
      const cells = safeHeaders.map((_, idx) => {
        const val = row[idx] ?? "";
        const txt = String(val);
        let display = txt;

        if (isMobileDevice() && display.length > 24) display = display.slice(0, 20) + "...";
        return `<td title="${escapeHtml(txt)}">${escapeHtml(display)}</td>`;
      });
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");

  tbody.innerHTML =
    bodyHTML || `<tr><td class="text-center text-muted" colspan="50">គ្មានទិន្នន័យ</td></tr>`;

  // Info + page pill
  const info = document.getElementById("tableInfo");
  if (info) info.textContent = `${safeRows.length} rows • page ${currentPage} / ${totalPages}`;

  const pill = document.getElementById("pagePill");
  if (pill) pill.textContent = `${currentPage} / ${totalPages}`;
}

/* =========================================================
   Filtering
   ========================================================= */
function applyFilter(keyword) {
  const kw = String(keyword || "").trim().toLowerCase();

  if (!kw) {
    filteredData = [...rawData];
  } else {
    filteredData = rawData.filter((row) => {
      const joined = (row || []).map((c) => String(c ?? "")).join(" ").toLowerCase();
      return joined.includes(kw);
    });
  }

  currentPage = 1;
  renderUI(filteredData);
  updateQuickStats();
}

/* =========================================================
   Sorting (best "Name" col if found)
   ========================================================= */
function sortByBestNameCol(asc = true) {
  if (!filteredData || filteredData.length === 0) return;

  const nameIdx = findHeaderIndex(["NAME", "TEACHER", "EMPLOYEE", "FULL NAME", "NAMES", "ឈ្មោះ"]);
  const idIdx = findHeaderIndex(["ID", "អត្តលេខ", "REFERENCE", "EMPLOYEE ID"]);

  const sortIdx = nameIdx !== -1 ? nameIdx : idIdx !== -1 ? idIdx : 0;

  filteredData.sort((a, b) => {
    const A = String((a || [])[sortIdx] ?? "").toLowerCase();
    const B = String((b || [])[sortIdx] ?? "").toLowerCase();
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
  const rowsEl = document.getElementById("statRows");
  const scanEl = document.getElementById("statTotalScan");
  const permEl = document.getElementById("statTotalPermission");
  const laEl = document.getElementById("statLateAbsent");

  const n = filteredData.length;
  if (rowsEl) rowsEl.textContent = String(n);

  const scanIdx = findHeaderIndex(["TOTAL SCAN", "SCAN", "TOTALSCAN"]);
  const permIdx = findHeaderIndex(["TOTAL PERMISSION", "PERMISSION", "LEAVE", "PERM"]);

  const lateIdx = findHeaderIndex(["LATE", "ABSENT", "អវត្តមាន", "យឺត"]);
  let totalScan = 0;
  let totalPerm = 0;
  let lateAbsentCount = 0;

  filteredData.forEach((r) => {
    if (scanIdx !== -1) totalScan += toNumber((r || [])[scanIdx]);
    if (permIdx !== -1) totalPerm += toNumber((r || [])[permIdx]);

    if (lateIdx !== -1) {
      const v = String((r || [])[lateIdx] ?? "").trim();
      if (v && v !== "0") lateAbsentCount += 1;
    }
  });

  if (scanEl) scanEl.textContent = String(totalScan || 0);
  if (permEl) permEl.textContent = String(totalPerm || 0);

  if (laEl) {
    laEl.textContent = lateIdx !== -1 ? String(lateAbsentCount) : "-";
  }
}

function updateTotalStatistics() {
  // Summary page uses current filteredData (not summary sheet)
  updateQuickStats();

  const kpiRows = document.getElementById("kpiRows");
  const kpiScan = document.getElementById("kpiScan");
  const kpiPermission = document.getElementById("kpiPermission");
  const kpiLateAbsent = document.getElementById("kpiLateAbsent");

  const rows = filteredData.length;
  const scanIdx = findHeaderIndex(["TOTAL SCAN", "SCAN", "TOTALSCAN"]);
  const permIdx = findHeaderIndex(["TOTAL PERMISSION", "PERMISSION", "LEAVE", "PERM"]);
  const lateIdx = findHeaderIndex(["LATE", "ABSENT", "អវត្តមាន", "យឺត"]);

  let totalScan = 0;
  let totalPerm = 0;
  let lateAbsentCount = 0;

  filteredData.forEach((r) => {
    if (scanIdx !== -1) totalScan += toNumber((r || [])[scanIdx]);
    if (permIdx !== -1) totalPerm += toNumber((r || [])[permIdx]);

    if (lateIdx !== -1) {
      const v = String((r || [])[lateIdx] ?? "").trim();
      if (v && v !== "0") lateAbsentCount += 1;
    }
  });

  if (kpiRows) kpiRows.textContent = String(rows);
  if (kpiScan) kpiScan.textContent = String(totalScan || 0);
  if (kpiPermission) kpiPermission.textContent = String(totalPerm || 0);
  if (kpiLateAbsent) kpiLateAbsent.textContent = lateIdx !== -1 ? String(lateAbsentCount) : "-";
}

/* =========================================================
   Print
   ========================================================= */
function printCurrentTable() {
  const safeHeaders = Array.isArray(headerRow) ? headerRow : [];
  const safeRows = Array.isArray(filteredData) ? filteredData : [];

  const title = `របាយការណ៍ - ${currentSheetName || ""}`.trim();

  const headHtml = safeHeaders.map((h) => `<th>${escapeHtml(String(h ?? ""))}</th>`).join("");
  const bodyHtml = safeRows
    .map((r) => {
      const row = Array.isArray(r) ? r : [];
      const tds = safeHeaders.map((_, i) => `<td>${escapeHtml(String(row[i] ?? ""))}</td>`).join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  const html = `
  <!DOCTYPE html>
  <html lang="km">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;700&family=Moul&display=swap" rel="stylesheet" />
    <style>
      body{ font-family:"Noto Sans Khmer", Arial, sans-serif; padding:16px; }
      h1{ font-family:"Moul","Noto Sans Khmer",sans-serif; font-size:16px; margin:0 0 6px; }
      .sub{ color:#555; font-size:12px; margin-bottom:12px; }
      table{ width:100%; border-collapse:collapse; }
      th, td{ border:1px solid #ddd; padding:6px 8px; font-size:11px; white-space:nowrap; }
      th{ background:#f3f6fb; }
      @media print{
        body{ padding:0; }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <div class="sub">ខែ${escapeHtml(currentMonth)} ឆ្នាំ ${escapeHtml(currentYear)}</div>
    <table>
      <thead><tr>${headHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
    <script>window.onload=()=>window.print();</script>
  </body>
  </html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("Browser បានបិទ popup។ សូមអនុញ្ញាត popups រួចសាកម្តងទៀត។");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/* =========================================================
   Helpers
   ========================================================= */
function toggleLoader(show, text = "កំពុងដំណើរការ...") {
  const el = document.getElementById("appLoader");
  const t = document.getElementById("loaderText");
  if (t) t.textContent = text;

  if (!el) return;
  if (show) el.classList.remove("d-none");
  else el.classList.add("d-none");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToTopTable() {
  const tableBox = document.querySelector(".table-responsive");
  if (tableBox) tableBox.scrollTop = 0;
}

function findHeaderIndex(keys) {
  if (!headerRow || !Array.isArray(headerRow)) return -1;
  const H = headerRow.map((h) => String(h ?? "").trim().toUpperCase());

  for (const k of keys) {
    const kk = String(k).trim().toUpperCase();
    const idx = H.findIndex((h) => h === kk || h.includes(kk));
    if (idx !== -1) return idx;
  }
  return -1;
}

function toNumber(v) {
  // supports "1,234", " 12 ", null
  const s = String(v ?? "").replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
