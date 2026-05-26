#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");

const QUESTIONS_ENDPOINT =
  "https://questions-statements-api.parliament.uk/api/writtenquestions/questions";
const DETAIL_BASE = "https://questions-statements.parliament.uk/written-questions/detail";
const CONSTITUENCY_CSV =
  "https://pages.mysociety.org/2025-constituencies/data/parliament_con_2025/latest/parl_constituencies_2025.csv";
const CONSTITUENCY_2020_CSV =
  "https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/0dbc00e2529e42b1807e04ddb1da6df5/csv?layers=0";
const PARL10_TO_PARL25_CSV =
  "https://pages.mysociety.org/2025-constituencies/data/geographic_overlaps/latest/PARL10_PARL25_combo_overlap.csv";

const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);
const SOURCE_PARAMS = {
  house: "Commons",
  answeringBodies: "17",
  answered: "Any",
  includeWithdrawn: "false",
  expandMember: "true",
  searchTerm: "dent*",
};

const NHS_REGION_BY_PARLIAMENT_REGION = new Map([
  ["eastern", "East of England"],
  ["east of england", "East of England"],
  ["london", "London"],
  ["north east", "North East and Yorkshire"],
  ["yorkshire and the humber", "North East and Yorkshire"],
  ["yorkshire and the humber region", "North East and Yorkshire"],
  ["north west", "North West"],
  ["east midlands", "Midlands"],
  ["west midlands", "Midlands"],
  ["south east", "South East"],
  ["south west", "South West"],
]);

const DEVOLVED_NATIONS = new Set(["Scotland", "Wales", "Northern Ireland"]);

function normaliseName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows
    .filter((cells) => cells.length && cells.some(Boolean))
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])),
    );
}

async function fetchJson(url, tries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < tries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      }
    }
  }
  throw lastError;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${url}`);
  }
  return response.text();
}

async function fetchQuestions() {
  const all = [];
  let total = null;

  for (let skip = 0; total === null || skip < total; skip += PAGE_SIZE) {
    const params = new URLSearchParams({
      ...SOURCE_PARAMS,
      take: String(PAGE_SIZE),
      skip: String(skip),
    });
    const url = `${QUESTIONS_ENDPOINT}?${params}`;
    const payload = await fetchJson(url);
    const pageItems = payload.results || [];

    total = Number(payload.totalResults || pageItems.length || 0);
    all.push(...pageItems);
    console.log(`Fetched ${all.length.toLocaleString()} / ${total.toLocaleString()} questions`);

    if (!pageItems.length) {
      break;
    }
  }

  return all;
}

function getQuestion(item) {
  return item.value || item;
}

async function buildConstituencyLookup() {
  const [csv2025, csv2020, overlapCsv] = await Promise.all([
    fetchText(CONSTITUENCY_CSV),
    fetchText(CONSTITUENCY_2020_CSV),
    fetchText(PARL10_TO_PARL25_CSV),
  ]);
  const rows = parseCsv(csv2025);
  const lookup = new Map();
  const byShortCode = new Map();
  const records = [];

  for (const row of rows) {
    const nation = row.nation || "Unknown";
    const region = row.region || "";
    const nhsRegion = DEVOLVED_NATIONS.has(nation)
      ? nation
      : NHS_REGION_BY_PARLIAMENT_REGION.get(normaliseName(region)) || "Unknown";
    const record = {
      name: row.name,
      shortCode: row.short_code,
      gssCode: row.gss_code,
      nation,
      parliamentaryRegion: region,
      nhsRegion,
      sourceBoundary: "2024",
    };

    records.push(record);
    byShortCode.set(row.short_code, record);
    lookup.set(normaliseName(row.name), record);
  }

  const overlapBy2010Code = new Map();
  for (const row of parseCsv(overlapCsv)) {
    const current = overlapBy2010Code.get(row.PARL10);
    const overlap = Number(row.percentage_overlap_pop || row.percentage_overlap_area || 0);
    if (!current || overlap > current.overlap) {
      overlapBy2010Code.set(row.PARL10, {
        targetCode: row.PARL25,
        overlap,
      });
    }
  }

  for (const row of parseCsv(csv2020)) {
    const name = row.PCON20NM;
    const target = overlapBy2010Code.get(row.PCON20CD);
    const mapped = target ? byShortCode.get(target.targetCode) : null;
    if (!name || !mapped) continue;

    lookup.set(normaliseName(name), {
      name,
      shortCode: row.PCON20CD,
      gssCode: row.PCON20CD,
      nation: mapped.nation,
      parliamentaryRegion: mapped.parliamentaryRegion,
      nhsRegion: mapped.nhsRegion,
      sourceBoundary: "2010 mapped to 2024",
      mappedToConstituency: mapped.name,
      mappedToShortCode: mapped.shortCode,
      overlap: target.overlap,
    });
  }

  return { lookup, records };
}

function mapQuestion(item, constituencyLookup) {
  const q = getQuestion(item);
  const member = q.askingMember || {};
  const constituency = member.memberFrom || "";
  const regionRecord = constituencyLookup.get(normaliseName(constituency));
  const dateTabled = q.dateTabled ? q.dateTabled.slice(0, 10) : "";
  const dateAnswered = q.dateAnswered ? q.dateAnswered.slice(0, 10) : "";

  return {
    id: q.id,
    uin: q.uin,
    url: dateTabled && q.uin ? `${DETAIL_BASE}/${dateTabled}/${q.uin}` : "",
    heading: q.heading || "",
    questionText: stripHtml(q.questionText),
    answerText: stripHtml(q.answerText),
    dateTabled,
    dateAnswered,
    dateForAnswer: q.dateForAnswer ? q.dateForAnswer.slice(0, 10) : "",
    answered: Boolean(dateAnswered),
    answeringBodyName: q.answeringBodyName || "Department of Health and Social Care",
    isNamedDay: Boolean(q.isNamedDay),
    member: {
      id: member.id || null,
      name: member.name || "",
      party: member.party || "",
      partyAbbreviation: member.partyAbbreviation || "",
      constituency,
    },
    region: {
      constituency,
      nation: regionRecord?.nation || "Unknown",
      parliamentaryRegion: regionRecord?.parliamentaryRegion || "",
      nhsRegion: regionRecord?.nhsRegion || "Unknown",
      sourceBoundary: regionRecord?.sourceBoundary || "unmatched",
      mappedToConstituency: regionRecord?.mappedToConstituency || "",
    },
  };
}

function increment(map, key, amount = 1) {
  const cleanKey = key || "Unknown";
  map.set(cleanKey, (map.get(cleanKey) || 0) + amount);
}

function sortedCounts(map) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function buildSummary(questions, constituencyRecords, unmatchedConstituencies) {
  const partyCounts = new Map();
  const partyNames = new Map();
  const regionCounts = new Map();
  const memberCounts = new Map();
  const monthly = new Map();
  let answered = 0;

  for (const question of questions) {
    if (question.answered) answered += 1;

    const partyKey = question.member.partyAbbreviation || question.member.party || "Unknown";
    increment(partyCounts, partyKey);
    if (question.member.party) partyNames.set(partyKey, question.member.party);
    increment(regionCounts, question.region.nhsRegion);
    increment(memberCounts, question.member.name || "Unknown");

    const month = question.dateTabled ? question.dateTabled.slice(0, 7) : "Unknown";
    if (!monthly.has(month)) {
      monthly.set(month, {
        month,
        total: 0,
        answered: 0,
        unanswered: 0,
        byParty: {},
        byRegion: {},
      });
    }
    const bucket = monthly.get(month);
    bucket.total += 1;
    bucket[question.answered ? "answered" : "unanswered"] += 1;
    bucket.byParty[partyKey] = (bucket.byParty[partyKey] || 0) + 1;
    bucket.byRegion[question.region.nhsRegion] =
      (bucket.byRegion[question.region.nhsRegion] || 0) + 1;
  }

  const dates = questions.map((question) => question.dateTabled).filter(Boolean).sort();
  const parties = sortedCounts(partyCounts).map((party) => ({
    ...party,
    name: partyNames.get(party.key) || party.key,
  }));

  return {
    generatedAt: new Date().toISOString(),
    source: {
      questionsEndpoint: QUESTIONS_ENDPOINT,
      constituencySource: CONSTITUENCY_CSV,
      historicConstituencySource: CONSTITUENCY_2020_CSV,
      constituencyOverlapSource: PARL10_TO_PARL25_CSV,
      params: SOURCE_PARAMS,
    },
    totals: {
      questions: questions.length,
      answered,
      unanswered: questions.length - answered,
      constituenciesInLookup: constituencyRecords.length,
      unmatchedConstituencies: unmatchedConstituencies.length,
    },
    dateRange: {
      oldestTabled: dates[0] || "",
      newestTabled: dates.at(-1) || "",
    },
    parties,
    regions: sortedCounts(regionCounts),
    topMembers: sortedCounts(memberCounts).slice(0, 20),
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    unmatchedConstituencies,
  };
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  const [{ lookup, records: constituencyRecords }, rawQuestions] = await Promise.all([
    buildConstituencyLookup(),
    fetchQuestions(),
  ]);

  const questions = rawQuestions
    .map((item) => mapQuestion(item, lookup))
    .sort((a, b) => {
      const dateCompare = b.dateTabled.localeCompare(a.dateTabled);
      if (dateCompare) return dateCompare;
      return String(b.uin || "").localeCompare(String(a.uin || ""));
    });

  const unmatchedConstituencies = [
    ...new Set(
      questions
        .filter((question) => question.region.nhsRegion === "Unknown")
        .map((question) => question.member.constituency)
        .filter(Boolean),
    ),
  ].sort();

  const summary = buildSummary(questions, constituencyRecords, unmatchedConstituencies);

  await writeFile(
    path.join(dataDir, "questions.json"),
    `${JSON.stringify({ questions })}\n`,
    "utf8",
  );
  await writeFile(
    path.join(dataDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(dataDir, "constituency-regions.json"),
    `${JSON.stringify({ generatedAt: summary.generatedAt, source: CONSTITUENCY_CSV, constituencies: constituencyRecords }, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Wrote ${questions.length.toLocaleString()} questions, ${summary.dateRange.oldestTabled} to ${summary.dateRange.newestTabled}`,
  );
  if (unmatchedConstituencies.length) {
    console.log(`Unmatched constituencies: ${unmatchedConstituencies.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
