const state = {
  questions: [],
  summary: null,
  query: "",
  party: "",
  region: "",
  answer: "",
  periods: ["current"],
  searchAnswerMatch: false,
  chartPoints: [],
  selectedMonth: "",
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
  searchAnswerMatch: document.querySelector("#search-answer-match"),
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
};

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getThemeCounts(questions, preferredMonth = "") {
  const monthlyRows = state.summary?.topics?.byMonth?.[preferredMonth];
  if (preferredMonth && Array.isArray(monthlyRows) && monthlyRows.length) {
    return monthlyRows.map((row) => ({ key: row.label || row.key, count: row.count }));
  }

  const months = [...new Set(questions.map((q) => (q.dateTabled || "").slice(0, 7)).filter(Boolean))];
  const merged = new Map();
  for (const month of months) {
    const rows = state.summary?.topics?.byMonth?.[month] || [];
    for (const row of rows) {
      const label = row.label || row.key;
      merged.set(label, (merged.get(label) || 0) + (row.count || 0));
    }
  }
  return [...merged.entries()]
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
    const heading = (question.heading || "").toLowerCase();
    const questionTextVal = (question.questionText || "").toLowerCase();
    
    if (heading.includes("dent") || questionTextVal.includes("dent")) {
      return true;
    }
    
    if (state.searchAnswerMatch) {
      const answer = (question.answerText || "").toLowerCase();
      if (answer.includes("dent")) {
        return true;
      }
    }
    
    return false;
  });
}

function getFilteredQuestions(excludeMonth = false) {
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
      const words = query.split(/\s+/).filter(Boolean);
      const textToSearch = questionText(question);
      if (!words.every((word) => textToSearch.includes(word))) return false;
    }

    if (!excludeMonth && state.selectedMonth) {
      const m = (question.dateTabled || "").slice(0, 7);
      if (m !== state.selectedMonth) return false;
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
  const generated = shortDate(state.summary.generatedAt?.slice(0, 10));
  const info = getPeriodInfo();

  let statusText = `${formatNumber.format(filteredCount)} ${info.statusLabel}`;
  if (state.selectedMonth) {
    const [year, monthNum] = state.selectedMonth.split("-");
    const monthName = MONTH_NAMES[monthNum] || monthNum;
    statusText = `${formatNumber.format(filteredCount)} questions from ${monthName} ${year} shown <span style="cursor:pointer; text-decoration:underline; color:var(--orange); font-weight:bold; margin-left:6px;" id="clear-month-filter">(clear filter)</span>`;
  }

  elements.status.innerHTML = `<span class="pulsing-dot"></span>${statusText} &middot; ${formatNumber.format(
    state.summary.totals.questions,
  )} total stored questions &middot; refreshed ${generated}`;
  
  let footerText = `Stored source data goes back to ${shortDate(
    state.summary.dateRange.oldestTabled,
  )} and includes DHSC plus its predecessor Department of Health. This view ${info.dates}.`;
  if (state.selectedMonth) {
    const [year, monthNum] = state.selectedMonth.split("-");
    const monthName = MONTH_NAMES[monthNum] || monthNum;
    footerText += ` Filtered to show only questions from ${monthName} ${year}.`;
  }
  elements.footer.textContent = footerText;

  const clearBtn = document.querySelector("#clear-month-filter");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      state.selectedMonth = "";
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

  const width = 760;
  const height = 230;
  const pad = 28;
  const max = Math.max(...months.map(([, monthQuestions]) => monthQuestions.length), 1);
  const step = months.length > 1 ? (width - pad * 2) / (months.length - 1) : 0;
  const points = months.map(([month, monthQuestions], index) => {
    const count = monthQuestions.length;
    const x = pad + index * step;
    const y = height - pad - (count / max) * (height - pad * 2);
    const themeCounts = getThemeCounts(monthQuestions, month);
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
  const { limit = 10, snpFloor = false } = options;
  const visible = (snpFloor ? getRowsAtLeastSnp(rows) : rows).slice(0, limit);
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
            <span class="status-pill ${question.answered ? "answered" : "unanswered"}">
              <span class="status-dot ${question.answered ? "green" : "amber"}"></span>
              ${question.answered ? "answered" : "unanswered"}
            </span>
          </td>
        </tr>
      `,
    )
    .join("");
}

function render() {
  if (state.selectedMonth && !isMonthInPeriods(state.selectedMonth)) {
    state.selectedMonth = "";
  }

  const filtered = getFilteredQuestions();
  const lineChartFiltered = getFilteredQuestions(true);

  renderScopeStatus(filtered.length);
  renderMetrics(filtered);
  renderLineChart(lineChartFiltered);
  renderBars(elements.themeChart, getThemeCounts(filtered, state.selectedMonth), { limit: 5 });
  renderBars(elements.partyChart, countBy(filtered, (question) => question.member.partyAbbreviation || question.member.party), {
    limit: 30,
    snpFloor: true,
  });
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

elements.searchAnswerMatch.addEventListener("change", (event) => {
  state.searchAnswerMatch = event.target.checked;
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
  const viewBoxWidth = 760;
  
  const svgX = (clickXRel / rect.width) * viewBoxWidth;

  const pad = 28;

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
    // Allow clicking month labels and any point within the chart SVG width.
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
    (elements.searchAnswerMatch && elements.searchAnswerMatch.contains(event.target)) ||
    ([...elements.periodCheckboxes].some(cb => cb.contains(event.target)));

  const isClearLink = event.target.id === "clear-month-filter";

  if (isInsideChart || isInsideFilterControl || isClearLink) {
    return;
  }

  state.selectedMonth = "";
  render();
});

loadData()
  .then(() => {
    elements.searchAnswerMatch.checked = state.searchAnswerMatch;
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
    }
  })
  .catch((error) => {
    console.error(error);
    elements.status.textContent = "Could not load dashboard data from this repo.";
  });
