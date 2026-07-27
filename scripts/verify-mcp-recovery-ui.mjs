import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const applicationUrl = process.argv[2] ?? "http://127.0.0.1:4220/capabilities/mcp"
const executablePath = process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/mcp-recovery-ui-evidence.json")
const refs = { penpot: `mcp_v1_${"a".repeat(24)}`, broken: `mcp_v1_${"b".repeat(24)}` }
const agents = [
  { agentRef: `agent_v1_${"c".repeat(24)}`, name: "Analyst" },
  { agentRef: `agent_v1_${"d".repeat(24)}`, name: "Writer" },
]

const browser = await chromium.launch({ executablePath, headless: true })
try {
  const results = []
  for (const profile of [
    { id: "desktop", viewport: { width: 1440, height: 900 } },
    { id: "mobile", viewport: { width: 390, height: 844 } },
  ]) {
    const state = {
      penpot: { revision: 7, runtimeStatus: "unavailable", issueCode: "mcp_runtime_unavailable" },
      broken: { revision: 7, runtimeStatus: "unavailable", issueCode: "mcp_runtime_unavailable" },
    }
    const keyForRef = (ref) => Object.entries(refs).find(([, value]) => value === ref)?.[0]
    const tools = Array.from({ length: 200 }, (_, index) => ({
      name: `tool-${index}`,
      description: index === 137 ? "needle-137 operation" : "design operation",
      access: [
        { ...agents[0], agentName: agents[0].name, status: "allowed" },
        { ...agents[1], agentName: agents[1].name, status: "not_bound" },
      ].map(({ name: _name, ...entry }) => entry),
    }))
    const item = (key) => ({
      mcpRef: refs[key], displayName: key === "penpot" ? "Penpot" : "Broken MCP", transport: "stdio",
      configuredStatus: "enabled", runtimeStatus: state[key].runtimeStatus, required: false,
      toolCount: 200, bindingCount: 1, issueCode: state[key].issueCode, revision: state[key].revision,
    })
    const detail = (key) => ({ ...item(key), tools, bindings: { boundAgents: [agents[0]], availableAgents: [agents[1]] } })
    const context = await browser.newContext({ viewport: profile.viewport })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    await page.route("**/api/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ setupCompleted: true }) }))
    await page.route("**/api/setup/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ completed: true, currentStep: "done", setupCompleted: true }) }))
    await page.route("**/api/ui/shell", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }))
    await page.route("**/api/capabilities", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], generatedAt: Date.now() }) }))
    await page.route("**/api/capabilities/mcp**", async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()
      const ref = Object.values(refs).find((candidate) => path.includes(candidate))
      const key = ref ? keyForRef(ref) : undefined
      if (key && path.endsWith("/probe") && method === "POST")
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "ready", ready: true, reasonCode: null, observedAt: Date.now() }) })
      if (key && path.endsWith("/recover") && method === "POST") {
        const body = request.postDataJSON()
        if (key === "broken")
          return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ mutationId: body.envelope.mutationId, state: "rolled_back", reasonCode: "mcp_recovery_not_ready", allowedActions: ["retry"], revision: state[key].revision, mcpRef: refs[key], ready: false, toolCount: 0 }) })
        state[key].revision = body.envelope.targetRevision
        state[key].runtimeStatus = "ready"
        state[key].issueCode = null
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mutationId: body.envelope.mutationId, state: "active", reasonCode: null, allowedActions: [], revision: state[key].revision, mcpRef: refs[key], ready: true, toolCount: 200 }) })
      }
      if (key && path === `/api/capabilities/mcp/${refs[key]}` && method === "GET")
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail(key)) })
      if (path === "/api/capabilities/mcp" && method === "GET")
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [item("penpot"), item("broken")], nextCursor: null, revision: Math.max(state.penpot.revision, state.broken.revision), observedAt: Date.now() }) })
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
    })

    await page.goto(applicationUrl, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: /Penpot/ }).click()
    await page.getByLabel("도구 검색").fill("needle-137")
    await page.getByText("1개 결과").waitFor()
    const searchResultVisible = await page.getByText("tool-137", { exact: true }).isVisible()
    await page.getByRole("combobox", { name: "에이전트", exact: true }).selectOption({ label: "Writer" })
    const accessVisible = await page.getByText("연결 안 됨", { exact: true }).isVisible()
    await page.getByRole("button", { name: "다시 검사" }).click()
    await page.getByText("연결 복구 완료").waitFor()
    const recoverySucceeded = await page.getByText("최신 도구 상태를 확인했습니다.").isVisible()
    await page.getByRole("button", { name: "Close Penpot" }).click()
    const focusReturned = await page.evaluate(() => document.activeElement?.textContent?.includes("Penpot") === true)
    await page.getByRole("button", { name: /Broken MCP/ }).click()
    await page.getByRole("button", { name: "다시 검사" }).click()
    await page.getByText("연결 복구 실패").waitFor()
    const failureVisible = await page.getByText("재적용 후 연결이 준비되지 않았습니다.").isVisible()
    const layout = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        dialogOverflow: dialog ? dialog.scrollWidth > dialog.clientWidth : true,
      }
    })
    const screenshotPath = resolve(`.tasks/mcp-recovery-${profile.id}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    results.push({ profileId: profile.id, searchResultVisible, accessVisible, recoverySucceeded, focusReturned, failureVisible, layout, screenshotPath })
    await context.close()
  }
  const status = results.every((entry) => entry.searchResultVisible && entry.accessVisible && entry.recoverySucceeded && entry.focusReturned && entry.failureVisible && !entry.layout.overflow && !entry.layout.dialogOverflow) ? "passed" : "failed"
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ status, results }, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ status, outputPath, results }, null, 2)}\n`)
} finally {
  await browser.close()
}
