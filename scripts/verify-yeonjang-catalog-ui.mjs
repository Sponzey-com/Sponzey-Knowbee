import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const applicationUrl = process.argv[2] ?? "http://127.0.0.1:4220/capabilities/yeonjang"
const executablePath =
  process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/yeonjang-catalog-ui-evidence.json")

const items = [
  {
    yeonjangRef: `yeonjang_v1_${"a".repeat(24)}`,
    displayName: "Design Mac",
    location: "local",
    platform: "macos",
    supportProfile: "desktop_interactive",
    status: "ready",
    permissionState: "ready",
    lastSeenAt: Date.now() - 2_000,
    lastSeenAgeMs: 2_000,
    stale: false,
    runnable: true,
    capabilityGroups: ["applications", "screen", "input"],
    actionableIssue: null,
  },
  {
    yeonjangRef: `yeonjang_v1_${"b".repeat(24)}`,
    displayName: "Remote Linux",
    location: "remote",
    platform: "linux",
    supportProfile: "headless_managed",
    status: "permission_required",
    permissionState: "required",
    lastSeenAt: Date.now() - 120_000,
    lastSeenAgeMs: 120_000,
    stale: false,
    runnable: false,
    capabilityGroups: ["files", "system"],
    actionableIssue: "yeonjang_permission_required",
  },
]

function summary(visibleItems) {
  return {
    total: visibleItems.length,
    ready: visibleItems.filter((item) => item.status === "ready").length,
    local: visibleItems.filter((item) => item.location === "local").length,
    remote: visibleItems.filter((item) => item.location === "remote").length,
    permissionRequired: visibleItems.filter((item) => item.status === "permission_required").length,
    stale: visibleItems.filter((item) => item.status === "stale").length,
    duplicateInstanceDetected: false,
    knowbeeFallbackAvailable: true,
    computerControlAvailable: visibleItems.some((item) => item.runnable),
  }
}

function platformSupport(item) {
  const headless = item.supportProfile === "headless_managed"
  const supported = { status: "supported", reasonCodes: [] }
  const unsupported = { status: "unsupported", reasonCodes: ["headless_profile_no_tray"] }
  return {
    platform: item.platform,
    supportProfile: item.supportProfile,
    capabilities: {
      applications: supported,
      files: supported,
      input: headless ? unsupported : supported,
      screen: headless ? unsupported : supported,
      system: supported,
    },
    processControl: supported,
    trayWindow: headless ? unsupported : supported,
    packageSmoke: supported,
    runnableCapabilityGroups: headless
      ? ["files", "system"]
      : ["applications", "files", "input", "screen", "system"],
  }
}

const browser = await chromium.launch({ executablePath, headless: true })
try {
  const results = []
  for (const profile of [
    { id: "desktop", viewport: { width: 1440, height: 900 } },
    { id: "mobile", viewport: { width: 390, height: 844 } },
  ]) {
    let mode = "ready"
    let revision = 4
    const profileItems = items.map((item) => ({ ...item }))
    const boundAgentRefs = new Set()
    const mutationPayloads = []
    const agents = [
      { agentRef: `agent_v1_${"c".repeat(24)}`, name: "Analyst" },
      { agentRef: `agent_v1_${"d".repeat(24)}`, name: "Operator" },
    ]
    const context = await browser.newContext({ viewport: profile.viewport })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    await page.route("**/api/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ setupCompleted: true }),
      }),
    )
    await page.route("**/api/setup/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ completed: true, currentStep: "done", setupCompleted: true }),
      }),
    )
    await page.route("**/api/ui/shell", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
    )
    await page.route("**/api/capabilities", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], generatedAt: Date.now() }),
      }),
    )
    await page.route("**/api/capabilities/yeonjang**", (route) => {
      const url = new URL(route.request().url())
      const recoveryMatch = url.pathname.match(
        /^\/api\/capabilities\/yeonjang\/([^/]+)\/recovery$/u,
      )
      if (recoveryMatch && route.request().method() === "POST") {
        const payload = route.request().postDataJSON()
        mutationPayloads.push(payload)
        const item = profileItems.find((candidate) => candidate.yeonjangRef === recoveryMatch[1])
        if (item) {
          item.status = "ready"
          item.permissionState = "ready"
          item.runnable = true
          item.actionableIssue = null
        }
        return new Promise((resolveRoute) =>
          setTimeout(() => {
            resolveRoute(
              route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                  mutationId: payload.envelope.mutationId,
                  state: "active",
                  reasonCode: null,
                  allowedActions: [],
                  revision,
                  yeonjangRef: recoveryMatch[1],
                  action: payload.action,
                }),
              }),
            )
          }, 200),
        )
      }
      const bindingMatch = url.pathname.match(
        /^\/api\/capabilities\/yeonjang\/([^/]+)\/bindings\/([^/]+)$/u,
      )
      if (bindingMatch && route.request().method() === "PATCH") {
        const payload = route.request().postDataJSON()
        mutationPayloads.push(payload)
        revision = payload.envelope.targetRevision
        payload.bound ? boundAgentRefs.add(bindingMatch[2]) : boundAgentRefs.delete(bindingMatch[2])
        return new Promise((resolveRoute) =>
          setTimeout(() => {
            resolveRoute(
              route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                  mutationId: payload.envelope.mutationId,
                  state: "active",
                  reasonCode: null,
                  allowedActions: [],
                  revision,
                  yeonjangRef: bindingMatch[1],
                  agentRef: bindingMatch[2],
                  bound: payload.bound,
                }),
              }),
            )
          }, 200),
        )
      }
      if (url.pathname !== "/api/capabilities/yeonjang") {
        const item = profileItems.find((candidate) => url.pathname.endsWith(candidate.yeonjangRef))
        return route.fulfill({
          status: item ? 200 : 404,
          contentType: "application/json",
          body: JSON.stringify(
            item
              ? {
                  ...item,
                  revision,
                  platformSupport: platformSupport(item),
                  bindings: {
                    boundAgents: agents.filter((agent) => boundAgentRefs.has(agent.agentRef)),
                    availableAgents: agents.filter((agent) => !boundAgentRefs.has(agent.agentRef)),
                  },
                }
              : { error: "yeonjang_ref_not_found" },
          ),
        })
      }
      if (mode === "error")
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "yeonjang_fixture_unavailable" }),
        })
      let visibleItems = mode === "empty" ? [] : [...profileItems]
      const search = url.searchParams.get("search")?.toLowerCase()
      if (search)
        visibleItems = visibleItems.filter((item) =>
          item.displayName.toLowerCase().includes(search),
        )
      for (const key of ["location", "platform", "status"]) {
        const value = url.searchParams.get(key)
        if (value) visibleItems = visibleItems.filter((item) => item[key] === value)
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: visibleItems,
          nextCursor: null,
          cursorValid: true,
          totalMatches: visibleItems.length,
          summary: summary(visibleItems),
          observedAt: Date.now(),
          revision,
        }),
      })
    })

    await page.goto(applicationUrl, { waitUntil: "domcontentloaded" })
    await page.getByRole("heading", { name: "연장", exact: true }).waitFor()
    await page.getByRole("button", { name: /Design Mac/ }).waitFor()

    await page.getByLabel("위치").selectOption("remote")
    await page.getByRole("button", { name: /Remote Linux/ }).waitFor()
    await page.getByRole("button", { name: /Design Mac/ }).waitFor({ state: "detached" })
    const localHiddenByFilter =
      (await page.getByRole("button", { name: /Design Mac/ }).count()) === 0
    await page.getByLabel("위치").selectOption("")
    await page.getByLabel("연장 검색").fill("Design")
    await page.getByRole("button", { name: /Design Mac/ }).waitFor()
    await page.getByRole("button", { name: /Remote Linux/ }).waitFor({ state: "detached" })
    const remoteHiddenBySearch =
      (await page.getByRole("button", { name: /Remote Linux/ }).count()) === 0

    await page.getByLabel("연장 검색").fill("")
    await page.getByRole("button", { name: /Remote Linux/ }).click()
    await page.getByRole("dialog").waitFor()
    const platformSupportVisible = await page.getByText("플랫폼 지원").isVisible()
    const detailRedacted = !(await page.getByRole("dialog").textContent()).match(
      /instanceId|mqtt|fingerprint|sessionId/u,
    )
    await page.getByRole("button", { name: "권한 다시 확인" }).click()
    await page.getByText("실행 전 확인").waitFor()
    await page.getByRole("button", { name: "실행", exact: true }).click()
    await page.getByRole("button", { name: "Close Remote Linux" }).click()
    const recoveryCloseBlocked = await page.getByRole("dialog").isVisible()
    await page.getByText("확인 완료").waitFor()

    await page.getByRole("button", { name: "연결 관리" }).click()
    await page.getByLabel("Analyst").check()
    await page.getByRole("button", { name: "연결 저장" }).click()
    await page.getByRole("button", { name: "Close Remote Linux" }).click()
    const bindingCloseBlocked = await page.getByRole("dialog").isVisible()
    await page.getByText("1개 에이전트가 이 연장을 사용할 수 있습니다.").waitFor()
    const bindingSaved = await page.getByText("Analyst", { exact: true }).isVisible()
    const payloadsRedacted = mutationPayloads.every(
      (payload) =>
        !JSON.stringify(payload).match(/instanceId|agentId|mqtt|fingerprint|sessionId/u) &&
        payload.envelope?.scope === "capability:write",
    )

    const detailScreenshotPath = resolve(`.tasks/yeonjang-catalog-${profile.id}-detail.png`)
    await page.screenshot({ path: detailScreenshotPath, fullPage: true })
    await page.getByRole("button", { name: "Close Remote Linux" }).click()
    const focusReturned = await page.evaluate(
      () => document.activeElement?.textContent?.includes("Remote Linux") === true,
    )

    mode = "error"
    await page.getByRole("button", { name: "새로고침" }).click()
    await page.getByText("yeonjang_fixture_unavailable").waitFor()
    const errorVisible = await page.getByRole("button", { name: "다시 시도" }).isVisible()
    mode = "empty"
    await page.getByRole("button", { name: "다시 시도" }).click()
    await page.getByText("조건에 맞는 연장이 없습니다").waitFor()
    const fallbackVisible = await page
      .getByText(/Knowbee 자체 기능은 계속 사용할 수 있습니다/)
      .isVisible()

    const layout = await page.evaluate(() => {
      const controls = [
        ...document.querySelectorAll("main input, main select, main button, header button"),
      ]
      const smallestControl = controls
        .map((node) => ({
          height: node.getBoundingClientRect().height,
          tag: node.tagName.toLowerCase(),
          label:
            node.getAttribute("aria-label") ??
            node.textContent?.trim().replaceAll(/\s+/gu, " ").slice(0, 80) ??
            "",
        }))
        .sort((left, right) => left.height - right.height)[0]
      return {
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        minControlHeight: smallestControl?.height ?? 0,
        minControlTag: smallestControl?.tag ?? "none",
        minControlLabel: smallestControl?.label ?? "none",
      }
    })
    const screenshotPath = resolve(`.tasks/yeonjang-catalog-${profile.id}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    results.push({
      profileId: profile.id,
      localHiddenByFilter,
      remoteHiddenBySearch,
      detailRedacted,
      platformSupportVisible,
      recoveryCloseBlocked,
      bindingCloseBlocked,
      bindingSaved,
      payloadsRedacted,
      focusReturned,
      errorVisible,
      fallbackVisible,
      layout,
      detailScreenshotPath,
      screenshotPath,
    })
    await context.close()
  }
  const status = results.every(
    (entry) =>
      entry.localHiddenByFilter &&
      entry.remoteHiddenBySearch &&
      entry.detailRedacted &&
      entry.platformSupportVisible &&
      entry.recoveryCloseBlocked &&
      entry.bindingCloseBlocked &&
      entry.bindingSaved &&
      entry.payloadsRedacted &&
      entry.focusReturned &&
      entry.errorVisible &&
      entry.fallbackVisible &&
      !entry.layout.horizontalOverflow &&
      entry.layout.minControlHeight >= 44,
  )
    ? "passed"
    : "failed"
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ status, results }, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ status, outputPath, results }, null, 2)}\n`)
  if (status !== "passed") process.exitCode = 1
} finally {
  await browser.close()
}
