#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const TOPIC_TAXONOMY_PATH = path.join(dataDir, "topic-taxonomy.json");

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
const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "as", "at", "be", "been", "being", "by", "for", "from", "has",
  "have", "how", "in", "into", "is", "it", "its", "of", "on", "or", "that", "the", "their", "them",
  "there", "these", "this", "those", "to", "was", "were", "what", "when", "where", "which", "who",
  "why", "will", "with", "would", "could", "should", "department", "health", "social", "care",
  "asked", "ask", "minister", "state", "secretary", "whether", "if", "made", "make", "plans",
  "plan", "number", "many", "dentistry", "dental", "dentist", "dentists",
]);
const TOPIC_WINDOW_MONTHS = 6;
const TOPIC_MIN_COUNT = 3;
const TOPIC_LIMIT = 8;
const POLICY_TERMS = [
  "nhs",
  "contract",
  "uda",
  "workforce",
  "recruit",
  "retain",
  "waiting",
  "access",
  "appointment",
  "charge",
  "afford",
  "fluor",
  "prevention",
  "oral health",
  "children",
  "commission",
  "icb",
  "covid",
  "pandemic",
  "training",
  "education",
  "dent",
];

function simpleHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toTopicText(question) {
  return `${question.heading || ""} ${question.questionText || ""}`.toLowerCase();
}

function normaliseTopicToken(token) {
  return token.replace(/[^a-z0-9-]+/g, "").replace(/^-+|-+$/g, "");
}

function extractTopicPhrases(text) {
  const rawTokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .map(normaliseTopicToken)
    .filter(Boolean);

  const tokens = rawTokens.filter(
    (token) => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token),
  );
  const phrases = new Set();
  for (let i = 0; i < tokens.length; i += 1) {
    const one = tokens[i];
    if (!STOPWORDS.has(one)) phrases.add(one);
    if (i + 1 < tokens.length) {
      const two = `${tokens[i]} ${tokens[i + 1]}`;
      if (!STOPWORDS.has(tokens[i]) && !STOPWORDS.has(tokens[i + 1])) phrases.add(two);
    }
    if (i + 2 < tokens.length) {
      const three = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
      if (!STOPWORDS.has(tokens[i]) && !STOPWORDS.has(tokens[i + 1]) && !STOPWORDS.has(tokens[i + 2])) {
        phrases.add(three);
      }
    }
  }
  return [...phrases];
}

function normaliseForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function loadTopicTaxonomy() {
  const raw = await readFile(TOPIC_TAXONOMY_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const concepts = (parsed.concepts || []).map((concept) => ({
    label: concept.label,
    aliases: (concept.aliases || []).map(normaliseForMatch).filter(Boolean),
  }));
  return {
    version: parsed.version || "unknown",
    concepts,
  };
}

function matchQuestionConcepts(normalisedText, taxonomy) {
  const hits = [];
  for (const concept of taxonomy.concepts) {
    if (concept.aliases.some((alias) => alias && normalisedText.includes(alias))) {
      hits.push(concept.label);
    }
  }
  return hits;
}

function buildMonthFingerprint(monthQuestions) {
  const canonical = monthQuestions
    .map((q) => `${q.id}|${q.uin}|${q.dateTabled}|${simpleHash(toTopicText(q))}`)
    .sort()
    .join("||");
  return simpleHash(canonical);
}

function previousMonths(month, orderedMonths, count) {
  const idx = orderedMonths.indexOf(month);
  if (idx <= 0) return [];
  return orderedMonths.slice(Math.max(0, idx - count), idx);
}

function computeMonthlyTopics(month, monthConceptCounts, monthTotals, orderedMonths) {
  const conceptCounts = monthConceptCounts.get(month) || new Map();
  const monthTotal = monthTotals.get(month) || 1;
  const trailingMonths = previousMonths(month, orderedMonths, TOPIC_WINDOW_MONTHS);

  const rows = [];
  for (const [label, count] of conceptCounts.entries()) {
    if (count < TOPIC_MIN_COUNT) continue;
    const volumeScore = count / monthTotal;

    let baselineAvg = 0;
    if (trailingMonths.length) {
      const trailingCounts = trailingMonths.map((m) => monthConceptCounts.get(m)?.get(label) || 0);
      baselineAvg = trailingCounts.reduce((sum, value) => sum + value, 0) / trailingCounts.length;
    }
    const spikeScore = (count + 1) / (baselineAvg + 1);
    const score = volumeScore * 0.6 + Math.log1p(spikeScore) * 0.4;

    rows.push({
      label,
      count,
      score: Number(score.toFixed(6)),
      volumeScore: Number(volumeScore.toFixed(6)),
      spikeScore: Number(spikeScore.toFixed(6)),
    });
  }

  return rows
    .sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, TOPIC_LIMIT);
}

async function loadPreviousSummary() {
  try {
    const payload = await readFile(path.join(dataDir, "summary.json"), "utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

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

function buildSummary(
  questions,
  constituencyRecords,
  unmatchedConstituencies,
  taxonomy,
  previousSummary = null,
) {
  const partyCounts = new Map();
  const partyNames = new Map();
  const regionCounts = new Map();
  const memberCounts = new Map();
  const monthly = new Map();
  const monthQuestions = new Map();
  const monthConceptCounts = new Map();
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
    if (!monthQuestions.has(month)) monthQuestions.set(month, []);
    monthQuestions.get(month).push(question);
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
  const sortedMonthlyRows = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month));
  const orderedMonths = sortedMonthlyRows.map((m) => m.month);

  for (const month of orderedMonths) {
    const counts = new Map();
    for (const q of monthQuestions.get(month) || []) {
      if (q.topic && q.topic !== "General") {
        counts.set(q.topic, (counts.get(q.topic) || 0) + 1);
      }
    }
    monthConceptCounts.set(month, counts);
  }

  const prevTopics = previousSummary?.topics || {};
  const prevFingerprints = prevTopics.monthFingerprints || {};
  const prevByMonth = prevTopics.byMonth || {};
  const prevMethodMatches =
    prevTopics.method === "taxonomy-plus-trends" && prevTopics.taxonomyVersion === taxonomy.version;
  const monthFingerprints = {};
  const byMonth = {};
  const monthTotals = new Map(sortedMonthlyRows.map((row) => [row.month, row.total]));

  for (const month of orderedMonths) {
    const fingerprint = buildMonthFingerprint(monthQuestions.get(month) || []);
    monthFingerprints[month] = fingerprint;
    const unchanged = prevMethodMatches && prevFingerprints[month] && prevFingerprints[month] === fingerprint;
    const previousRows = prevByMonth[month];
    const previousShapeValid =
      Array.isArray(previousRows) && previousRows.every((row) => typeof row?.label === "string");
    if (unchanged && previousShapeValid) {
      byMonth[month] = prevByMonth[month];
      continue;
    }
    byMonth[month] = computeMonthlyTopics(month, monthConceptCounts, monthTotals, orderedMonths);
  }

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
    monthly: sortedMonthlyRows,
    topics: {
      method: "taxonomy-plus-trends",
      taxonomyVersion: taxonomy.version,
      generatedAt: new Date().toISOString(),
      monthFingerprints,
      byMonth,
    },
    unmatchedConstituencies,
  };
}

function classifyQuestions(questions, taxonomy) {
  const tokenize = (text) => {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  };

  const df = new Map();
  const docTokens = questions.map((q) => {
    const headingTokens = tokenize(q.heading || "");
    const questionTokens = tokenize(q.questionText || "");
    const tokens = [...headingTokens, ...headingTokens, ...questionTokens];
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      df.set(token, (df.get(token) || 0) + 1);
    }
    return tokens;
  });

  const N = questions.length;
  const getIdf = (token) => {
    const count = df.get(token) || 0;
    if (count === 0) return 0;
    return Math.log(1 + N / count);
  };

  const conceptVectors = taxonomy.concepts.map((concept) => {
    const labelTokens = tokenize(concept.label);
    const aliasTokens = (concept.aliases || []).flatMap((alias) => tokenize(alias));
    const termWeights = new Map();
    for (const t of labelTokens) {
      termWeights.set(t, (termWeights.get(t) || 0) + 3.0);
    }
    for (const t of aliasTokens) {
      termWeights.set(t, (termWeights.get(t) || 0) + 1.0);
    }

    const vector = new Map();
    let magnitudeSq = 0;
    for (const [term, weight] of termWeights.entries()) {
      const idf = getIdf(term);
      if (idf > 0) {
        const val = weight * idf;
        vector.set(term, val);
        magnitudeSq += val * val;
      }
    }

    return {
      label: concept.label,
      vector,
      magnitude: Math.sqrt(magnitudeSq),
    };
  });

  questions.forEach((q, idx) => {
    const tokens = docTokens[idx];
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    const qVector = new Map();
    let qMagnitudeSq = 0;
    for (const [term, count] of tf.entries()) {
      const idf = getIdf(term);
      if (idf > 0) {
        const val = count * idf;
        qVector.set(term, val);
        qMagnitudeSq += val * val;
      }
    }
    const qMagnitude = Math.sqrt(qMagnitudeSq);

    let bestLabel = "General";
    let bestScore = 0;

    if (qMagnitude > 0) {
      for (const concept of conceptVectors) {
        if (concept.magnitude === 0) continue;
        let dotProduct = 0;
        for (const [term, val] of qVector.entries()) {
          const conceptVal = concept.vector.get(term) || 0;
          dotProduct += val * conceptVal;
        }
        const score = dotProduct / (qMagnitude * concept.magnitude);
        if (score > bestScore) {
          bestScore = score;
          bestLabel = concept.label;
        }
      }
    }

    q.topic = bestScore >= 0.03 ? bestLabel : "General";
  });
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  const taxonomy = await loadTopicTaxonomy();
  const [{ lookup, records: constituencyRecords }, rawQuestions] = await Promise.all([
    buildConstituencyLookup(),
    fetchQuestions(),
  ]);

  const questions = rawQuestions
    .map((item) => mapQuestion(item, lookup))
    .filter((q) => {
      const heading = q.heading || "";
      const questionText = q.questionText || "";
      return /\bdent/i.test(heading) || /\bdent/i.test(questionText);
    })
    .sort((a, b) => {
      const dateCompare = b.dateTabled.localeCompare(a.dateTabled);
      if (dateCompare) return dateCompare;
      return String(b.uin || "").localeCompare(String(a.uin || ""));
    });

  classifyQuestions(questions, taxonomy);

  const unmatchedConstituencies = [
    ...new Set(
      questions
        .filter((question) => question.region.nhsRegion === "Unknown")
        .map((question) => question.member.constituency)
        .filter(Boolean),
    ),
  ].sort();

  const previousSummary = await loadPreviousSummary();
  const summary = buildSummary(
    questions,
    constituencyRecords,
    unmatchedConstituencies,
    taxonomy,
    previousSummary,
  );

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
