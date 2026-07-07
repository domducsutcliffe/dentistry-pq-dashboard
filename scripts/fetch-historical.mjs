import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");

// Cache directory located in the scratch folder
const scratchDir = "/Users/williewonka/.gemini/antigravity/brain/24192df1-4f8c-4d6a-a8e5-77eb3d5b0d05/scratch";
const cacheDebatesDir = path.join(scratchDir, "cache", "debates");
const cacheMembersDir = path.join(scratchDir, "cache", "members");

const SEARCH_TERMS = ["dentistry", "dentist", "dentists", "dent", "dental", "golden hello"];
const START_DATE = "1990-01-01";
const END_DATE = "2014-06-03";
const HOUSE = "Commons";
const PAGE_SIZE = 100;

const PARTY_ABBREVIATIONS = {
  "Labour": "Lab",
  "Labour (Co-op)": "Lab",
  "Labour/Co-operative": "Lab",
  "Conservative": "Con",
  "Liberal Democrat": "LD",
  "Liberal Democrats": "LD",
  "Scottish National Party": "SNP",
  "Democratic Unionist Party": "DUP",
  "Sinn Féin": "SF",
  "Plaid Cymru": "PC",
  "Green Party": "Green",
  "Reform UK": "Ref",
  "Social Democratic and Labour Party": "SDLP",
  "Alliance Party": "Alliance",
  "Traditional Unionist Voice": "TUV",
  "Ulster Unionist Party": "UUP",
  "Independent": "Ind",
};

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

async function fetchJson(url, tries = 5) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("retry-after");
        let waitTime = Math.pow(2, attempt - 1) * 10000; // default backoff
        if (retryAfterHeader) {
          const seconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(seconds)) {
            waitTime = seconds * 1000 + 2000; // wait retry-after seconds + 2s buffer
          } else {
            const date = Date.parse(retryAfterHeader);
            if (!isNaN(date)) {
              waitTime = Math.max(0, date - Date.now()) + 2000;
            }
          }
        }
        console.warn(`Rate limited (429) on ${url}. Waiting ${Math.round(waitTime / 1000)}s before retry (attempt ${attempt}/${tries})...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        throw new Error(`429 Too Many Requests`);
      }
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < tries) {
        const waitTime = error.message.includes('429') ? 0 : attempt * 1000;
        if (waitTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }
  }
  throw lastError;
}

// Fetch search results for a specific term
async function fetchSearchResults(term) {
  const allResults = [];
  let total = null;
  let skip = 0;

  while (total === null || skip < total) {
    const params = new URLSearchParams({
      "queryParameters.searchTerm": term,
      "queryParameters.startDate": START_DATE,
      "queryParameters.endDate": END_DATE,
      "queryParameters.house": HOUSE,
      "queryParameters.skip": String(skip),
      "queryParameters.take": String(PAGE_SIZE),
    });
    const url = `https://hansard-api.parliament.uk/search/contributions/WrittenAnswers.json?${params}`;
    
    try {
      const data = await fetchJson(url);
      total = data.TotalResultCount;
      const results = data.Results || [];
      allResults.push(...results);
      if (results.length === 0) break;
      skip += PAGE_SIZE;
    } catch (e) {
      console.error(`Error fetching search results for "${term}" at skip=${skip}:`, e.message);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return allResults;
}

// Fetch a single debate, with cache
async function getDebate(extId) {
  const cachePath = path.join(cacheDebatesDir, `${extId}.json`);
  try {
    const raw = await readFile(cachePath, "utf8");
    return JSON.parse(raw);
  } catch {
    // Not in cache, fetch
    const url = `https://hansard-api.parliament.uk/debates/debate/${extId}.json`;
    console.log(`Fetching debate ${extId} (cache miss)...`);
    const data = await fetchJson(url);
    await writeFile(cachePath, JSON.stringify(data, null, 2), "utf8");
    // Sequential delay of 3000ms after successful API request
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return data;
  }
}

// Fetch a single member, with cache
async function getMember(memberId, cacheOnly = false) {
  const cachePath = path.join(cacheMembersDir, `${memberId}.json`);
  try {
    const raw = await readFile(cachePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (cacheOnly) {
      return null;
    }
    // Not in cache, fetch
    const params = new URLSearchParams({
      "queryParameters.memberId": String(memberId)
    });
    const url = `https://hansard-api.parliament.uk/search/members.json?${params}`;
    console.log(`Fetching member profile ${memberId} (cache miss)...`);
    const data = await fetchJson(url);
    await writeFile(cachePath, JSON.stringify(data, null, 2), "utf8");
    // Sequential delay of 3000ms after successful API request
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return data;
  }
}

function isQuestion(item) {
  if (item.HRSTag === "Question") return true;
  const val = item.Value || "";
  if (val.includes("<QuestionText>")) return true;
  const clean = stripHtml(val).trim();
  if (clean.startsWith("To ask ") || clean.startsWith("To ask Her Majesty's Government")) return true;
  return false;
}

async function main() {
  const limitArgIdx = process.argv.indexOf("--limit");
  const limit = limitArgIdx !== -1 ? Number(process.argv[limitArgIdx + 1]) : null;
  const cacheOnly = process.argv.includes("--cache-only") || process.argv.includes("--offline");

  console.log("Creating cache directories...");
  await mkdir(cacheDebatesDir, { recursive: true });
  await mkdir(cacheMembersDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  // Load constituency lookup cache
  console.log("Loading constituency lookup map...");
  let constituencyLookup = new Map();
  try {
    const lookupCacheRaw = await readFile(path.join(dataDir, "constituency-lookup-cache.json"), "utf8");
    const lookupCache = JSON.parse(lookupCacheRaw);
    constituencyLookup = new Map(Object.entries(lookupCache.lookup));
    console.log(`Loaded ${constituencyLookup.size} constituency mapping definitions.`);
  } catch (e) {
    console.warn("Warning: Could not load data/constituency-lookup-cache.json. NHS region matching will fall back to Unknown.", e.message);
  }

  // 1. Fetch search results or load from file
  let debateIds = [];
  if (cacheOnly) {
    console.log("Running in cache-only/offline mode. Reading debates from cache directory...");
    const files = await readdir(cacheDebatesDir);
    debateIds = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(".json", ""));
    console.log(`Found ${debateIds.length} cached debate sections.`);
  } else {
    try {
      const cachedIdsRaw = await readFile(path.join(scratchDir, "debate-ids.json"), "utf8");
      const cachedIdsData = JSON.parse(cachedIdsRaw);
      debateIds = cachedIdsData.ids || [];
      console.log(`Loaded ${debateIds.length} unique debate IDs from cached file.`);
    } catch {
      console.log("No cached debate IDs found. Fetching search results from API...");
      const uniqueDebateIds = new Set();
      for (const term of SEARCH_TERMS) {
        console.log(`Searching for "${term}"...`);
        const results = await fetchSearchResults(term);
        console.log(`Found ${results.length} contributions for term "${term}".`);
        for (const r of results) {
          if (r.DebateSectionExtId) {
            uniqueDebateIds.add(r.DebateSectionExtId);
          }
        }
      }
      debateIds = [...uniqueDebateIds];
    }
  }
  console.log(`Found ${debateIds.length} unique debate sections in total.`);

  if (limit) {
    console.log(`Applying testing limit: processing only the first ${limit} debate sections.`);
    debateIds = debateIds.slice(0, limit);
  }

  // 2. Fetch full debate details
  console.log(`Fetching full debate details for ${debateIds.length} sections...`);
  const rawDebates = [];
  let debateIndex = 0;
  for (const id of debateIds) {
    debateIndex++;
    try {
      const debate = await getDebate(id);
      rawDebates.push(debate);
    } catch (e) {
      console.error(`Fatal error: Failed to fetch debate section ${id} after retries:`, e.message);
      throw e; // Fail the entire run to prevent writing incomplete data
    }
    if (debateIndex % 100 === 0 || debateIndex === debateIds.length) {
      console.log(`Progress: Processed ${debateIndex} / ${debateIds.length} debates...`);
    }
  }

  // 3. Parse debates and pair questions and answers
  console.log("Parsing debate sections and pairing questions & answers...");
  const parsedQuestions = [];
  const uniqueMemberIds = new Set();

  for (const debate of rawDebates) {
    if (!debate || !debate.Overview) continue;
    const overview = debate.Overview;
    const items = debate.Items || [];
    
    // Sort items by OrderInSection
    items.sort((a, b) => (a.OrderInSection || 0) - (b.OrderInSection || 0));

    const dateStr = overview.Date ? overview.Date.slice(0, 10) : "";
    let activeQuestions = [];

    for (const item of items) {
      if (item.ItemType !== "Contribution") continue;

      const isQ = isQuestion(item);
      if (isQ) {
        // Start a new group if previous active questions already have answers
        if (activeQuestions.some((q) => q.answerText.length > 0)) {
          activeQuestions = [];
        }

        const qText = stripHtml(item.Value);
        const question = {
          id: item.ItemId,
          uin: item.UIN || `H-${item.ItemId}`,
          url: `https://hansard-api.parliament.uk/search/Results?searchTerm=${item.UIN || item.ItemId}`,
          heading: overview.Title || "",
          questionText: qText,
          answerText: "",
          dateTabled: dateStr,
          dateAnswered: dateStr,
          dateForAnswer: dateStr,
          answered: true, // Default to true, will update based on answer text presence
          answeringBodyName: item.HansardSection || "Department of Health",
          isNamedDay: false,
          member: {
            id: item.MemberId || null,
            name: item.AttributedTo || "",
            party: "",
            partyAbbreviation: "",
            constituency: ""
          },
          region: {
            constituency: "",
            nation: "Unknown",
            parliamentaryRegion: "",
            nhsRegion: "Unknown",
            sourceBoundary: "unmatched",
            mappedToConstituency: ""
          }
        };
        parsedQuestions.push(question);
        activeQuestions.push(question);
        if (item.MemberId) {
          uniqueMemberIds.add(item.MemberId);
        }
      } else {
        // This is an answer contribution
        const aText = stripHtml(item.Value);
        for (const q of activeQuestions) {
          if (q.answerText) {
            q.answerText += "\n\n" + aText;
          } else {
            q.answerText = aText;
          }
          if (item.AttributedTo) {
            q.answeringBodyName = `Department of Health (Answered by ${item.AttributedTo})`;
          }
        }
      }
    }

    // Update answered status for this debate's questions
    for (const q of activeQuestions) {
      q.answered = Boolean(q.answerText.trim());
    }
  }

  console.log(`Parsed ${parsedQuestions.length} questions. Unique member profiles to query: ${uniqueMemberIds.size}`);

  // 4. Fetch member profiles
  const memberIds = [...uniqueMemberIds]
    .filter(Boolean)
    .map(Number)
    .filter((id) => id > 0);
  console.log(`Fetching member profiles for ${memberIds.length} MPs...`);
  
  const memberMap = new Map();
  let memberIndex = 0;
  for (const id of memberIds) {
    memberIndex++;
    try {
      const data = await getMember(id, cacheOnly);
      if (data && data.Results && data.Results.length > 0) {
        const m = data.Results[0];
        if (m && m.MemberId) {
          memberMap.set(m.MemberId, m);
        }
      }
    } catch (e) {
      console.error(`Fatal error: Failed to fetch member profile ${id} after retries:`, e.message);
      throw e; // Fail the entire run to prevent writing incomplete data
    }
    if (memberIndex % 50 === 0 || memberIndex === memberIds.length) {
      console.log(`Progress: Processed ${memberIndex} / ${memberIds.length} member profiles...`);
    }
  }
  console.log(`Loaded details for ${memberMap.size} unique MPs.`);

  // 5. Fill in member details and regions
  console.log("Mapping member details, NHS regions, and constituencies to questions...");
  for (const q of parsedQuestions) {
    const memberId = q.member.id;
    if (memberId && memberMap.has(memberId)) {
      const m = memberMap.get(memberId);
      q.member.name = m.DisplayAs || q.member.name;
      q.member.party = m.Party || "";
      q.member.partyAbbreviation = PARTY_ABBREVIATIONS[m.Party] || m.Party || "";
      q.member.constituency = m.MemberFrom || "";
    }

    // Set region info using constituency lookup
    const constituency = q.member.constituency;
    if (constituency) {
      q.region.constituency = constituency;
      const regionRecord = constituencyLookup.get(normaliseName(constituency));
      if (regionRecord) {
        q.region.nation = regionRecord.nation || "Unknown";
        q.region.parliamentaryRegion = regionRecord.parliamentaryRegion || "";
        q.region.nhsRegion = regionRecord.nhsRegion || "Unknown";
        q.region.sourceBoundary = regionRecord.sourceBoundary || "matched";
        q.region.mappedToConstituency = regionRecord.mappedToConstituency || "";
      }
    }
  }

  // 6. Filter for dentistry questions to exclude non-dentistry entries
  const filteredQuestions = parsedQuestions.filter((q) => {
    const heading = q.heading || "";
    const questionText = q.questionText || "";
    return /\bdent/i.test(heading) || /\bdent/i.test(questionText) || /\bgolden\s+hello/i.test(heading) || /\bgolden\s+hello/i.test(questionText);
  });
  console.log(`Filtered parsed questions. Original: ${parsedQuestions.length}, Filtered: ${filteredQuestions.length}`);

  const outPath = path.join(dataDir, "historical-questions.json");
  await writeFile(outPath, JSON.stringify({ questions: filteredQuestions }, null, 2) + "\n", "utf8");
  console.log("Historical questions written successfully.");

  // 8. Run refresh-data --offline automatically to update dashboard statistics
  console.log("Historical fetch completed. Running offline dashboard refresh...");
  const { execSync } = await import("node:child_process");
  try {
    execSync("node scripts/refresh-data.mjs --offline", { stdio: "inherit" });
    console.log("Dashboard database successfully updated.");
  } catch (e) {
    console.error("Failed to run refresh-data.mjs:", e.message);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exitCode = 1;
});
