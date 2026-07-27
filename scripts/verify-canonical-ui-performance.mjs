import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"
import { CANONICAL_UI_ROUTE_BUDGETS } from "../packages/webui/src/lib/canonical-ui-performance.js"
import {
  evaluateCanonicalRoutePerformance,
  sanitizeBrowserRequest,
} from "./lib/webui-live-performance-evidence.mjs"

const token = process.env.KNOWBEE_TEST_TOKEN ?? ""
if (!token) throw new Error("knowbee_test_token_required")

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4220"
const executablePath =
  process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/task048-canonical-ui-performance.json")
const profiles = [
  { id: "mobile", viewport: { width: 375, height: 812 }, minTargetPx: 44 },
  { id: "desktop", viewport: { width: 1440, height: 900 }, minTargetPx: 40 },
]

const browser = await chromium.launch({ executablePath, headless: true })
try {
  const results = []
  for (const profile of profiles) {
    for (const budget of CANONICAL_UI_ROUTE_BUDGETS) {
      const context = await browser.newContext({ viewport: profile.viewport })
      await context.addInitScript((value) => {
        localStorage.setItem("knowbee_token", value)
        globalThis.__knowbeeCanonicalMetrics = {
          lcpMs: 0,
          cls: 0,
          maxLongTaskMs: 0,
          longTasks: [],
          ownerVisibleMs: 0,
        }
        const recordVisibleOwner = () => {
          if (globalThis.__knowbeeCanonicalMetrics.ownerVisibleMs > 0) return true
          const owner = document.querySelector("main h1")
          if (!owner) return false
          const rect = owner.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return false
          globalThis.__knowbeeCanonicalMetrics.ownerVisibleMs = performance.now()
          return true
        }
        const ownerObserver = new MutationObserver(() => {
          if (recordVisibleOwner()) ownerObserver.disconnect()
        })
        ownerObserver.observe(document, { childList: true, subtree: true, attributes: true })
        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries()
            const latest = entries.at(-1)
            if (latest) globalThis.__knowbeeCanonicalMetrics.lcpMs = latest.startTime
          }).observe({ type: "largest-contentful-paint", buffered: true })
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) globalThis.__knowbeeCanonicalMetrics.cls += entry.value
            }
          }).observe({ type: "layout-shift", buffered: true })
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              globalThis.__knowbeeCanonicalMetrics.maxLongTaskMs = Math.max(
                globalThis.__knowbeeCanonicalMetrics.maxLongTaskMs,
                entry.duration,
              )
              globalThis.__knowbeeCanonicalMetrics.longTasks.push({
                startMs: Math.round(entry.startTime),
                durationMs: Math.round(entry.duration),
              })
            }
          }).observe({ type: "longtask", buffered: true })
        } catch {
          // Unsupported metrics remain explicit zero values in deterministic localhost evidence.
        }
      }, token)
      const page = await context.newPage()
      page.setDefaultTimeout(20_000)
      page.setDefaultNavigationTimeout(20_000)
      const requests = []
      const requestReceipts = new WeakMap()
      const pageErrors = []
      const origin = new URL(baseUrl).origin
      const startedAt = performance.now()
      page.on("pageerror", (error) => pageErrors.push(error.message))
      page.on("request", (request) => {
        if (!["fetch", "xhr"].includes(request.resourceType())) return
        const receipt = sanitizeBrowserRequest({
          method: request.method(),
          requestUrl: request.url(),
          applicationOrigin: origin,
          startMs: performance.now() - startedAt,
        })
        if (receipt?.safePath.startsWith("/api/")) {
          const timedReceipt = { ...receipt, state: "pending", durationMs: null }
          requests.push(timedReceipt)
          requestReceipts.set(request, timedReceipt)
        }
      })
      const finishRequest = (request, state) => {
        const receipt = requestReceipts.get(request)
        if (!receipt) return
        receipt.state = state
        receipt.durationMs =
          Math.round((performance.now() - startedAt - receipt.startMs) * 1_000) / 1_000
      }
      page.on("requestfinished", (request) => finishRequest(request, "completed"))
      page.on("requestfailed", (request) => finishRequest(request, "failed"))

      await page.goto(`${baseUrl}${budget.route}`, { waitUntil: "domcontentloaded" })
      await page.locator("main h1").first().waitFor({ state: "visible" })
      const ownerVisibleMs = await page.evaluate(
        () => globalThis.__knowbeeCanonicalMetrics?.ownerVisibleMs ?? 0,
      )
      const usableMs = ownerVisibleMs > 0 ? ownerVisibleMs : performance.now() - startedAt
      await page.waitForTimeout(1_200)
      const browserState = await page.evaluate((minTargetPx) => {
        const root = document.documentElement
        const metric = globalThis.__knowbeeCanonicalMetrics ?? {
          lcpMs: 0,
          cls: 0,
          maxLongTaskMs: 0,
          longTasks: [],
          ownerVisibleMs: 0,
        }
        const visibleControls = [
          ...document.querySelectorAll(
            "main button, main a, main input, main select, main textarea",
          ),
        ].filter((element) => {
          const rect = element.getBoundingClientRect()
          const style = window.getComputedStyle(element)
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden"
        })
        const controlName = (element) => {
          const labels =
            "labels" in element && element.labels
              ? [...element.labels].map((label) => label.textContent ?? "").join(" ")
              : ""
          return [
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            labels,
            element.textContent,
          ]
            .filter(Boolean)
            .join(" ")
            .trim()
        }
        const unnamedControlCount = visibleControls.filter(
          (element) => !controlName(element),
        ).length
        const undersizedControlCount = visibleControls.filter((element) => {
          if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
            return false
          }
          const rect = element.getBoundingClientRect()
          return rect.width < minTargetPx || rect.height < minTargetPx
        }).length
        const controlIssues = visibleControls.flatMap((element) => {
          const rect = element.getBoundingClientRect()
          const unnamed = !controlName(element)
          const sizeExempt =
            element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
          const undersized = !sizeExempt && (rect.width < minTargetPx || rect.height < minTargetPx)
          if (!unnamed && !undersized) return []
          return [
            {
              tag: element.tagName.toLowerCase(),
              type: element.getAttribute("type"),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              unnamed,
              undersized,
              className: (element.getAttribute("class") ?? "").split(/\s+/u).slice(0, 8),
            },
          ]
        })
        const javascriptResources = performance
          .getEntriesByType("resource")
          .filter((entry) => entry.name.includes("/assets/") && entry.name.endsWith(".js"))
          .map((entry) => ({
            asset: new URL(entry.name).pathname.split("/").at(-1) ?? "unknown",
            startMs: Math.round(entry.startTime),
            durationMs: Math.round(entry.duration),
          }))
          .sort((left, right) => right.durationMs - left.durationMs)
          .slice(0, 8)
        return {
          lcpMs: metric.lcpMs,
          cls: metric.cls,
          maxLongTaskMs: metric.maxLongTaskMs,
          longTasks: metric.longTasks,
          horizontalOverflow: root.scrollWidth > window.innerWidth + 1,
          unnamedControlCount,
          undersizedControlCount,
          visibleControlCount: visibleControls.length,
          controlIssues,
          javascriptResources,
        }
      }, profile.minTargetPx)
      await page.keyboard.press("Tab")
      const keyboardFocusVisible = await page.evaluate(() => {
        const active = document.activeElement
        return Boolean(active && active !== document.body && active !== document.documentElement)
      })
      const sample = {
        route: budget.route,
        metrics: {
          lcpMs: browserState.lcpMs,
          cls: browserState.cls,
          usableMs,
          maxLongTaskMs: browserState.maxLongTaskMs,
          longTasks: browserState.longTasks,
        },
        requests,
        horizontalOverflow: browserState.horizontalOverflow,
      }
      const gate = evaluateCanonicalRoutePerformance({ budget, sample })
      if (browserState.unnamedControlCount > 0) {
        gate.ok = false
        gate.issues.push({ code: "accessible_name_missing" })
      }
      if (browserState.undersizedControlCount > 0) {
        gate.ok = false
        gate.issues.push({ code: "control_target_too_small" })
      }
      if (!keyboardFocusVisible) {
        gate.ok = false
        gate.issues.push({ code: "keyboard_focus_missing" })
      }
      if (pageErrors.length > 0) {
        gate.ok = false
        gate.issues.push({ code: "page_error" })
      }
      results.push({
        profile: profile.id,
        route: budget.route,
        metrics: sample.metrics,
        requestCount: requests.length,
        requests,
        criticalRequestCount: requests.filter((request) =>
          budget.criticalApiAllowlist.some((path) => request.safePath.startsWith(path)),
        ).length,
        browserState,
        keyboardFocusVisible,
        pageErrorCount: pageErrors.length,
        gate,
      })
      await context.close()
      // Keep renderer teardown work from the previous route out of the next isolated sample.
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    }
  }

  const passed = results.every((result) => result.gate.ok)
  const evidence = {
    schemaVersion: "knowbee.canonical-ui-performance:v1",
    evidenceClass: "deterministic_localhost",
    passed,
    profiles: profiles.map((profile) => ({ id: profile.id, viewport: profile.viewport })),
    results,
  }
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`)
  if (!passed) throw new Error("canonical_ui_performance_gate_failed")
  process.stdout.write(`${JSON.stringify({ passed, outputPath, results }, null, 2)}\n`)
} finally {
  await browser.close()
}
