#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const ISSUE_TITLE = "Dentistry PQ dashboard refresh log";
const ISSUE_NUMBER = process.env.REFRESH_COMMENT_ISSUE_NUMBER || "";

function formatDate(value) {
  if (!value) return "unknown";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${GITHUB_TOKEN}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : null;
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${path}: ${bodyText}`);
  }
  return body;
}

async function findOrCreateIssue() {
  if (ISSUE_NUMBER) return Number(ISSUE_NUMBER);
  const issues = await github(`/repos/${GITHUB_REPOSITORY}/issues?state=open&per_page=100`);
  const existing = issues.find((issue) => issue.title === ISSUE_TITLE && !issue.pull_request);
  if (existing) return existing.number;
  const created = await github(`/repos/${GITHUB_REPOSITORY}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: ISSUE_TITLE,
      body: "Automated refresh checks for the dentistry PQ dashboard.",
    }),
  });
  return created.number;
}

function buildComment(summary) {
  const check = summary.batchCheck || {};
  const statusLine = check.hasTodayBatch
    ? "Today's tabled PQ batch is present in the stored data."
    : "No same-day tabled PQ batch is visible in the stored data at this check.";

  return [
    `## Dentistry PQ dashboard refresh - ${formatDateTime(check.checkedAt || summary.generatedAt)}`,
    "",
    statusLine,
    "",
    `- Latest tabled date stored: ${formatDate(check.latestTabledDate || summary.dateRange?.newestTabled)}`,
    `- Total stored questions: ${summary.totals?.questions?.toLocaleString("en-GB") || "unknown"}`,
    `- Check window: ${check.expectedBatchWindow || "07:30-08:30 Europe/London on sitting weekdays"}`,
    `- Status: ${check.status || "unknown"}`,
    "",
    check.message || "Refresh completed.",
  ].join("\n");
}

async function main() {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.log("Skipping GitHub comment: GITHUB_TOKEN or GITHUB_REPOSITORY missing.");
    return;
  }
  const summary = JSON.parse(await readFile("data/summary.json", "utf8"));
  const issueNumber = await findOrCreateIssue();
  await github(`/repos/${GITHUB_REPOSITORY}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: buildComment(summary) }),
  });
  console.log(`Posted refresh status comment to issue #${issueNumber}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
