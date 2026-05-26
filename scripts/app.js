const state = {
  questions: [],
  summary: null,
  query: "",
  party: "",
  region: "",
  answer: "",
  includeFrom2023: false,
  searchQuestionOnly: false,
  minMps: "2",
  partyChartMode: "absolute",
};

const CURRENT_PARLIAMENT_START = "2024-07-09";
const EXTENDED_RESULTS_START = "2023-01-01";

const PARTY_SEATS_2024 = {
  Lab: 411,
  Con: 121,
  LD: 72,
  SNP: 9,
  SF: 7,
  RUK: 5,
  DUP: 5,
  Green: 4,
  PC: 4,
  SDLP: 2,
  APNI: 1,
  UUP: 1,
  TUV: 1,
  Ind: 7,
};

const PARTY_SEATS_2019 = {
  Con: 365,
  Lab: 202,
  SNP: 48,
  LD: 11,
  DUP: 8,
  PC: 4,
  SDLP: 2,
  Green: 1,
  APNI: 1,
  UUP: 0,
  TUV: 0,
  SF: 7,
  Ind: 9,
};

function getPartySeats(partyKey) {
  const seats2024 = PARTY_SEATS_2024[partyKey];
  const seats2019 = PARTY_SEATS_2019[partyKey];
  if (seats2024 === undefined && seats2019 === undefined) {
    return 1;
  }
  if (!state.includeFrom2023) {
    return seats2024 || 1;
  }
  const s24 = seats2024 !== undefined ? seats2024 : 1;
  const s19 = seats2019 !== undefined ? seats2019 : 1;
  return (s24 + s19) / 2;
}

const elements = {
  status: document.querySelector("#data-status"),
  total: document.querySelector("#metric-total"),
  answered: document.querySelector("#metric-answered"),
  latest: document.querySelector("#metric-latest"),
  partyMetric: document.querySelector("#metric-party"),
  regionMetric: document.querySelector("#metric-region"),
  search: document.querySelector("#search"),
  include2023: document.querySelector("#include-2023"),
  searchQuestionOnly: document.querySelector("#search-question-only"),
  partyFilter: document.querySelector("#party-filter"),
  regionFilter: document.querySelector("#region-filter"),
  answerFilter: document.querySelector("#answer-filter"),
  monthlyRange: document.querySelector("#monthly-range"),
  monthlyChart: document.querySelector("#monthly-chart"),
  partyChart: document.querySelector("#party-chart"),
  regionChart: document.querySelector("#region-chart"),
  minMps: document.querySelector("#min-mps-filter"),
  partyChartMode: document.querySelector("#party-chart-mode"),
  resultsCount: document.querySelector("#results-count"),
  table: document.querySelector("#question-table"),
  footer: document.querySelector("#data-footer"),
};

const formatNumber = new Intl.NumberFormat("en-GB");
const formatDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shortDate(value) {
  const date = parseDate(value);
  return date ? formatDate.format(date) : "-";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    question.member.name,
    question.member.party,
    question.member.partyAbbreviation,
    question.member.constituency,
    question.region.nhsRegion,
    question.region.nation,
  ]
    .join(" ")
    .toLowerCase();
}

function getScopeStart() {
  return state.includeFrom2023 ? EXTENDED_RESULTS_START : CURRENT_PARLIAMENT_START;
}

function getScopedQuestions() {
  const start = getScopeStart();
  return state.questions.filter((question) => question.dateTabled >= start);
}

function getFilteredQuestions() {
  const query = state.query.trim().toLowerCase();
  const exactUin = query.match(/^(?:uin:?\s*)?(\d{2,})$/)?.[1] || "";

  return getScopedQuestions().filter((question) => {
    if (state.party) {
      const party = question.member.partyAbbreviation || question.member.party || "Unknown";
      if (party !== state.party) return false;
    }

    if (state.region && question.region.nhsRegion !== state.region) return false;
    if (state.answer === "answered" && !question.answered) return false;
    if (state.answer === "unanswered" && question.answered) return false;

    if (exactUin) {
      return String(question.uin || "") === exactUin;
    }

    if (query) {
      if (state.searchQuestionOnly) {
        const textToSearch = (question.questionText || "").toLowerCase();
        if (!textToSearch.includes(query)) return false;
      } else {
        if (!questionText(question).includes(query)) return false;
      }
    }
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
  const generated = shortDate(state.summary.generatedAt?.slice(0, 10));
  const scopeStart = state.includeFrom2023 ? EXTENDED_RESULTS_START : CURRENT_PARLIAMENT_START;
  const scopeLabel = state.includeFrom2023 ? "questions from 2023 shown" : "current Parliament questions shown";
  elements.status.textContent = `${formatNumber.format(filteredCount)} ${scopeLabel} · ${formatNumber.format(
    state.summary.totals.questions,
  )} committed questions · refreshed ${generated}`;
  elements.footer.textContent = `Committed source data goes back to ${shortDate(
    state.summary.dateRange.oldestTabled,
  )}; this view includes questions tabled from ${shortDate(scopeStart)}.`;
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
    parties
      .map((party) => `<option value="${escapeHtml(party.key)}">${escapeHtml(party.key)} (${party.count})</option>`)
      .join("");
  elements.regionFilter.innerHTML =
    '<option value="">All NHS regions</option>' +
    regions
      .map((region) => `<option value="${escapeHtml(region.key)}">${escapeHtml(region.key)} (${region.count})</option>`)
      .join("");
  elements.partyFilter.value = state.party;
  elements.regionFilter.value = state.region;
}

function renderLineChart(items) {
  const byMonth = new Map();
  for (const question of items) {
    if (!question.dateTabled) continue;
    const month = question.dateTabled.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) || 0) + 1);
  }

  const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!months.length) {
    elements.monthlyChart.innerHTML = '<p class="chart-note">No matching monthly data.</p>';
    elements.monthlyRange.textContent = "";
    return;
  }

  const width = 760;
  const height = 220;
  const pad = 24;
  const max = Math.max(...months.map(([, count]) => count), 1);
  const step = months.length > 1 ? (width - pad * 2) / (months.length - 1) : 0;
  const points = months.map(([month, count], index) => {
    const x = pad + index * step;
    const y = height - pad - (count / max) * (height - pad * 2);
    return { month, count, x, y };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${path} L${points.at(-1).x.toFixed(1)} ${height - pad} L${points[0].x.toFixed(1)} ${height - pad} Z`;
  const yearTicks = [];
  const monthTicks = [];
  let seenYear = "";

  for (const point of points) {
    const [year, month] = point.month.split("-");
    if (year !== seenYear) {
      yearTicks.push({ year, x: point.x });
      seenYear = year;
    }
    monthTicks.push({
      label: month,
      x: point.x,
    });
  }

  elements.monthlyRange.textContent = `${months[0][0]} to ${months.at(-1)[0]}`;
  elements.monthlyChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly dentistry PQ volume">
      <line class="axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
      <line class="axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"></line>
      <path class="trend-area" d="${area}"></path>
      <path class="trend-line" d="${path}"></path>
      ${monthTicks
        .filter((_, index) => index % Math.max(1, Math.ceil(monthTicks.length / 14)) === 0)
        .map(
          (tick) =>
            `<text x="${tick.x}" y="${height - 12}" text-anchor="middle" font-size="9" fill="#777">${tick.label}</text>`,
        )
        .join("")}
      ${yearTicks
        .map(
          (tick) =>
            `<text x="${tick.x}" y="${height - 1}" text-anchor="start" font-size="10" fill="#555">${tick.year}</text>`,
        )
        .join("")}
      <text x="${pad + 3}" y="${pad - 7}" font-size="10" fill="#666">${max}</text>
    </svg>
  `;
}

function renderPartyChart(filtered) {
  const rows = countBy(filtered, (question) => question.member.partyAbbreviation || question.member.party);
  const processed = rows.map((row) => {
    const seats = getPartySeats(row.key);
    const ratio = row.count / seats;
    return { ...row, seats, ratio };
  });

  const minMps = Number(state.minMps) || 0;
  let visible = processed.filter((row) => row.seats >= minMps);

  const isRatio = state.partyChartMode === "ratio";
  if (isRatio) {
    visible.sort((a, b) => b.ratio - a.ratio || a.key.localeCompare(b.key));
  } else {
    visible.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }

  visible = visible.slice(0, 30);
  const max = Math.max(...visible.map((row) => isRatio ? row.ratio : row.count), 1);

  elements.partyChart.innerHTML = visible.length
    ? visible
        .map(
          (row) => {
            const val = isRatio ? row.ratio : row.count;
            const displayVal = isRatio ? val.toFixed(1) : formatNumber.format(val);
            const titleText = isRatio 
              ? `${escapeHtml(row.key)}: ${formatNumber.format(row.count)} questions / ${row.seats.toFixed(1)} seats = ${displayVal} per MP`
              : `${escapeHtml(row.key)}: ${displayVal} questions`;
            return `
              <div class="bar-row" title="${titleText}">
                <span class="bar-label" title="${escapeHtml(row.key)}">${escapeHtml(row.key)}</span>
                <span class="bar-track">
                  <span class="bar-fill" style="width:${Math.max(3, (val / max) * 100)}%"></span>
                </span>
                <span class="bar-value">${displayVal}</span>
              </div>
            `;
          }
        )
        .join("")
    : '<p class="chart-note">No matching data.</p>';
}

function renderBars(container, rows, options = {}) {
  const { limit = 10 } = options;
  const visible = rows.slice(0, limit);
  const max = Math.max(...visible.map((row) => row.count), 1);
  container.innerHTML = visible.length
    ? visible
        .map(
          (row) => `
            <div class="bar-row">
              <span class="bar-label" title="${escapeHtml(row.key)}">${escapeHtml(row.key)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${Math.max(3, (row.count / max) * 100)}%"></span></span>
              <span class="bar-value">${formatNumber.format(row.count)}</span>
            </div>
          `,
        )
        .join("")
    : '<p class="chart-note">No matching data.</p>';
}

function renderTable(items) {
  const limit = 150;
  const visible = items.slice(0, limit);
  elements.resultsCount.textContent = `showing ${formatNumber.format(visible.length)} of ${formatNumber.format(items.length)}`;
  elements.table.innerHTML = visible
    .map(
      (question) => `
        <tr>
          <td><a href="${escapeHtml(question.url)}">${escapeHtml(question.uin)}</a></td>
          <td>${escapeHtml(shortDate(question.dateTabled))}</td>
          <td>${escapeHtml(question.member.name || "-")}</td>
          <td>${escapeHtml(question.member.partyAbbreviation || question.member.party || "-")}</td>
          <td>${escapeHtml(question.member.constituency || "-")}</td>
          <td>${escapeHtml(question.region.nhsRegion || "-")}</td>
          <td>
            <div class="question-heading">${escapeHtml(question.heading || "Written question")}</div>
            <div class="question-text">${escapeHtml(question.questionText).slice(0, 220)}${question.questionText.length > 220 ? "..." : ""}</div>
            <span class="status-pill">${question.answered ? "answered" : "unanswered"}</span>
          </td>
        </tr>
      `,
    )
    .join("");
}

function render() {
  const filtered = getFilteredQuestions();
  renderScopeStatus(filtered.length);
  renderMetrics(filtered);
  renderLineChart(filtered);
  renderPartyChart(filtered);
  renderBars(elements.regionChart, countBy(filtered, (question) => question.region.nhsRegion), { limit: 12 });
  renderTable(filtered);
}

async function loadData() {
  const [summaryResponse, questionsResponse] = await Promise.all([
    fetch("data/summary.json", { cache: "no-store" }),
    fetch("data/questions.json", { cache: "no-store" }),
  ]);

  if (!summaryResponse.ok || !questionsResponse.ok) {
    throw new Error("Dashboard data could not be loaded.");
  }

  state.summary = await summaryResponse.json();
  const questionsPayload = await questionsResponse.json();
  state.questions = questionsPayload.questions || [];

}

elements.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

elements.include2023.addEventListener("change", (event) => {
  state.includeFrom2023 = event.target.checked;
  renderSelects();
  render();
});

elements.searchQuestionOnly.addEventListener("change", (event) => {
  state.searchQuestionOnly = event.target.checked;
  render();
});

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

elements.minMps.addEventListener("change", (event) => {
  state.minMps = event.target.value;
  render();
});

elements.partyChartMode.addEventListener("change", (event) => {
  state.partyChartMode = event.target.value;
  render();
});

loadData()
  .then(() => {
    elements.minMps.value = state.minMps;
    elements.partyChartMode.value = state.partyChartMode;
    elements.searchQuestionOnly.checked = state.searchQuestionOnly;
    renderSelects();
    render();
  })
  .catch((error) => {
    console.error(error);
    elements.status.textContent = "Could not load dashboard data from this repo.";
  });
