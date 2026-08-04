#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createWebFetchTool } from "../../packages/core/src/tools/builtin/web-fetch.js"
import { createWebSearchTool } from "../../packages/core/src/tools/builtin/web-search.js"

const POLICY_VERSION = "web-research-provider-smoke-v1"
const DEFAULT_QUERY = "DuckDuckGo HTML search"
const MAX_FETCH_ATTEMPTS = 3

function exact(value) {
  return typeof value === "string" && value.trim().length > 0
}

export function classifyWebResearchLiveSmoke(observation) {
  if (!observation.search?.success) {
    return {
      status: "warning",
      reasonCode: exact(observation.search?.reasonCode)
        ? observation.search.reasonCode
        : "web_search_provider_unavailable",
    }
  }
  if (!Number.isSafeInteger(observation.search.resultCount) || observation.search.resultCount < 1) {
    return { status: "warning", reasonCode: "web_search_no_results" }
  }
  if (
    observation.fetchAttempts.some(
      (attempt) =>
        attempt.success === true &&
        Number.isSafeInteger(attempt.markdownLength) &&
        attempt.markdownLength > 0,
    )
  ) {
    return { status: "passed", reasonCode: "search_and_fetch_observed" }
  }
  const reasonCode = observation.fetchAttempts.find((attempt) => exact(attempt.reasonCode))
    ?.reasonCode
  return {
    status: "warning",
    reasonCode: reasonCode ?? "public_document_provider_unavailable",
  }
}

export function sanitizeWebResearchLiveSmokeReceipt(value) {
  return Object.freeze({
    schemaVersion: 1,
    policyVersion: POLICY_VERSION,
    status: value.status === "passed" ? "passed" : value.status === "warning" ? "warning" : "failed",
    reasonCode: exact(value.reasonCode) ? value.reasonCode : "live_smoke_result_invalid",
    observedAt: exact(value.observedAt) ? value.observedAt : new Date(0).toISOString(),
    searchResultCount:
      Number.isSafeInteger(value.searchResultCount) && value.searchResultCount >= 0
        ? value.searchResultCount
        : 0,
    fetchAttemptCount:
      Number.isSafeInteger(value.fetchAttemptCount) && value.fetchAttemptCount >= 0
        ? value.fetchAttemptCount
        : 0,
  })
}

function createToolContext(root, signal) {
  const runId = `web-provider-smoke:${crypto.randomUUID()}`
  return {
    artifactStorage: {
      rootDir: resolve(root, ".tasks", "artifacts"),
      metadataFile: resolve(root, ".tasks", "artifacts", "metadata.jsonl"),
    },
    sessionId: runId,
    runId,
    requestGroupId: runId,
    workDir: root,
    userMessage: "controlled web provider smoke",
    source: "cli",
    allowWebAccess: true,
    onProgress: () => undefined,
    signal,
  }
}

function resultCandidates(result) {
  if (!result.success || !result.details || typeof result.details !== "object") return []
  const results = result.details.results
  if (!Array.isArray(results)) return []
  return results
    .map((item) => (item && typeof item === "object" ? item.url : null))
    .filter((url) => typeof url === "string" && /^https?:\/\//iu.test(url))
    .slice(0, MAX_FETCH_ATTEMPTS)
}

export async function runControlledWebResearchLiveSmoke(options = {}) {
  const root = options.root ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)
  const context = createToolContext(root, controller.signal)
  const searchTool = options.searchTool ?? createWebSearchTool()
  const fetchTool = options.fetchTool ?? createWebFetchTool()
  const fetchAttempts = []
  let searchResult
  try {
    searchResult = await searchTool.execute(
      {
        query: options.query ?? DEFAULT_QUERY,
        maxResults: 3,
        locale: "en-US",
        safeSearch: "moderate",
        freshnessPolicy: "normal",
      },
      context,
    )
    const candidates = resultCandidates(searchResult)
    for (const url of candidates) {
      const fetched = await fetchTool.execute(
        { url, maxLength: 4_000, freshnessPolicy: "normal" },
        context,
      )
      fetchAttempts.push({
        success: fetched.success,
        ...(fetched.success ? { markdownLength: fetched.output.trim().length } : {}),
        ...(!fetched.success && exact(fetched.error) ? { reasonCode: fetched.error } : {}),
      })
      if (fetched.success && fetched.output.trim().length > 0) break
    }
    const classification = classifyWebResearchLiveSmoke({
      search: {
        success: searchResult.success,
        resultCount: candidates.length,
        ...(!searchResult.success && exact(searchResult.error)
          ? { reasonCode: searchResult.error }
          : {}),
      },
      fetchAttempts,
    })
    return sanitizeWebResearchLiveSmokeReceipt({
      ...classification,
      observedAt: new Date().toISOString(),
      searchResultCount: candidates.length,
      fetchAttemptCount: fetchAttempts.length,
    })
  } catch (error) {
    return sanitizeWebResearchLiveSmokeReceipt({
      status: "warning",
      reasonCode:
        controller.signal.aborted
          ? "web_provider_smoke_timeout"
          : error instanceof Error && exact(error.message)
            ? error.message
            : "web_provider_smoke_failed",
      observedAt: new Date().toISOString(),
      searchResultCount: 0,
      fetchAttemptCount: fetchAttempts.length,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const env = Object.freeze({ ...process.env })
  if (env.KNOWBEE_LIVE_WEB_SMOKE !== "1") {
    process.stderr.write("KNOWBEE_LIVE_WEB_SMOKE=1 is required for the controlled live smoke.\n")
    process.exitCode = 2
    return
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
  const receipt = await runControlledWebResearchLiveSmoke({ root })
  const outputPath = resolve(root, ".tasks", "web-research-live-smoke.json")
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify(receipt)}\n`)
  if (receipt.status === "failed") process.exitCode = 1
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ""
if (import.meta.url === invokedPath) {
  await main()
}
