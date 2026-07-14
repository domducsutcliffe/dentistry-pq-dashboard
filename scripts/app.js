// ── Crypto gate ──────────────────────────────────────────────────────────────
// Data files are AES-256-GCM encrypted at build time.  The password is used to
// derive the decryption key via PBKDF2.  No password or hash is stored in this
// source — a wrong password simply fails to decrypt the data.
const PBKDF2_ITERATIONS = 100_000;

function b64toBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function decryptPayload(envelope, password) {
  const { salt, iv, tag, data } = envelope;
  const saltBytes = b64toBytes(salt);
  const ivBytes = b64toBytes(iv);
  const tagBytes = b64toBytes(tag);
  const cipherBytes = b64toBytes(data);

  // AES-GCM expects ciphertext + authTag concatenated
  const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
  combined.set(cipherBytes);
  combined.set(tagBytes, cipherBytes.length);

  const key = await deriveKey(password, saltBytes);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, combined);
  return new TextDecoder().decode(plainBuf);
}

let _resolvePassword;
// Deliberately `let`, and re-armed after every failed attempt: a `const` promise resolves
// once and keeps handing back the FIRST password forever, so a single typo would lock you
// out of the dashboard until you reloaded the page, however many times you retyped it.
let passwordReady = new Promise((resolve) => { _resolvePassword = resolve; });

function awaitNextPassword() {
  passwordReady = new Promise((resolve) => { _resolvePassword = resolve; });
  return passwordReady;
}

if (sessionStorage.getItem("pq-auth-ok")) {
  _resolvePassword(sessionStorage.getItem("pq-auth-ok"));
} else {
  document.querySelector(".page").style.display = "none";
  const overlay = document.createElement("div");
  overlay.id = "auth-overlay";
  overlay.innerHTML = `
    <div style="position:fixed;inset:0;background:var(--page,#f6f6ef);z-index:9999;display:flex;align-items:center;justify-content:center;">
      <form id="auth-form" style="background:#fff;border:1px solid #d9d4bd;padding:24px 28px;max-width:300px;width:100%;font-family:'Inter',sans-serif;">
        <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;">🔒 Dashboard Access</h2>
        <input id="auth-input" type="password" placeholder="Enter password" autofocus
          style="width:100%;min-height:32px;border:1px solid #d9d4bd;padding:6px 8px;font:inherit;margin-bottom:10px;border-radius:0;">
        <button type="submit" id="auth-btn"
          style="width:100%;min-height:32px;background:#ff6600;border:none;color:#fff;font:inherit;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:0.5px;font-size:12px;">
          Enter
        </button>
        <p id="auth-error" style="color:#bd2130;font-size:11px;margin:8px 0 0;display:none;">Incorrect password</p>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("auth-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = document.getElementById("auth-input").value;
    document.getElementById("auth-btn").textContent = "Decrypting…";
    document.getElementById("auth-error").style.display = "none";
    _resolvePassword(val);
  });
}
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_VERTICAL_ID, getVertical } from "../config.js";

const VERTICAL = getVertical(DEFAULT_VERTICAL_ID);

// Word-boundary, case-insensitive matcher for the vertical's topic roots.
const VERTICAL_MATCH = new RegExp(`\\b(${VERTICAL.matchRoots.join("|")})`, "i");

// Party shown as a coloured square next to the member name (party column removed).
// Emoji squares are a limited palette, so a few minor parties share a colour — the
// full party name is always available on hover via the title attribute.
const PARTY_EMOJI = {
  Lab: "🟥",
  Con: "🟦",
  LD: "🟧",
  SNP: "🟨",
  Green: "🟩",
  DUP: "🟥",
  RUK: "🟦",
  Ind: "⬜",
  SDLP: "🟩",
  PC: "🟩",
  UUP: "🟦",
  Alba: "🟦",
  UKIP: "🟪",
  CUK: "⬛",
  RB: "⬜",
};

function partyEmoji(question) {
  const abbr = question.member.partyAbbreviation || question.member.party || "";
  return PARTY_EMOJI[abbr] || "⬜";
}

const state = {
  questions: [],
  summary: null,
  query: "",
  party: "",
  region: "",
  answer: "",
  periods: ["current"],
  searchQuestionOnly: true,
  chartPoints: [],
  selectedMonth: "",
  selectedTopic: "",
};

const PERIODS = {
  current: {
    label: "current Parliament",
    statusLabel: "current Parliament questions shown",
    start: "2024-07-09",
    end: "",
  },
  cameron: {
    label: "Cameron government",
    statusLabel: "Cameron government questions shown",
    start: "2010-05-11",
    end: "2016-07-13",
  },
  may: {
    label: "May government",
    statusLabel: "May government questions shown",
    start: "2016-07-13",
    end: "2019-07-24",
  },
  boris: {
    label: "Boris Johnson government",
    statusLabel: "Boris government questions shown",
    start: "2019-07-24",
    end: "2022-09-06",
  },
  truss: {
    label: "Truss government",
    statusLabel: "Truss government questions shown",
    start: "2022-09-06",
    end: "2022-10-25",
  },
  sunak: {
    label: "Sunak government",
    statusLabel: "Sunak government questions shown",
    start: "2022-10-25",
    end: "2024-07-05",
  },
};

const elements = {
  status: document.querySelector("#data-status"),
  total: document.querySelector("#metric-total"),
  answered: document.querySelector("#metric-answered"),
  latest: document.querySelector("#metric-latest"),
  partyMetric: document.querySelector("#metric-party"),
  regionMetric: document.querySelector("#metric-region"),
  search: document.querySelector("#search"),
  periodCheckboxes: document.querySelectorAll('input[name="period"]'),
  searchQuestionOnly: document.querySelector("#search-question-only"),
  partyFilter: document.querySelector("#party-filter"),
  regionFilter: document.querySelector("#region-filter"),
  answerFilter: document.querySelector("#answer-filter"),
  monthlyRange: document.querySelector("#monthly-range"),
  monthlyChart: document.querySelector("#monthly-chart"),
  partyChart: document.querySelector("#party-chart"),
  regionChart: document.querySelector("#region-chart"),
  themeChart: document.querySelector("#theme-chart"),
  resultsCount: document.querySelector("#results-count"),
  table: document.querySelector("#question-table"),
  footer: document.querySelector("#data-footer"),
  tooltip: document.querySelector("#chart-tooltip"),
  answerTooltip: document.querySelector("#answer-tooltip"),
  resetFilters: document.querySelector("#reset-filters"),
};

// Full answer text for the hover tooltip, keyed by question id (populated per render).
const answerByQid = new Map();

const formatNumber = new Intl.NumberFormat("en-GB");
const formatDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const MONTH_NAMES = {
  "01": "January",
  "02": "February",
  "03": "March",
  "04": "April",
  "05": "May",
  "06": "June",
  "07": "July",
  "08": "August",
  "09": "September",
  "10": "October",
  "11": "November",
  "12": "December",
};

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shortDate(value) {
  const date = parseDate(value);
  return date ? formatDate.format(date) : "-";
}

function formatGeneratedAt(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  const day = date.getDate();
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthName = months[date.getMonth()];
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} ${monthName} @ ${hours}:${minutes}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getQuestionTopic(question) {
  return question.topic || "General";
}

function getTopicCounts(questions) {
  const counts = {};
  for (const q of questions) {
    const topic = getQuestionTopic(q);
    counts[topic] = (counts[topic] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item) || "Unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function questionText(question) {
  return [
    question.uin,
    question.heading,
    question.questionText,
    question.answerText,
    question.member?.name,
    question.member?.party,
    question.member?.partyAbbreviation,
    question.member?.constituency,
    question.region?.nhsRegion,
    question.region?.nation,
  ]
    .join(" ")
    .toLowerCase();
}

function getPeriodInfo() {
  const allKeys = Object.keys(PERIODS);
  const selectedKeys = allKeys.filter(k => state.periods.includes(k));
  
  if (state.periods.includes("all") || selectedKeys.length === 0 || selectedKeys.length === allKeys.length) {
    return {
      statusLabel: "questions from all Parliaments shown",
      label: "all Parliaments",
      dates: `covers all Parliaments from ${shortDate(state.summary?.dateRange?.oldestTabled)} to ${shortDate(state.summary?.dateRange?.newestTabled)}`
    };
  }
  
  const labels = selectedKeys.map(k => PERIODS[k].label);
  let labelText = labels.join(" and ");
  if (labels.length > 2) {
    labelText = labels.slice(0, -1).join(", ") + ", and " + labels.at(-1);
  }
  
  return {
    statusLabel: `questions from selected periods shown`,
    label: labelText,
    dates: `covers selected periods (${labelText})`
  };
}

function getScopedQuestions() {
  const allKeys = Object.keys(PERIODS);
  const selectedKeys = allKeys.filter(k => state.periods.includes(k));
  
  let scoped = state.questions;
  if (!state.periods.includes("all") && selectedKeys.length > 0) {
    scoped = state.questions.filter((question) => {
      return selectedKeys.some((key) => {
        const period = PERIODS[key];
        if (question.dateTabled < period.start) return false;
        if (period.end && question.dateTabled >= period.end) return false;
        return true;
      });
    });
  }

  return scoped.filter((question) => {
    return VERTICAL_MATCH.test(question.heading || "") || VERTICAL_MATCH.test(question.questionText || "");
  });
}

function getFilteredQuestions(excludeMonth = false, excludeTopic = false, excludeParty = false, excludeRegion = false) {
  const query = state.query.trim().toLowerCase();
  const exactUin = query.match(/^(?:uin:?\s*)?(\d{2,})$/)?.[1] || "";

  return getScopedQuestions().filter((question) => {
    if (!excludeParty && state.party) {
      const party = question.member.partyAbbreviation || question.member.party || "Unknown";
      if (party !== state.party) return false;
    }

    if (!excludeRegion && state.region && question.region.nhsRegion !== state.region) return false;
    if (state.answer === "answered" && !question.answered) return false;
    if (state.answer === "unanswered" && question.answered) return false;

    if (exactUin) {
      return String(question.uin || "") === exactUin;
    }

    if (query) {
      const words = query.split(/\s+/).filter(Boolean);
      // Member name is always searchable (it's metadata, not question/answer text),
      // so "Search question text only" still lets you find a member by name.
      const questionFields = [question.heading, question.questionText, question.member?.name];
      const fields = state.searchQuestionOnly
        ? questionFields
        : [...questionFields, question.answerText];
      const textToSearch = fields.filter(Boolean).join(" ").toLowerCase();
      if (!words.every((word) => textToSearch.includes(word))) return false;
    }

    if (!excludeMonth && state.selectedMonth) {
      const m = (question.dateTabled || "").slice(0, 7);
      if (m !== state.selectedMonth) return false;
    }

    if (!excludeTopic && state.selectedTopic) {
      if (getQuestionTopic(question) !== state.selectedTopic) return false;
    }

    return true;
  });
}

function isMonthInPeriods(month) {
  if (state.periods.includes("all")) return true;
  const allKeys = Object.keys(PERIODS);
  const selectedKeys = allKeys.filter(k => state.periods.includes(k));
  if (selectedKeys.length === 0) return true;
  
  return selectedKeys.some(key => {
    const period = PERIODS[key];
    const monthStart = `${month}-01`;
    if (monthStart < period.start.slice(0, 7) + "-01") return false;
    if (period.end && monthStart >= period.end.slice(0, 7) + "-01") return false;
    return true;
  });
}

function renderMetrics(items) {
  const partyCounts = countBy(items, (question) => question.member.partyAbbreviation || question.member.party);
  const regionCounts = countBy(items, (question) => question.region.nhsRegion);
  const answered = items.filter((question) => question.answered).length;
  const newest = items.map((question) => question.dateTabled).filter(Boolean).sort().at(-1);

  elements.total.textContent = formatNumber.format(items.length);
  elements.answered.textContent = `${formatNumber.format(answered)} / ${formatNumber.format(items.length - answered)}`;
  elements.latest.textContent = shortDate(newest);
  elements.partyMetric.textContent = partyCounts[0]
    ? `${partyCounts[0].key} (${formatNumber.format(partyCounts[0].count)})`
    : "-";
  elements.regionMetric.textContent = regionCounts[0]
    ? `${regionCounts[0].key} (${formatNumber.format(regionCounts[0].count)})`
    : "-";
}

function renderScopeStatus(filteredCount) {
  if (!state.summary) return;
  const refreshed = formatGeneratedAt(state.summary.generatedAt);
  const info = getPeriodInfo();

  const filterParts = [];
  if (state.selectedTopic) {
    filterParts.push(`topic "${escapeHtml(state.selectedTopic)}"`);
  }
  if (state.party) {
    filterParts.push(`party "${escapeHtml(state.party)}"`);
  }
  if (state.region) {
    filterParts.push(`NHS region "${escapeHtml(state.region)}"`);
  }
  if (state.selectedMonth) {
    const [year, monthNum] = state.selectedMonth.split("-");
    const monthName = MONTH_NAMES[monthNum] || monthNum;
    filterParts.push(`month "${monthName} ${year}"`);
  }

  const total = formatNumber.format(state.summary.totals.questions);
  const shown = formatNumber.format(filteredCount);
  const terms = VERTICAL.plainEnglishTerms.join(", ");
  let statusText = `${total} ${VERTICAL.house} written questions to ${VERTICAL.answeringBodyLabel} mentioning ${VERTICAL.topic} (${terms}) · ${shown} shown · refreshed ${refreshed}`;

  if (filterParts.length > 0) {
    statusText += ` <span style="cursor:pointer; text-decoration:underline; font-weight:bold; margin-left:6px; color:#000000;" id="clear-filters-link">(clear filters)</span>`;
  }

  elements.status.innerHTML = statusText;
  
  let footerText = `Stored source data goes back to ${shortDate(
    state.summary.dateRange.oldestTabled,
  )} and includes DHSC plus its predecessor Department of Health. This view ${info.dates}.`;
  if (state.selectedMonth) {
    const [year, monthNum] = state.selectedMonth.split("-");
    const monthName = MONTH_NAMES[monthNum] || monthNum;
    footerText += ` Filtered to show only questions from ${monthName} ${year}.`;
  }
  if (state.selectedTopic) {
    footerText += ` Filtered to show only questions under topic "${state.selectedTopic}".`;
  }
  if (state.party) {
    footerText += ` Filtered to show only questions from party "${state.party}".`;
  }
  if (state.region) {
    footerText += ` Filtered to show only questions from NHS region "${state.region}".`;
  }
  elements.footer.textContent = footerText;

  const clearBothBtn = document.querySelector("#clear-filters-link");
  if (clearBothBtn) {
    clearBothBtn.addEventListener("click", () => {
      state.selectedMonth = "";
      state.selectedTopic = "";
      state.party = "";
      state.region = "";
      elements.partyFilter.value = "";
      elements.regionFilter.value = "";
      render();
    });
  }
}

function renderSelects() {
  const scoped = getScopedQuestions();
  const parties = countBy(scoped, (question) => question.member.partyAbbreviation || question.member.party);
  const regions = countBy(scoped, (question) => question.region.nhsRegion);

  const partyStillPresent = !state.party || parties.some((party) => party.key === state.party);
  const regionStillPresent = !state.region || regions.some((region) => region.key === state.region);
  if (!partyStillPresent) state.party = "";
  if (!regionStillPresent) state.region = "";

  elements.partyFilter.innerHTML =
    '<option value="">All parties</option>' +
    parties.map((party) => `<option value="${escapeHtml(party.key)}">${escapeHtml(party.key)}</option>`).join("");
  elements.regionFilter.innerHTML =
    '<option value="">All NHS regions</option>' +
    regions.map((region) => `<option value="${escapeHtml(region.key)}">${escapeHtml(region.key)}</option>`).join("");
  elements.partyFilter.value = state.party;
  elements.regionFilter.value = state.region;
}

const getLineProps = (pointA, pointB) => {
  const lengthX = pointB.x - pointA.x;
  const lengthY = pointB.y - pointA.y;
  return {
    length: Math.sqrt(lengthX * lengthX + lengthY * lengthY),
    angle: Math.atan2(lengthY, lengthX),
  };
};

const getControlPoint = (current, previous, next, reverse) => {
  const p = previous || current;
  const n = next || current;
  const smoothing = 0.15;
  const o = getLineProps(p, n);
  const angle = o.angle + (reverse ? Math.PI : 0);
  const length = o.length * smoothing;
  const x = current.x + Math.cos(angle) * length;
  const y = current.y + Math.sin(angle) * length;
  return [x, y];
};

const getBezierPath = (points) => {
  return points.reduce((acc, point, i, a) => {
    if (i === 0) {
      return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }
    const [cpsX, cpsY] = getControlPoint(a[i - 1], a[i - 2], point, false);
    const [cpeX, cpeY] = getControlPoint(point, a[i - 1], a[i + 1], true);
    return `${acc} C ${cpsX.toFixed(1)} ${cpsY.toFixed(1)}, ${cpeX.toFixed(1)} ${cpeY.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, "");
};

function renderLineChart(items) {
  const byMonth = new Map();
  for (const question of items) {
    if (!question.dateTabled) continue;
    const month = question.dateTabled.slice(0, 7);
    if (!byMonth.has(month)) {
      byMonth.set(month, []);
    }
    byMonth.get(month).push(question);
  }

  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!months.length) {
    state.chartPoints = [];
    elements.monthlyChart.innerHTML = '<p class="chart-note">No matching monthly data.</p>';
    elements.monthlyRange.textContent = "";
    return;
  }

  const containerWidth = elements.monthlyChart ? elements.monthlyChart.clientWidth : 0;
  const width = containerWidth > 16 ? (containerWidth - 16) : 760;
  const height = 220;
  const pad = 28;
  const max = Math.max(...months.map(([, monthQuestions]) => monthQuestions.length), 1);
  const step = months.length > 1 ? (width - pad * 2) / (months.length - 1) : 0;
  const points = months.map(([month, monthQuestions], index) => {
    const count = monthQuestions.length;
    const x = pad + index * step;
    const y = height - pad - (count / max) * (height - pad * 2);
    const themeCounts = getTopicCounts(monthQuestions).filter((t) => t.count > 0).slice(0, 5);
    return { month, count, x, y, themeCounts };
  });
  state.chartPoints = points;

  // Generate smooth spline path and area
  const path = getBezierPath(points);
  const area = points.length > 1 
    ? `${path} L ${points.at(-1).x.toFixed(1)} ${height - pad} L ${points[0].x.toFixed(1)} ${height - pad} Z`
    : "";

  // Dynamically calculate dot radius based on the number of points (longer time frames = smaller dots)
  let dotR = 4;
  if (points.length > 60) {
    dotR = 1.2;
  } else if (points.length > 30) {
    dotR = 2.0;
  } else if (points.length > 15) {
    dotR = 3.0;
  }
  const dotRActive = Math.max(3.5, dotR + 2);

  const monthTicks = [];
  const totalPoints = points.length;
  const numTicks = Math.min(6, totalPoints);
  const tickStep = totalPoints > 1 ? (totalPoints - 1) / Math.max(1, numTicks - 1) : 0;
  let lastYear = "";

  for (let i = 0; i < numTicks; i += 1) {
    const index = Math.min(totalPoints - 1, Math.round(i * tickStep));
    const point = points[index];
    const [year, monthNum] = point.month.split("-");
    const monthName = MONTH_NAMES[monthNum] || monthNum;
    const showYear = year !== lastYear ? year : "";
    lastYear = year;
    monthTicks.push({ label: monthName, x: point.x, year: showYear });
  }

  elements.monthlyRange.textContent = `${months[0][0]} to ${months.at(-1)[0]}`;
  elements.monthlyChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly dentistry PQ volume" style="--dot-r: ${dotR}px; --dot-r-active: ${dotRActive}px;">
      <line class="axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
      <line class="axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"></line>
      ${area ? `<path class="trend-area" d="${area}"></path>` : ""}
      ${path ? `<path class="trend-line" d="${path}"></path>` : ""}
      ${points
        .map(
          (point, index) => {
            const isActive = point.month === state.selectedMonth;
            return `
              <circle class="data-point${isActive ? " active" : ""}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" data-index="${index}"></circle>
            `;
          }
        )
        .join("")}
      ${monthTicks
        .map(
          (tick) => `
            <text x="${tick.x}" y="${height - 15}" text-anchor="middle" font-size="9" fill="#777">${tick.label}</text>
            ${tick.year ? `<text x="${tick.x}" y="${height - 3}" text-anchor="middle" font-size="10" font-weight="bold" fill="#333">${tick.year}</text>` : ""}
          `,
        )
        .join("")}
      <text x="${pad + 3}" y="${pad - 7}" font-size="10" fill="#666">${max}</text>
    </svg>
  `;
}

function getRowsAtLeastSnp(rows) {
  const snp = rows.find((row) => row.key === "SNP");
  if (!snp) return rows;
  return rows.filter((row) => row.count >= snp.count);
}

function renderBars(container, rows, options = {}) {
  const { limit = 10, snpFloor = false, selectedKey = "" } = options;
  const visible = (snpFloor ? getRowsAtLeastSnp(rows) : rows).slice(0, limit);
  const max = Math.max(...visible.map((row) => row.count), 1);
  container.innerHTML = visible.length
    ? visible
        .map(
          (row) => {
            const isActive = row.key === selectedKey;
            return `
              <div class="bar-row${isActive ? " active" : ""}" data-key="${escapeHtml(row.key)}">
                <span class="bar-label" title="${escapeHtml(row.key)}">${escapeHtml(row.key)}</span>
                <span class="bar-track"><span class="bar-fill" style="width:${Math.max(3, (row.count / max) * 100)}%"></span></span>
                <span class="bar-value">${formatNumber.format(row.count)}</span>
              </div>
            `;
          }
        )
        .join("")
    : '<p class="chart-note">No matching data.</p>';
}

function renderTable(items) {
  const limit = 150;
  const visible = items.slice(0, limit);
  answerByQid.clear();
  hideAnswerTip();
  elements.resultsCount.textContent = `showing ${formatNumber.format(visible.length)} of ${formatNumber.format(items.length)}`;
  
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  
  elements.table.innerHTML = visible
    .map(
      (question) => {
        const isOverdue = !question.answered && question.dateForAnswer && question.dateForAnswer < todayStr;
        let dueLabel = question.dateForAnswer ? shortDate(question.dateForAnswer) : "-";
        
        const indicators = [];
        if (question.isNamedDay) {
          indicators.push(`<span class="due-indicator named-day" title="Named Day">(ND)</span>`);
        }
        if (isOverdue) {
          indicators.push(`<span class="due-indicator overdue" title="Overdue">(O)</span>`);
        }
        
        const dueCellHtml = dueLabel + (indicators.length ? " " + indicators.join(" ") : "");

        const hasAnswer = question.answered && Boolean(question.answerText);
        if (hasAnswer) {
          answerByQid.set(String(question.id), question.answerText);
        }

        let tabledHtml = escapeHtml(shortDate(question.dateTabled));
        if (question.dateTabled === todayStr) {
          tabledHtml = `<span class="tabled-badge today" title="Tabled Today">⚡ TODAY</span>`;
        } else if (question.dateTabled === yesterdayStr) {
          tabledHtml = `<span class="tabled-badge yesterday" title="Tabled Yesterday">YESTERDAY</span>`;
        }

        return `
          <tr>
            <td><a href="${escapeHtml(question.url)}">${escapeHtml(question.uin)}</a></td>
            <td style="white-space: nowrap;">${tabledHtml}</td>
            <td style="white-space: nowrap;">${dueCellHtml}</td>
            <td><span class="party-dot" title="${escapeHtml(question.member.party || question.member.partyAbbreviation || "Unknown")}">${partyEmoji(question)}</span> ${escapeHtml(question.member.name || "-")}</td>
            <td>${escapeHtml(question.member.constituency || "-")}</td>
            <td>${escapeHtml(question.region.nhsRegion || "-")}</td>
            <td>
              <div class="question-heading">${escapeHtml(question.heading || "Written question")}</div>
              <div class="question-text">${escapeHtml(question.questionText)}</div>
              <span class="status-pill ${question.answered ? "answered" : "unanswered"}${hasAnswer ? " has-answer-tip" : ""}"${hasAnswer ? ` data-qid="${escapeHtml(String(question.id))}"` : ""}>
                <span class="status-dot ${question.answered ? "green" : "amber"}"></span>
                ${question.answered ? "answered" : "unanswered"}
              </span>
            </td>
          </tr>
        `;
      }
    )
    .join("");
}

// ── Answer hover tooltip ─────────────────────────────────────────────────────
// A single body-level (position:fixed) popup, so it escapes the table's overflow
// clipping and can be positioned anywhere in the viewport.
let answerTipPill = null;
let answerTipHideTimer = null;

// Append a string to `parent`, turning bare http(s) URLs into real, clickable links.
// Built with DOM nodes (no innerHTML), so the API-derived text can't inject markup.
function appendTextWithLinks(parent, text) {
  const urlRe = /https?:\/\/[^\s<>]+/g;
  let last = 0;
  let m;
  while ((m = urlRe.exec(text)) !== null) {
    let url = m[0];
    // Don't swallow trailing sentence punctuation into the link.
    const trailing = (url.match(/[.,;:!?)\]}'"]+$/) || [""])[0];
    if (trailing) url = url.slice(0, url.length - trailing.length);
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    const a = document.createElement("a");
    a.href = url;
    a.textContent = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    parent.appendChild(a);
    if (trailing) parent.appendChild(document.createTextNode(trailing));
    last = m.index + m[0].length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function setAnswerTipContent(text) {
  const tip = elements.answerTooltip;
  tip.textContent = "";
  // stripHtml separates paragraphs with newlines — render them as real paragraphs
  // (with spacing) rather than a wall of pre-wrapped text.
  const paras = String(text).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const blocks = paras.length ? paras : [String(text)];
  for (const p of blocks) {
    const el = document.createElement("p");
    appendTextWithLinks(el, p);
    tip.appendChild(el);
  }
}

function positionAnswerTip(pill) {
  const tip = elements.answerTooltip;
  const margin = 8;
  const gap = 8;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const r = pill.getBoundingClientRect();

  const spaceAbove = r.top - gap - margin;
  const spaceBelow = vh - r.bottom - gap - margin;
  const placeAbove = spaceAbove > spaceBelow;

  // Cap the height to the room on the chosen side so the box never overlaps the
  // pill or spills off-screen; long answers scroll inside.
  const avail = Math.max(120, placeAbove ? spaceAbove : spaceBelow);
  tip.style.maxHeight = Math.min(avail, Math.round(vh * 0.7)) + "px";

  const th = tip.offsetHeight;
  const tw = tip.offsetWidth;
  let top = placeAbove ? r.top - gap - th : r.bottom + gap;
  top = Math.max(margin, Math.min(top, vh - th - margin));
  let left = Math.min(r.left, vw - tw - margin);
  left = Math.max(margin, left);

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function showAnswerTip(pill) {
  const text = answerByQid.get(pill.getAttribute("data-qid") || "");
  if (!text) return;
  clearTimeout(answerTipHideTimer);
  answerTipPill = pill;
  setAnswerTipContent(text);
  elements.answerTooltip.scrollTop = 0;
  elements.answerTooltip.classList.add("visible");
  positionAnswerTip(pill);
}

function hideAnswerTip() {
  clearTimeout(answerTipHideTimer);
  answerTipPill = null;
  if (elements.answerTooltip) elements.answerTooltip.classList.remove("visible");
}

function scheduleHideAnswerTip() {
  clearTimeout(answerTipHideTimer);
  answerTipHideTimer = setTimeout(hideAnswerTip, 120);
}

if (elements.answerTooltip && elements.table) {
  elements.table.addEventListener("mouseover", (event) => {
    const pill = event.target.closest(".has-answer-tip");
    if (!pill || !elements.table.contains(pill)) return;
    if (pill === answerTipPill) {
      clearTimeout(answerTipHideTimer);
      return;
    }
    showAnswerTip(pill);
  });
  elements.table.addEventListener("mouseout", (event) => {
    const pill = event.target.closest(".has-answer-tip");
    if (!pill) return;
    const to = event.relatedTarget;
    if (to && (pill.contains(to) || elements.answerTooltip.contains(to))) return;
    scheduleHideAnswerTip();
  });
  // Hover intent: moving the cursor into the tooltip (to read/scroll) keeps it open.
  elements.answerTooltip.addEventListener("mouseenter", () => clearTimeout(answerTipHideTimer));
  elements.answerTooltip.addEventListener("mouseleave", scheduleHideAnswerTip);
  // Dismiss on page scroll/resize, but ignore scrolling *inside* the tooltip.
  window.addEventListener(
    "scroll",
    (event) => {
      if (event.target !== elements.answerTooltip) hideAnswerTip();
    },
    true,
  );
  window.addEventListener("resize", hideAnswerTip);
}

function render() {
  if (state.selectedMonth && !isMonthInPeriods(state.selectedMonth)) {
    state.selectedMonth = "";
  }

  const filtered = getFilteredQuestions();
  const lineChartFiltered = getFilteredQuestions(true, false, false, false);
  const themeChartFiltered = getFilteredQuestions(false, true, false, false);
  const partyChartFiltered = getFilteredQuestions(false, false, true, false);
  const regionChartFiltered = getFilteredQuestions(false, false, false, true);

  renderScopeStatus(filtered.length);
  renderMetrics(filtered);
  renderLineChart(lineChartFiltered);
  renderBars(elements.themeChart, getTopicCounts(themeChartFiltered), {
    limit: 100,
    selectedKey: state.selectedTopic
  });
  renderBars(elements.partyChart, countBy(partyChartFiltered, (question) => question.member.partyAbbreviation || question.member.party), {
    limit: 30,
    snpFloor: true,
    selectedKey: state.party
  });
  renderBars(elements.regionChart, countBy(regionChartFiltered, (question) => question.region.nhsRegion), {
    limit: 12,
    selectedKey: state.region
  });
  renderTable(filtered);
}

async function loadData() {
  // Try encrypted files first; fall back to plaintext for local dev
  const encSummaryResp = await fetch(`data/${VERTICAL.id}/summary.json.enc`, { cache: "no-store" });
  const encQuestionsResp = await fetch(`data/${VERTICAL.id}/questions.json.enc`, { cache: "no-store" });

  if (encSummaryResp.ok && encQuestionsResp.ok) {
    // Encrypted mode — need password to decrypt
    const summaryEnvelope = await encSummaryResp.json();
    const questionsEnvelope = await encQuestionsResp.json();

    while (true) {
      const password = await passwordReady;
      try {
        const [summaryJson, questionsJson] = await Promise.all([
          decryptPayload(summaryEnvelope, password),
          decryptPayload(questionsEnvelope, password),
        ]);
        state.summary = JSON.parse(summaryJson);
        const questionsPayload = JSON.parse(questionsJson);
        state.questions = questionsPayload.questions || [];

        // Success — store password for session and remove overlay
        sessionStorage.setItem("pq-auth-ok", password);
        const overlay = document.getElementById("auth-overlay");
        if (overlay) overlay.remove();
        document.querySelector(".page").style.display = "";
        return;
      } catch {
        // Wrong password — show the error and wait for a genuinely new attempt.
        const overlay = document.getElementById("auth-overlay");
        if (overlay) {
          document.getElementById("auth-error").style.display = "block";
          document.getElementById("auth-btn").textContent = "Enter";
          document.getElementById("auth-input").value = "";
          document.getElementById("auth-input").focus();
          await awaitNextPassword();
          continue;
        }
        throw new Error("Decryption failed.");
      }
    }
  }

  // Plaintext fallback (local dev without encryption)
  const [summaryResponse, questionsResponse] = await Promise.all([
    fetch(`data/${VERTICAL.id}/summary.json`, { cache: "no-store" }),
    fetch(`data/${VERTICAL.id}/questions.json`, { cache: "no-store" }),
  ]);
  if (!summaryResponse.ok || !questionsResponse.ok) {
    throw new Error("Dashboard data could not be loaded.");
  }
  state.summary = await summaryResponse.json();
  const questionsPayload = await questionsResponse.json();
  state.questions = questionsPayload.questions || [];

  // No encryption — dismiss overlay if present (cached session)
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.remove();
  document.querySelector(".page").style.display = "";
}

elements.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

for (const checkbox of elements.periodCheckboxes) {
  checkbox.addEventListener("change", (event) => {
    const value = event.target.value;
    const checked = event.target.checked;

    if (value === "all") {
      for (const cb of elements.periodCheckboxes) {
        if (cb.value !== "all") {
          cb.checked = checked;
        }
      }
    } else {
      if (!checked) {
        const allCb = [...elements.periodCheckboxes].find((cb) => cb.value === "all");
        if (allCb) allCb.checked = false;
      } else {
        const individualCbs = [...elements.periodCheckboxes].filter((cb) => cb.value !== "all");
        const allChecked = individualCbs.every((cb) => cb.checked);
        if (allChecked) {
          const allCb = [...elements.periodCheckboxes].find((cb) => cb.value === "all");
          if (allCb) allCb.checked = true;
        }
      }
    }

    state.periods = [...elements.periodCheckboxes]
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);

    renderSelects();
    render();
  });
}

if (elements.searchQuestionOnly) {
  elements.searchQuestionOnly.addEventListener("change", (event) => {
    state.searchQuestionOnly = event.target.checked;
    render();
  });
}



elements.partyFilter.addEventListener("change", (event) => {
  state.party = event.target.value;
  render();
});

elements.regionFilter.addEventListener("change", (event) => {
  state.region = event.target.value;
  render();
});

elements.answerFilter.addEventListener("change", (event) => {
  state.answer = event.target.value;
  render();
});

elements.themeChart.addEventListener("click", (event) => {
  const row = event.target.closest(".bar-row");
  if (!row) return;

  const topic = row.getAttribute("data-key");
  if (!topic) return;

  if (state.selectedTopic === topic) {
    state.selectedTopic = "";
  } else {
    state.selectedTopic = topic;
  }
  render();
});

elements.partyChart.addEventListener("click", (event) => {
  const row = event.target.closest(".bar-row");
  if (!row) return;

  const party = row.getAttribute("data-key");
  if (!party) return;

  if (state.party === party) {
    state.party = "";
  } else {
    state.party = party;
  }
  elements.partyFilter.value = state.party;
  render();
});

elements.regionChart.addEventListener("click", (event) => {
  const row = event.target.closest(".bar-row");
  if (!row) return;

  const region = row.getAttribute("data-key");
  if (!region) return;

  if (state.region === region) {
    state.region = "";
  } else {
    state.region = region;
  }
  elements.regionFilter.value = state.region;
  render();
});

elements.resetFilters.addEventListener("click", () => {
  state.query = "";
  state.party = "";
  state.region = "";
  state.answer = "";
  state.periods = ["current"];
  state.selectedMonth = "";
  state.selectedTopic = "";

  elements.search.value = "";
  if (elements.searchQuestionOnly) {
    elements.searchQuestionOnly.checked = true;
  }
  state.searchQuestionOnly = true;


  elements.partyFilter.value = "";
  elements.regionFilter.value = "";
  elements.answerFilter.value = "";

  for (const cb of elements.periodCheckboxes) {
    cb.checked = (cb.value === "current");
  }

  renderSelects();
  render();
});

elements.monthlyChart.addEventListener("mouseover", (event) => {
  const dot = event.target.closest(".data-point");
  if (!dot) return;
  const index = parseInt(dot.getAttribute("data-index"), 10);
  const point = state.chartPoints[index];
  if (!point) return;

  const [year, monthNum] = point.month.split("-");
  const monthName = MONTH_NAMES[monthNum] || monthNum;
  const titleText = `${monthName} ${year}`;

  const rowsHtml = point.themeCounts
    .map(
      (theme) => `
      <div class="chart-tooltip-row">
        <span class="chart-tooltip-label">${escapeHtml(theme.key)}</span>
        <span class="chart-tooltip-value">${formatNumber.format(theme.count)}</span>
      </div>
    `
    )
    .join("");

  elements.tooltip.innerHTML = `
    <div class="chart-tooltip-title">${titleText}</div>
    <div class="chart-tooltip-row" style="border-bottom: 1px dashed var(--line); padding-bottom: 3px; margin-bottom: 5px;">
      <span class="chart-tooltip-label" style="font-weight: bold; color: var(--text);">Total PQs</span>
      <span class="chart-tooltip-value">${formatNumber.format(point.count)}</span>
    </div>
    ${rowsHtml}
  `;
  elements.tooltip.style.opacity = "1";
});

elements.monthlyChart.addEventListener("mousemove", (event) => {
  elements.tooltip.style.left = `${event.pageX + 12}px`;
  elements.tooltip.style.top = `${event.pageY + 12}px`;
});

elements.monthlyChart.addEventListener("mouseout", (event) => {
  const dot = event.target.closest(".data-point");
  if (!dot) return;
  elements.tooltip.style.opacity = "0";
});

elements.monthlyChart.addEventListener("click", (event) => {
  event.stopPropagation(); // Prevent document click handler from immediately clearing state.selectedMonth
  if (state.chartPoints.length === 0) return;

  // Direct dot click (or programmatic test events)
  const dot = event.target.closest(".data-point");
  if (dot) {
    const index = parseInt(dot.getAttribute("data-index"), 10);
    const point = state.chartPoints[index];
    if (point) {
      if (state.selectedMonth === point.month) {
        state.selectedMonth = "";
      } else {
        state.selectedMonth = point.month;
      }
      render();
      return;
    }
  }

  // Fallback: Click anywhere on column coordinates
  const svg = elements.monthlyChart.querySelector("svg");
  if (!svg) return;

  const rect = svg.getBoundingClientRect();
  const clickXRel = event.clientX - rect.left;
  const clickYRel = event.clientY - rect.top;
  
  const viewBoxAttr = svg.getAttribute("viewBox");
  const viewBoxParts = viewBoxAttr ? viewBoxAttr.split(/\s+/) : [];
  const viewBoxWidth = viewBoxParts[2] ? parseFloat(viewBoxParts[2]) : 760;
  const viewBoxHeight = viewBoxParts[3] ? parseFloat(viewBoxParts[3]) : 220;
  
  const svgX = (clickXRel / rect.width) * viewBoxWidth;
  const svgY = (clickYRel / rect.height) * viewBoxHeight;

  const pad = 28;
  const buffer = 10;

  // Check if click is outside plot area boundaries (e.g., margins/padding)
  if (
    svgX < pad - buffer ||
    svgX > (viewBoxWidth - pad) + buffer ||
    svgY < pad - buffer ||
    svgY > (viewBoxHeight - pad) + buffer
  ) {
    state.selectedMonth = "";
    render();
    return;
  }

  let closestPoint = null;
  let minDistance = Infinity;

  for (const point of state.chartPoints) {
    const dist = Math.abs(point.x - svgX);
    if (dist < minDistance) {
      minDistance = dist;
      closestPoint = point;
    }
  }

  if (closestPoint) {
    if (svgX >= pad - 10 && svgX <= (viewBoxWidth - pad) + 10) {
      if (state.selectedMonth === closestPoint.month) {
        state.selectedMonth = "";
      } else {
        state.selectedMonth = closestPoint.month;
      }
      render();
    }
  }
});

document.addEventListener("click", (event) => {
  if (!state.selectedMonth) return;

  const isInsideChart = elements.monthlyChart.contains(event.target);
  const isInsideFilterControl = 
    (elements.search && elements.search.contains(event.target)) ||
    (elements.partyFilter && elements.partyFilter.contains(event.target)) ||
    (elements.regionFilter && elements.regionFilter.contains(event.target)) ||
    (elements.answerFilter && elements.answerFilter.contains(event.target)) ||
    (elements.searchQuestionOnly && elements.searchQuestionOnly.contains(event.target)) ||

    ([...elements.periodCheckboxes].some(cb => cb.contains(event.target))) ||
    (elements.resetFilters && elements.resetFilters.contains(event.target));

  const isClearLink = 
    event.target.id === "clear-month-filter" ||
    event.target.id === "clear-topic-filter" ||
    event.target.id === "clear-filters-link";

  if (isInsideChart || isInsideFilterControl || isClearLink) {
    return;
  }

  state.selectedMonth = "";
  render();
});

let resizeTimeout;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeTimeout);
  resizeTimeout = requestAnimationFrame(() => {
    render();
  });
});

// Apply the vertical's branding so a new version only needs config.js edits.
function applyVerticalBranding() {
  document.title = VERTICAL.brandTitle;
  const brand = document.querySelector(".brand");
  if (brand) brand.textContent = VERTICAL.brandTitle;
  const totalLabel = document.querySelector("#metric-total-label");
  if (totalLabel) totalLabel.textContent = `Total ${VERTICAL.topic} PQs`;
}
applyVerticalBranding();

loadData()
  .then(() => {
    if (elements.searchQuestionOnly) {
      elements.searchQuestionOnly.checked = state.searchQuestionOnly;
    }

    renderSelects();
    render();

    // Test hook for headless screenshots
    if (window.location.search.includes("test-tooltip=true")) {
      setTimeout(() => {
        const dot = document.querySelector(".data-point");
        if (dot) {
          const rect = dot.getBoundingClientRect();
          const clientX = rect.left + window.scrollX;
          const clientY = rect.top + window.scrollY;

          dot.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
          dot.dispatchEvent(
            new MouseEvent("mousemove", {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: clientX + 10,
              clientY: clientY + 10,
              pageX: clientX + 10,
              pageY: clientY + 10,
            })
          );
        }
      }, 50);
    } else if (window.location.search.includes("test-click=true")) {
      setTimeout(() => {
        const dot = document.querySelector(".data-point");
        if (dot) {
          dot.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        }
      }, 50);
    } else if (window.location.search.includes("test-outside-click=true")) {
      setTimeout(() => {
        const dot = document.querySelector(".data-point");
        if (dot) {
          // Select the month
          dot.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          
          // Click outside the plot area boundaries after 100ms
          setTimeout(() => {
            elements.monthlyChart.dispatchEvent(new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: 0,
              clientY: 0
            }));
          }, 100);
        }
      }, 50);
    } else if (window.location.search.includes("test-global-deselect=true")) {
      setTimeout(() => {
        const dot = document.querySelector(".data-point");
        if (dot) {
          // Select the month
          dot.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
          
          // Click document body (outside chart) after 100ms
          setTimeout(() => {
            document.body.dispatchEvent(new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window
            }));
          }, 100);
        }
      }, 50);
    } else if (window.location.search.includes("test-all-parliaments=true")) {
      setTimeout(() => {
        const allCb = [...elements.periodCheckboxes].find((cb) => cb.value === "all");
        if (allCb) {
          allCb.checked = true;
          allCb.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, 50);
    } else if (window.location.search.includes("test-topic-click=true")) {
      const row = document.querySelector('.bar-row[data-key="Access and Waiting Times"]');
      if (row) {
        row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
    } else if (window.location.search.includes("test-reset-click=true")) {
      // Set search query and some filters first
      elements.search.value = "workforce";
      elements.search.dispatchEvent(new Event("input", { bubbles: true }));
      
      const row = document.querySelector('.bar-row[data-key="Access and Waiting Times"]');
      if (row) {
        row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
      
      // Trigger reset click synchronously
      elements.resetFilters.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } else if (window.location.search.includes("test-multi-select=true")) {
      const topicRow = document.querySelector('.bar-row[data-key="COVID-19"]');
      if (topicRow) {
        topicRow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
      const partyRow = document.querySelector('.bar-row[data-key="Lab"]');
      if (partyRow) {
        partyRow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
      const regionRow = document.querySelector('.bar-row[data-key="London"]');
      if (regionRow) {
        regionRow.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
    }
  })
  .catch((error) => {
    console.error(error);
    elements.status.textContent = "Could not load dashboard data from this repo.";
  });


