import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { chromium } from "playwright-core"

import {
  buildWebUiLivePerformanceEvidence,
  compareLiveRequestsToStaticBaseline,
  sanitizeBrowserRequest,
} from "./lib/webui-live-performance-evidence.mjs"

export const WEBUI_LIVE_PROFILES = Object.freeze([
  { profileId: "mobile_cold", viewport: { width: 375, height: 812 }, cacheMode: "cold" },
  { profileId: "mobile_warm", viewport: { width: 375, height: 812 }, cacheMode: "warm" },
  { profileId: "desktop_cold", viewport: { width: 1440, height: 900 }, cacheMode: "cold" },
  { profileId: "desktop_warm", viewport: { width: 1440, height: 900 }, cacheMode: "warm" },
])

const SOURCE_DERIVED_STARTUP_QUERY_KEYS = Object.freeze([
  "GET /api/status",
  "GET /api/capabilities",
  "GET /api/setup/status",
  "GET /api/setup/draft",
  "GET /api/setup/checks",
  "GET /api/ui/shell",
  "GET /api/runs",
  "GET /api/tasks",
  "GET /api/runs/operations/summary",
])

export async function collectWebUiBrowserProfile(input) {
  const now = input.now ?? (() => performance.now())
  let context
  try {
    context = await input.browser.newContext({ viewport: input.profile.viewport })
    const page = await context.newPage()
    await page.addInitScript(() => {
      globalThis.__knowbeePerformanceMetrics = { lcpMs: 0, cls: 0 }
      try {
        new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const latest = entries[entries.length - 1]
          if (latest) globalThis.__knowbeePerformanceMetrics.lcpMs = latest.startTime
        }).observe({ type: "largest-contentful-paint", buffered: true })
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) globalThis.__knowbeePerformanceMetrics.cls += entry.value
          }
        }).observe({ type: "layout-shift", buffered: true })
      } catch {
        // Unsupported observers remain explicit zero measurements for this browser profile.
      }
    })

    const application = new URL(input.applicationUrl)
    const requests = []
    let measurementStartedAt = now()
    page.on("request", (request) => {
      const resourceType = request.resourceType()
      if (resourceType !== "fetch" && resourceType !== "xhr") return
      const receipt = sanitizeBrowserRequest({
        method: request.method(),
        requestUrl: request.url(),
        applicationOrigin: application.origin,
        startMs: Math.max(0, now() - measurementStartedAt),
      })
      if (receipt?.safePath.startsWith("/api/")) requests.push(receipt)
    })

    if (input.profile.cacheMode === "warm") {
      await page.goto(input.applicationUrl, { waitUntil: "domcontentloaded", timeout: 20_000 })
      await page.waitForTimeout(input.settleMs)
      requests.length = 0
      measurementStartedAt = now()
      await page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 })
    } else {
      measurementStartedAt = now()
      await page.goto(input.applicationUrl, { waitUntil: "domcontentloaded", timeout: 20_000 })
    }
    await page.waitForTimeout(input.settleMs)

    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0]
      const firstContentfulPaint = performance.getEntriesByName("first-contentful-paint")[0]
      const observed = globalThis.__knowbeePerformanceMetrics ?? { lcpMs: 0, cls: 0 }
      return {
        domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
        firstContentfulPaintMs: firstContentfulPaint?.startTime ?? 0,
        lcpMs: observed.lcpMs ?? 0,
        cls: observed.cls ?? 0,
      }
    })

    return {
      kind: "collected",
      profileId: input.profile.profileId,
      route: application.pathname,
      viewport: input.profile.viewport,
      cacheMode: input.profile.cacheMode,
      metrics,
      requests,
    }
  } catch {
    return {
      kind: "unavailable",
      profileId: input.profile.profileId,
      reasonCode: "browser_navigation_failed",
    }
  } finally {
    await context?.close()
  }
}

function parseArguments(argumentsList) {
  const options = {
    applicationUrl: "",
    browserExecutable: "",
    outputPath: "",
    buildIdentity: "",
    settleMs: 1_500,
    details: false,
  }
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    if (argument === "--details") {
      options.details = true
      continue
    }
    if (
      !["--url", "--browser-executable", "--output", "--build-identity", "--settle-ms"].includes(
        argument,
      )
    ) {
      throw new Error(`unsupported_argument:${argument}`)
    }
    const value = argumentsList[index + 1]
    if (!value) throw new Error(`argument_value_missing:${argument}`)
    index += 1
    if (argument === "--url") options.applicationUrl = value
    if (argument === "--browser-executable") options.browserExecutable = resolve(value)
    if (argument === "--output") options.outputPath = resolve(value)
    if (argument === "--build-identity") options.buildIdentity = value
    if (argument === "--settle-ms") options.settleMs = Number(value)
  }
  if (!options.applicationUrl) throw new Error("application_url_required")
  if (!options.browserExecutable) throw new Error("browser_executable_required")
  if (!options.outputPath) throw new Error("output_path_required")
  if (!options.buildIdentity) throw new Error("build_identity_required")
  if (!Number.isFinite(options.settleMs) || options.settleMs < 0)
    throw new Error("settle_ms_invalid")
  return options
}

export async function runWebUiLivePerformanceCli(argumentsList) {
  const options = parseArguments(argumentsList)
  const browser = await chromium.launch({
    executablePath: options.browserExecutable,
    headless: true,
  })
  try {
    const samples = []
    for (const profile of WEBUI_LIVE_PROFILES) {
      samples.push(
        await collectWebUiBrowserProfile({
          browser,
          applicationUrl: options.applicationUrl,
          profile,
          settleMs: options.settleMs,
        }),
      )
    }
    const evidence = buildWebUiLivePerformanceEvidence({
      buildIdentity: options.buildIdentity,
      samples,
    })
    const comparisons = samples
      .filter((sample) => sample.kind === "collected")
      .map((sample) => ({
        profileId: sample.profileId,
        ...compareLiveRequestsToStaticBaseline({
          expectedQueryKeys: SOURCE_DERIVED_STARTUP_QUERY_KEYS,
          observedRequests: sample.requests,
        }),
      }))
    const report = { evidence, comparisons }
    writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
    const summary = {
      status: evidence.status,
      collectedProfiles: samples.filter((sample) => sample.kind === "collected").length,
      unavailableProfiles: samples.filter((sample) => sample.kind === "unavailable").length,
      requestDifferenceProfiles: comparisons.filter((item) => !item.ok).length,
    }
    process.stdout.write(`${JSON.stringify(options.details ? report : summary, null, 2)}\n`)
    return evidence.status === "collected" ? 0 : 1
  } finally {
    await browser.close()
  }
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false
if (isMain) {
  runWebUiLivePerformanceCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch(() => {
      process.exitCode = 1
    })
}
