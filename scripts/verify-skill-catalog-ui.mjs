import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const applicationUrl = process.argv[2] ?? "http://127.0.0.1:18888/capabilities/skills"
const executablePath = process.argv[3] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const outputPath = resolve(process.argv[4] ?? ".tasks/skill-catalog-ui-evidence.json")
const items = [{
  skillRef: `skill_v1_${"a".repeat(24)}`,
  displayName: "UI UX Pro Max",
  description: "UI and UX review guidance",
  sourceKind: "local",
  validationStatus: "valid",
  runtimeStatus: "active",
  bindingCount: 0,
  revision: 7,
}]

const browser = await chromium.launch({ executablePath, headless: true })
try {
  const profiles = [
    { id: "desktop", viewport: { width: 1440, height: 900 } },
    { id: "mobile", viewport: { width: 390, height: 844 } },
  ]
  const results = []
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: profile.viewport })
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    await page.route("**/api/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ setupCompleted: true }) }))
    await page.route("**/api/setup/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ completed: true, currentStep: "done" }) }))
    await page.route("**/api/setup/draft", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }))
    await page.route("**/api/setup/checks", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ setupCompleted: true }) }))
    await page.route("**/api/ui/shell", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "fixture_unavailable" }) }))
    await page.route("**/api/capabilities", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], generatedAt: Date.now() }) }))
    let catalogItems = [...items]
    let revision = 7
    let createRequest = null
    let deleteRequest = null
    const boundAgentRefs = new Set()
    const agents = [{ agentRef: `agent_v1_${"c".repeat(24)}`, name: "Analyst" }]
    let catalogReads = 0
    await page.route("**/api/capabilities/skills**", async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path.endsWith("/validate") && request.method() === "POST") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ready: true, displayName: "Penpot Review", sourceKind: "local", reasonCodes: [] }) })
      }
      if (path.endsWith("/skills") && request.method() === "POST") {
        createRequest = request.postDataJSON()
        revision += 1
        const skillRef = `skill_v1_${"b".repeat(24)}`
        catalogItems = [...catalogItems, { ...items[0], skillRef, displayName: "Penpot Review", description: "Penpot interface review", bindingCount: 0, revision }]
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ mutationId: createRequest.envelope.mutationId, state: "active", reasonCode: null, allowedActions: [], revision, skillRef }) })
      }
      if (request.method() === "PATCH" && path.includes("/bindings/")) {
        const bindingRequest = request.postDataJSON()
        const segments = path.split("/")
        const skillRef = segments.at(-3)
        const agentRef = segments.at(-1)
        revision += 1
        bindingRequest.bound ? boundAgentRefs.add(agentRef) : boundAgentRefs.delete(agentRef)
        catalogItems = catalogItems.map((item) => item.skillRef === skillRef ? { ...item, bindingCount: boundAgentRefs.size, revision } : item)
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mutationId: bindingRequest.envelope.mutationId, state: "active", reasonCode: null, allowedActions: [], revision, skillRef, agentRef, bound: bindingRequest.bound }) })
      }
      if (request.method() === "PATCH") {
        const updateRequest = request.postDataJSON()
        revision += 1
        catalogItems = catalogItems.map((item) => item.skillRef === path.split("/").at(-1) ? { ...item, ...updateRequest.change, revision } : item)
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mutationId: updateRequest.envelope.mutationId, state: "active", reasonCode: null, allowedActions: [], revision, skillRef: path.split("/").at(-1) }) })
      }
      if (request.method() === "DELETE") {
        deleteRequest = request.postDataJSON()
        const skillRef = path.split("/").at(-1)
        revision += 1
        catalogItems = catalogItems.filter((item) => item.skillRef !== skillRef)
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mutationId: deleteRequest.envelope.mutationId, state: "active", reasonCode: null, allowedActions: [], revision, skillRef, deleted: true, impact: { bindingCount: 0, agentNames: [] } }) })
      }
      if (request.method() === "GET" && path.startsWith("/api/capabilities/skills/")) {
        const detail = catalogItems.find((item) => item.skillRef === path.split("/").at(-1))
        const bindings = { boundAgents: agents.filter((agent) => boundAgentRefs.has(agent.agentRef)), availableAgents: agents.filter((agent) => !boundAgentRefs.has(agent.agentRef)) }
        return route.fulfill({ status: detail ? 200 : 404, contentType: "application/json", body: JSON.stringify(detail ? { ...detail, bindings } : { error: "skill_ref_not_found" }) })
      }
      catalogReads += 1
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: catalogItems, nextCursor: null, revision, observedAt: Date.now() }) })
    })
    await page.goto(applicationUrl, { waitUntil: "commit" })
    process.stdout.write(`[${profile.id}] catalog loaded\n`)
    await page.getByRole("heading", { name: "Skills", exact: true }).waitFor()
    const listScreenshotPath = resolve(`.tasks/skill-catalog-${profile.id}-list.png`)
    await page.screenshot({ path: listScreenshotPath, fullPage: true })
    await page.getByRole("button", { name: "UI UX Pro Max" }).click()
    await page.getByRole("dialog").waitFor()
    await page.getByRole("button", { name: "Close UI UX Pro Max" }).click()
    await page.getByRole("button", { name: "Skill 추가" }).click()
    await page.getByLabel("이름").fill("Penpot Review")
    await page.getByLabel("설명").fill("Penpot interface review")
    await page.getByLabel("Skill 폴더").fill("/workspace/skills/penpot")
    await page.getByRole("button", { name: "검사" }).click()
    await page.getByText("검사 완료").waitFor()
    const addScreenshotPath = resolve(`.tasks/skill-catalog-${profile.id}-add.png`)
    await page.screenshot({ path: addScreenshotPath, fullPage: true })
    await page.getByRole("button", { name: "저장" }).click()
    await page.getByRole("dialog").waitFor({ state: "detached" })
    await page.getByRole("button", { name: "Penpot Review" }).waitFor()
    process.stdout.write(`[${profile.id}] create verified\n`)
    await page.getByRole("button", { name: "Penpot Review" }).click()
    await page.getByRole("button", { name: "편집" }).click()
    await page.getByLabel("이름").fill("Penpot UX Review")
    await page.getByLabel("설명").fill("Updated Penpot review")
    await page.getByRole("button", { name: "저장" }).click()
    await page.getByRole("heading", { name: "Penpot UX Review" }).waitFor()
    process.stdout.write(`[${profile.id}] edit verified\n`)
    await page.getByRole("button", { name: "비활성화" }).click()
    await page.getByRole("button", { name: "활성화" }).waitFor()
    await page.getByRole("button", { name: "활성화" }).click()
    await page.getByRole("button", { name: "비활성화" }).waitFor()
    process.stdout.write(`[${profile.id}] status cycle verified\n`)
    const editScreenshotPath = resolve(`.tasks/skill-catalog-${profile.id}-edit.png`)
    await page.screenshot({ path: editScreenshotPath, fullPage: true })
    await page.getByRole("button", { name: "연결 관리" }).click()
    await page.getByLabel("Analyst").check()
    await page.getByRole("button", { name: "연결 저장" }).click()
    await page.getByText("Analyst", { exact: true }).waitFor()
    await page.getByRole("button", { name: "삭제", exact: true }).click()
    await page.getByText("먼저 연결을 해제해 주세요").waitFor()
    await page.getByRole("button", { name: "취소", exact: true }).click()
    await page.getByRole("button", { name: "연결 관리" }).click()
    await page.getByLabel("Analyst").uncheck()
    await page.getByRole("button", { name: "연결 저장" }).click()
    await page.getByText("연결된 에이전트가 없습니다.").waitFor()
    await page.getByRole("button", { name: "삭제", exact: true }).click()
    await page.getByRole("button", { name: "삭제 확인" }).click()
    await page.getByRole("dialog").waitFor({ state: "detached" })
    await page.getByRole("button", { name: "Penpot UX Review" }).waitFor({ state: "detached" })
    process.stdout.write(`[${profile.id}] binding and protected delete verified\n`)
    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    }))
    const screenshotPath = resolve(`.tasks/skill-catalog-${profile.id}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    results.push({
      profileId: profile.id,
      url: page.url(),
      dimensions,
      listScreenshotPath,
      screenshotPath,
      addScreenshotPath,
      editScreenshotPath,
      catalogReads,
      createRequestSafe: Boolean(createRequest)
        && Boolean(deleteRequest)
        && !JSON.stringify(createRequest).includes("actor")
        && createRequest.envelope.targetRevision === 8
        && deleteRequest.envelope.targetRevision === 14
        && revision === 14,
    })
    await context.close()
  }
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ status: results.every((item) => !item.dimensions.horizontalOverflow && item.createRequestSafe && item.catalogReads >= 2) ? "passed" : "failed", results }, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ outputPath, results }, null, 2)}\n`)
} finally {
  await browser.close()
}
