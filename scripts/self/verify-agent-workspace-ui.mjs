import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "playwright-core"

const url = process.argv[2] ?? "http://127.0.0.1:4220/agents"
const defaultChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const executablePath = process.argv[3] ?? (existsSync(defaultChromePath) ? defaultChromePath : null)
const outputPath = resolve(process.argv[4] ?? ".tasks/agent-workspace-ui-evidence.json")
const fixtureMode = process.argv[5] === "fixture"
const token = process.env.KNOWBEE_TEST_TOKEN ?? (fixtureMode ? "fixture-token" : "")
if (!token) throw new Error("knowbee_test_token_required")
const createdAgentRef = `agent_v1_${"f".repeat(24)}`
async function ensureAdvancedSettingsOpen(dialog) {
  if ((await dialog.getByRole("button", { name: "AI", exact: true }).count()) > 0) return
  await dialog.getByText(/고급 설정|Advanced settings/u).click()
}
const fixtureItems = Array.from({ length: 100 }, (_, index) => ({
  agentRef: `agent_v1_${index.toString(16).padStart(24, "0")}`,
  name: `Agent ${index.toString().padStart(3, "0")}`,
  role: index % 2 === 0 ? "Research" : "Review",
  status: "enabled",
  profileVersion: 1,
  updatedAt: 1_000,
  model: { configured: true, availability: "ready", modelName: "worker" },
  parentName: "마당쇠",
  directChildCount: 0,
  bindingCounts: { skills: 1, mcpServers: 0, yeonjang: 0 },
  diagnosticCodes: [],
}))
const browser = await chromium.launch(
  executablePath ? { executablePath, headless: true } : { channel: "chrome", headless: true },
)
try {
  const results = []
  for (const profile of [
    { id: "desktop", viewport: { width: 1440, height: 900 } },
    { id: "mobile", viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: profile.viewport })
    await context.addInitScript((value) => localStorage.setItem("knowbee_token", value), token)
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    const pageErrors = []
    page.on("pageerror", (error) => pageErrors.push(String(error)))
    const items = fixtureItems.map((item) => ({ ...item }))
    let capabilityQueryCount = 0
    let relationshipQueryCount = 0
    let settingsQueryCount = 0
    let settingsMutationCount = 0
    let settingsIdempotencyObserved = true
    let relationshipRevision = 100
    const relationshipRootRef = `agent_v1_${"e".repeat(24)}`
    const relationships = new Map(
      items.map((item, index) => [
        item.agentRef,
        {
          relationshipRef: `relationship_v1_${(index + 1).toString(16).padStart(24, "0")}`,
          parentRef: relationshipRootRef,
          parentName: "마당쇠",
          childRef: item.agentRef,
          childName: item.name,
          depth: 1,
          sortOrder: index,
        },
      ]),
    )
    const capabilities = [
      {
        capabilityRef: `skill_v1_${"a".repeat(24)}`,
        kind: "skill",
        displayName: "UI UX Pro Max",
        catalogStatus: "enabled",
        runtimeStatus: "ready",
        bound: false,
        editable: true,
        revision: 11,
        reasonCodes: [],
      },
      {
        capabilityRef: `mcp_v1_${"b".repeat(24)}`,
        kind: "mcp_server",
        displayName: "Penpot",
        catalogStatus: "enabled",
        runtimeStatus: "ready",
        bound: true,
        editable: true,
        revision: 12,
        reasonCodes: [],
      },
      {
        capabilityRef: `yeonjang_v1_${"c".repeat(24)}`,
        kind: "yeonjang",
        displayName: "Studio Mac",
        catalogStatus: "enabled",
        runtimeStatus: "ready",
        bound: false,
        editable: true,
        revision: 13,
        reasonCodes: [],
      },
    ]
    const capabilityRevisions = { skill: 11, mcp_server: 12, yeonjang: 13 }
    const settingsByAgent = new Map()
    const settingsFor = (agentRef) => {
      if (!settingsByAgent.has(agentRef)) {
        settingsByAgent.set(agentRef, {
          agentRef,
          status: "enabled",
          revision: 2,
          model: {
            configured: true,
            availability: "configured",
            providerName: "openai",
            modelName: `gpt-5-${agentRef.slice(-4)}`,
            effort: "high",
          },
          memory: {
            retentionPolicy: "long_term",
            capsuleMode: "rolling_summary",
            rawWindowSize: 24,
            compactThreshold: 40,
            writebackReviewRequired: true,
            lastCompactedAt: null,
            capsuleCount: 3,
          },
          permission: {
            riskCeiling: "sensitive",
            approvalRequiredFrom: "external",
            allowExternalNetwork: true,
            allowFilesystemWrite: false,
            allowShellExecution: false,
            allowScreenControl: true,
            allowedPathCount: 2,
          },
          diagnosticCodes: [],
          observedAt: Date.now(),
        })
      }
      return settingsByAgent.get(agentRef)
    }
    if (fixtureMode) {
      await page.route("**/api/agent-workspace**", async (route) => {
        const method = route.request().method()
        const requestUrl = new URL(route.request().url())
        const archiveMatch = requestUrl.pathname.match(
          /\/api\/agent-workspace\/(agent_v1_[a-f0-9]{24})\/archive$/u,
        )
        const detailMatch = requestUrl.pathname.match(
          /\/api\/agent-workspace\/(agent_v1_[a-f0-9]{24})$/u,
        )
        const capabilityMatch = requestUrl.pathname.match(
          /\/api\/agent-workspace\/(agent_v1_[a-f0-9]{24})\/capabilities\/(skill_v1_[a-f0-9]{24}|mcp_v1_[a-f0-9]{24}|yeonjang_v1_[a-f0-9]{24})$/u,
        )
        const capabilityListMatch = requestUrl.pathname.match(
          /\/api\/agent-workspace\/(agent_v1_[a-f0-9]{24})\/capabilities$/u,
        )
        const relationshipParentMatch = requestUrl.pathname.match(
          /\/api\/agent-workspace\/(agent_v1_[a-f0-9]{24})\/parent$/u,
        )
        const settingsMatch = requestUrl.pathname.match(
          /\/api\/agent-workspace\/(agent_v1_[a-f0-9]{24})\/settings$/u,
        )
        const body = method === "GET" ? {} : route.request().postDataJSON()
        if (settingsMatch && method === "GET") {
          settingsQueryCount += 1
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 120))
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(settingsFor(settingsMatch[1])),
          })
          return
        }
        if (settingsMatch && method === "PATCH") {
          settingsMutationCount += 1
          const state = settingsFor(settingsMatch[1])
          const idempotencyKey = route.request().headers()["idempotency-key"]
          settingsIdempotencyObserved =
            settingsIdempotencyObserved &&
            typeof idempotencyKey === "string" &&
            idempotencyKey.length >= 8
          if (body.targetRevision !== state.revision + 1) {
            await route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({ state: "conflict", reasonCode: "mutation_revision_conflict" }),
            })
            return
          }
          if (
            body.kind === "update_permission" &&
            body.value.allowFilesystemWrite &&
            !state.permission.allowFilesystemWrite &&
            body.confirmElevation !== true
          ) {
            await route.fulfill({
              status: 403,
              contentType: "application/json",
              body: JSON.stringify({ state: "rejected", reasonCode: "mutation_scope_denied" }),
            })
            return
          }
          if (body.kind === "clear_model") {
            state.model = { configured: false, availability: "inherited" }
          } else if (body.kind === "update_model") {
            state.model = { configured: true, availability: "configured", ...body.value }
          } else if (body.kind === "update_memory") {
            state.memory = { ...state.memory, ...body.value }
          } else if (body.kind === "update_permission") {
            state.permission = { ...state.permission, ...body.value }
          }
          state.revision = body.targetRevision
          state.observedAt = Date.now()
          const item = items.find((candidate) => candidate.agentRef === settingsMatch[1])
          item.profileVersion = state.revision
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 120))
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              mutationId: `agent-settings:${idempotencyKey}`,
              kind: body.kind,
              state: "active",
              reasonCode: null,
              revision: state.revision,
              agentRef: settingsMatch[1],
              allowedActions: [],
            }),
          })
          return
        }
        if (requestUrl.pathname === "/api/agent-workspace/relationships" && method === "GET") {
          relationshipQueryCount += 1
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              root: { agentRef: relationshipRootRef, name: "마당쇠" },
              relationships: [...relationships.values()],
              revision: relationshipRevision,
              observedAt: Date.now(),
            }),
          })
          return
        }
        if (relationshipParentMatch && method === "PATCH") {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 150))
          const child = items.find((candidate) => candidate.agentRef === relationshipParentMatch[1])
          relationshipRevision = body.mutation.targetRevision
          if (body.kind === "disconnect") relationships.delete(relationshipParentMatch[1])
          else {
            const parent = items.find((candidate) => candidate.agentRef === body.parentRef)
            relationships.set(relationshipParentMatch[1], {
              relationshipRef:
                relationships.get(relationshipParentMatch[1])?.relationshipRef ??
                `relationship_v1_${"d".repeat(24)}`,
              parentRef: body.parentRef,
              parentName: parent?.name ?? "마당쇠",
              childRef: relationshipParentMatch[1],
              childName: child?.name ?? "Agent",
              depth: body.parentRef === relationshipRootRef ? 1 : 2,
              sortOrder: 0,
            })
          }
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              mutationId: body.mutation.mutationId,
              kind: body.kind,
              state: "active",
              reasonCode: null,
              revision: relationshipRevision,
              childRef: relationshipParentMatch[1],
              parentRef: body.parentRef,
              allowedActions: [],
            }),
          })
          return
        }
        if (capabilityMatch && method === "PATCH") {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 120))
          const capability = capabilities.find(
            (candidate) => candidate.capabilityRef === capabilityMatch[2],
          )
          if (capability.kind === "yeonjang") {
            await route.fulfill({
              status: 422,
              contentType: "application/json",
              body: JSON.stringify({
                state: "rejected",
                reasonCode: "capability_runtime_unavailable",
              }),
            })
            return
          }
          capability.bound = body.bound
          capability.revision = body.mutation.targetRevision
          capabilityRevisions[capability.kind] = body.mutation.targetRevision
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              mutationId: body.mutation.mutationId,
              kind: capability.kind,
              state: "active",
              reasonCode: null,
              revision: capability.revision,
              agentRef: capabilityMatch[1],
              capabilityRef: capability.capabilityRef,
              bound: capability.bound,
              allowedActions: [],
            }),
          })
          return
        }
        if (capabilityListMatch && method === "GET") {
          capabilityQueryCount += 1
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              agentRef: capabilityListMatch[1],
              items: capabilities,
              orphanReasonCodes: [],
              revisions: capabilityRevisions,
              observedAt: Date.now(),
            }),
          })
          return
        }
        if (archiveMatch && method === "POST") {
          const item = items.find((candidate) => candidate.agentRef === archiveMatch[1])
          item.status = "archived"
          item.profileVersion += 1
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              mutationId: body.mutation.mutationId,
              kind: "archive",
              state: "active",
              agentRef: item.agentRef,
              revision: item.profileVersion,
              transitions: ["draft", "validating", "persisting", "verifying", "active"],
            }),
          })
          return
        }
        if (detailMatch && method === "PATCH") {
          const item = items.find((candidate) => candidate.agentRef === detailMatch[1])
          if (body.name === "Conflict Draft") {
            await route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({ state: "conflict", reasonCode: "agent_revision_conflict" }),
            })
            return
          }
          item.name = body.name
          item.role = body.role
          item.profileVersion += 1
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              mutationId: body.mutation.mutationId,
              kind: "update",
              state: "active",
              agentRef: item.agentRef,
              revision: item.profileVersion,
              name: item.name,
              role: item.role,
              transitions: ["draft", "validating", "persisting", "verifying", "active"],
            }),
          })
          return
        }
        if (detailMatch && method === "GET") {
          const item = items.find((candidate) => candidate.agentRef === detailMatch[1])
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              ...item,
              bindingNames: { skills: ["UI UX Pro Max"], mcpServers: [], yeonjang: [] },
              directChildNames: [],
            }),
          })
          return
        }
        if (requestUrl.pathname === "/api/agent-workspace" && method === "POST") {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 180))
          const item = {
            ...fixtureItems[0],
            agentRef: createdAgentRef,
            name: body.name,
            role: body.role,
            profileVersion: 1,
          }
          items.push(item)
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              mutationId: body.mutation.mutationId,
              kind: "create",
              state: "active",
              agentRef: item.agentRef,
              revision: 1,
              name: item.name,
              role: item.role,
              transitions: ["draft", "validating", "persisting", "verifying", "active"],
            }),
          })
          return
        }
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            items,
            nextCursor: null,
            cursorValid: true,
            totalMatches: items.length,
            summary: {
              total: items.length,
              enabled: items.filter((item) => item.status === "enabled").length,
              disabled: 0,
              archived: items.filter((item) => item.status === "archived").length,
              degraded: 0,
              issueCount: 0,
              diagnosticCodes: [],
            },
            observedAt: 1_000,
          }),
        })
      })
    }
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("heading", { name: /서브 에이전트|Sub-agents/u }).waitFor()
    const emptyVisible = fixtureMode
      ? false
      : await page.getByText("등록된 서브 에이전트가 없습니다").isVisible()
    let rowCount = 0
    let focusReturned = false
    let mutationFlow = false
    let capabilityFlow = false
    let capabilityChecks = null
    let relationshipFlow = false
    let settingsFlow = false
    let settingsOwnerSwitch = false
    let relationshipChecks = null
    let drawerGeometry = null
    if (fixtureMode) {
      await page.getByRole("button", { name: "에이전트 추가" }).click()
      const createDialog = page.getByRole("dialog")
      await createDialog.getByLabel("에이전트 이름").fill("Browser Agent")
      await createDialog.getByLabel("에이전트 역할").fill("Browser verification")
      await createDialog.getByRole("button", { name: "저장" }).click()
      const guardedDuringSave = await createDialog
        .getByRole("button", { name: /Close/ })
        .isDisabled()
      const createdListItem = page.locator(
        `[aria-label="서브 에이전트 목록"] [data-agent-ref="${createdAgentRef}"]`,
      )
      await createdListItem.waitFor({ state: "attached" })
      await createdListItem.scrollIntoViewIfNeeded()
      const createdListVisible = await createdListItem.isVisible()
      const createdCanvasNode = page
        .getByTestId("agent-relationship-canvas")
        .locator(`[data-agent-ref="${createdAgentRef}"]`)
      await createdCanvasNode.waitFor()
      const createdReflectedInCanvas = (await createdCanvasNode.count()) === 1
      const firstAgentListItem = page.locator(
        `[aria-label="서브 에이전트 목록"] [data-agent-ref="${items[0].agentRef}"]`,
      )
      const settingsPanel = page.locator(
        '[aria-label="에이전트 설정"], [aria-label="Agent settings"]',
      )
      await firstAgentListItem.click()
      await settingsPanel.getByRole("heading", { name: /Agent 000/u }).waitFor()
      const nameInput = settingsPanel.getByLabel("에이전트 이름")
      await nameInput.fill("A")
      await nameInput.press("Backspace")
      const lastCharacterDeleted = (await nameInput.inputValue()) === ""
      await nameInput.fill("Conflict Draft")
      await settingsPanel.getByRole("button", { name: "저장" }).click()
      await settingsPanel.locator('[role="alert"][data-recovery-kind="conflict"]').waitFor()
      const draftPreserved = (await nameInput.inputValue()) === "Conflict Draft"
      await nameInput.fill("Agent 000 Edited")
      await settingsPanel.getByLabel("에이전트 역할").fill("Updated role")
      await settingsPanel.getByRole("button", { name: "저장" }).click()
      await settingsPanel.getByRole("heading", { name: "Agent 000 Edited", exact: true }).waitFor()
      focusReturned = await settingsPanel
        .getByRole("heading", { name: "Agent 000 Edited", exact: true })
        .isVisible()
      rowCount = await page.locator('[aria-label="서브 에이전트 목록"] [data-agent-ref]').count()
      mutationFlow =
        guardedDuringSave &&
        createdListVisible &&
        createdReflectedInCanvas &&
        lastCharacterDeleted &&
        draftPreserved
      await firstAgentListItem.click()
      const capabilityQueryCountBeforeOpen = capabilityQueryCount
      const capabilityLazyBeforeSelection = capabilityQueryCountBeforeOpen === 0
      await settingsPanel.getByRole("button", { name: "기능", exact: true }).click()
      await settingsPanel.getByText("UI UX Pro Max", { exact: true }).waitFor()
      const capabilityLoadedAfterSelection =
        capabilityQueryCount >= capabilityQueryCountBeforeOpen + 1
      await settingsPanel.getByLabel("UI UX Pro Max 연결").check()
      await settingsPanel.getByLabel("Penpot 연결").uncheck()
      await settingsPanel.getByLabel("Studio Mac 연결").check()
      await settingsPanel.getByRole("button", { name: "기능 저장" }).click()
      const capabilityCloseGuard = await settingsPanel
        .getByRole("button", { name: "기능 저장" })
        .isDisabled()
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (button) => button.textContent?.includes("기능 저장") && !button.disabled,
        ),
      )
      const successfulDraftsVerified =
        (await settingsPanel.getByLabel("UI UX Pro Max 연결").isChecked()) &&
        !(await settingsPanel.getByLabel("Penpot 연결").isChecked())
      const failedDraftPreserved =
        (await settingsPanel.getByLabel("Studio Mac 연결").isChecked()) &&
        (await settingsPanel.getByText("변경 1", { exact: true }).isVisible())
      const failedCapabilityNotPersisted = !(await settingsPanel
        .getByLabel("Studio Mac 연결")
        .isChecked())
      const capabilityRequeried = capabilityQueryCount >= capabilityQueryCountBeforeOpen + 2
      capabilityFlow =
        capabilityLazyBeforeSelection &&
        capabilityLoadedAfterSelection &&
        capabilityCloseGuard &&
        successfulDraftsVerified &&
        (failedDraftPreserved || failedCapabilityNotPersisted) &&
        capabilityRequeried
      capabilityChecks = {
        capabilityLazyBeforeSelection,
        capabilityLoadedAfterSelection,
        capabilityCloseGuard,
        successfulDraftsVerified,
        failedDraftPreserved,
        failedCapabilityNotPersisted,
        capabilityRequeried,
      }
      const settingsLazyBeforeSelection = settingsQueryCount === 0
      await ensureAdvancedSettingsOpen(settingsPanel)
      await settingsPanel.getByRole("button", { name: "AI", exact: true }).click()
      const modelInput = settingsPanel.getByLabel("모델", { exact: true })
      await modelInput.waitFor()
      await modelInput.fill("gpt-5-browser")
      await settingsPanel.getByRole("button", { name: "설정 저장" }).click()
      const settingsCloseGuard = await settingsPanel
        .getByRole("button", { name: "설정 저장" })
        .isDisabled()
      await page.waitForFunction(() => {
        const input = document.querySelector('input[aria-label="모델"]')
        return input && !input.disabled && input.value === "gpt-5-browser"
      })
      const aiAuthoritativeRequery = settingsQueryCount === 2
      await settingsPanel.getByRole("button", { name: "메모리", exact: true }).click()
      const compactMode = settingsPanel.getByLabel("압축 방식")
      await compactMode.waitFor()
      const compactModeLoaded = (await compactMode.inputValue()) === "rolling_summary"
      const settingsSingleRequestDuringTransition = settingsQueryCount === 2
      await settingsPanel.getByRole("button", { name: "권한", exact: true }).click()
      await settingsPanel.getByText("외부 네트워크", { exact: true }).waitFor()
      const settingsCacheReused = settingsQueryCount === 2
      const filesystemToggle = settingsPanel.getByLabel("파일 쓰기")
      await filesystemToggle.check()
      const elevationNoticeVisible = await settingsPanel
        .getByText("권한이 확대되는 변경임을 확인했습니다.")
        .isVisible()
      const saveDisabledBeforeConfirmation = await settingsPanel
        .getByRole("button", { name: "설정 저장" })
        .isDisabled()
      const elevationConfirmation = settingsPanel.getByLabel(
        "권한이 확대되는 변경임을 확인했습니다.",
      )
      await elevationConfirmation.check()
      await page.waitForFunction(() => {
        const buttons = [...document.querySelectorAll("button")]
        const save = buttons.find((candidate) => candidate.textContent?.trim() === "설정 저장")
        return save && !save.disabled
      })
      await settingsPanel.getByRole("button", { name: "설정 저장" }).click()
      await page.waitForFunction(() => {
        const input = [...document.querySelectorAll('input[type="checkbox"]')].find((candidate) =>
          candidate.closest("label")?.textContent?.includes("파일 쓰기"),
        )
        return input && !input.disabled && input.checked
      })
      const permissionAuthoritativeRequery = settingsQueryCount === 3
      const privateSettingsHidden = await settingsPanel.evaluate(
        (node) =>
          !/ownerId|readScopes|writeScope|allowedPaths|profileId|secretScope|private-agent-id|\/Users\/private/iu.test(
            node.textContent ?? "",
          ),
      )
      settingsFlow =
        settingsLazyBeforeSelection &&
        settingsCloseGuard &&
        aiAuthoritativeRequery &&
        compactModeLoaded &&
        settingsSingleRequestDuringTransition &&
        settingsCacheReused &&
        elevationNoticeVisible &&
        saveDisabledBeforeConfirmation &&
        permissionAuthoritativeRequery &&
        settingsMutationCount === 2 &&
        settingsIdempotencyObserved &&
        privateSettingsHidden
      const relationshipVisibleBeforeDelegation = await page
        .getByTestId("agent-relationship-canvas")
        .isVisible()
      const relationshipLoadedBeforeDelegation = relationshipQueryCount >= 1
      await settingsPanel.getByRole("button", { name: "위임", exact: true }).click()
      const parentSelect = settingsPanel.getByLabel("상위 에이전트")
      await parentSelect.waitFor()
      await parentSelect.selectOption(items[1].agentRef)
      const relationshipQueryCountBeforeSave = relationshipQueryCount
      await settingsPanel.getByRole("button", { name: "위임 저장" }).click()
      const relationshipCloseGuard = await settingsPanel
        .getByRole("button", { name: "위임 저장" })
        .isDisabled()
      await page.waitForFunction(() => {
        const select = document.querySelector('select[aria-label="상위 에이전트"]')
        return select && !select.disabled
      })
      const relationshipDraftVerified = (await parentSelect.inputValue()) === items[1].agentRef
      const relationshipRequeried = relationshipQueryCount >= relationshipQueryCountBeforeSave + 1
      const canvas = page.getByTestId("agent-relationship-canvas")
      await canvas.waitFor()
      const rootHidden =
        (await canvas.locator(`[data-agent-ref="${relationshipRootRef}"]`).count()) === 0
      const canvasNodeCount = await canvas.getByTestId("agent-relationship-node").count()
      await canvas
        .getByTestId("agent-relationship-node")
        .first()
        .evaluate((node) => node.click())
      await settingsPanel.getByRole("heading", { name: /Agent/u }).first().waitFor()
      const canvasSelectionUpdatedSettingsPanel = await settingsPanel
        .getByRole("heading", { name: /Agent/u })
        .first()
        .isVisible()
      relationshipFlow =
        relationshipVisibleBeforeDelegation &&
        relationshipLoadedBeforeDelegation &&
        relationshipCloseGuard &&
        relationshipDraftVerified &&
        relationshipRequeried &&
        rootHidden &&
        canvasNodeCount === items.length &&
        canvasSelectionUpdatedSettingsPanel
      await ensureAdvancedSettingsOpen(settingsPanel)
      await settingsPanel.getByRole("button", { name: "AI", exact: true }).click()
      await page.waitForTimeout(25)
      await page
        .locator(`[aria-label="서브 에이전트 목록"] [data-agent-ref="${items[2].agentRef}"]`)
        .click()
      await settingsPanel.getByRole("button", { name: "AI", exact: true }).click()
      const switchedModel = settingsPanel.getByLabel("모델", { exact: true })
      await switchedModel.waitFor()
      settingsOwnerSwitch =
        settingsQueryCount === 5 &&
        (await switchedModel.inputValue()) === `gpt-5-${items[2].agentRef.slice(-4)}`
      settingsFlow = settingsFlow && settingsOwnerSwitch
      relationshipChecks = {
        relationshipVisibleBeforeDelegation,
        relationshipLoadedBeforeDelegation,
        relationshipCloseGuard,
        relationshipDraftVerified,
        relationshipRequeried,
        rootHidden,
        canvasNodeCount,
        expectedCanvasNodeCount: items.length,
        canvasSelectionUpdatedSettingsPanel,
      }
      drawerGeometry = await settingsPanel.evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
      }))
    }
    const controls = await page.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll(
          "main button, main input, main select, .h-full > header button",
        ),
      ].filter(
        (node) =>
          !node.closest(".react-flow__controls") && !node.closest(".react-flow__attribution"),
      )
      const measuredNodes = nodes.filter(
        (node) => !(node instanceof HTMLInputElement && ["checkbox", "radio"].includes(node.type)),
      )
      return {
        minimumHeight: Math.min(
          ...measuredNodes.map((node) => node.getBoundingClientRect().height),
        ),
        smallControls: measuredNodes
          .map((node) => ({
            tagName: node.tagName,
            text: node.textContent?.trim() ?? "",
            ariaLabel: node.getAttribute("aria-label"),
            className: node.getAttribute("class"),
            height: Math.round(node.getBoundingClientRect().height),
          }))
          .filter((node) => node.height < 44),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    const workspaceLayout = await page.evaluate(() => {
      const workspace = document.querySelector(
        '[aria-label="서브 에이전트 작업대"], [aria-label="Sub-agent workspace"]',
      )
      const list = document.querySelector(
        '[aria-label="서브 에이전트 목록"], [aria-label="Sub-agent list"]',
      )
      const graph = document.querySelector(
        '[aria-label="에이전트 구성"], [aria-label="Agent configuration"]',
      )
      const canvas = document.querySelector(
        '[data-testid="agent-relationship-canvas"], [data-testid="agent-relationship-empty"]',
      )
      const settings = document.querySelector(
        '[aria-label="에이전트 설정"], [aria-label="Agent settings"]',
      )
      const rect = (element) => {
        if (!element) return null
        const value = element.getBoundingClientRect()
        return {
          x: Math.round(value.x),
          y: Math.round(value.y),
          width: Math.round(value.width),
          height: Math.round(value.height),
        }
      }
      const workspaceRect = rect(workspace)
      const listRect = rect(list)
      const graphRect = rect(graph)
      const settingsRect = rect(settings)
      const canvasRect = rect(canvas)
      const desktop = window.innerWidth >= 1280
      const sameWorkspace = Boolean(
        workspace && graph && settings && workspace.contains(graph) && workspace.contains(settings),
      )
      const listAboveWorkspace = Boolean(
        listRect && workspaceRect && listRect.y + listRect.height <= workspaceRect.y + 8,
      )
      const desktopLayout =
        !desktop ||
        Boolean(
          settingsRect &&
            graphRect &&
            graphRect.x < settingsRect.x &&
            graphRect.width > settingsRect.width,
        )
      const mobileLayout =
        desktop ||
        Boolean(
          listRect &&
            graphRect &&
            settingsRect &&
            listRect.y < graphRect.y &&
            graphRect.y <= settingsRect.y,
        )
      const canvasUsesGraphSpace = Boolean(
        canvasRect &&
          graphRect &&
          canvasRect.width >= graphRect.width - 4 &&
          canvasRect.height >= 500,
      )
      const topologyOwnsMainSpace =
        !desktop ||
        Boolean(workspaceRect && graphRect && graphRect.width / workspaceRect.width >= 0.55)
      return {
        sameWorkspace,
        listAboveWorkspace,
        desktopLayout,
        mobileLayout,
        canvasUsesGraphSpace,
        topologyOwnsMainSpace,
        workspace: workspaceRect,
        list: listRect,
        graph: graphRect,
        settings: settingsRect,
        canvas: canvasRect,
      }
    })
    const screenshotPath = resolve(`.tasks/agent-workspace-${profile.id}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    results.push({
      profileId: profile.id,
      emptyVisible,
      rowCount,
      focusReturned,
      mutationFlow,
      capabilityFlow,
      capabilityChecks,
      capabilityQueryCount,
      relationshipFlow,
      relationshipQueryCount,
      relationshipChecks,
      settingsFlow,
      settingsQueryCount,
      settingsMutationCount,
      settingsIdempotencyObserved,
      settingsOwnerSwitch,
      drawerGeometry,
      controls,
      workspaceLayout,
      pageErrors,
      screenshotPath,
    })
    await context.close()
  }
  const status = results.every(
    (result) =>
      (fixtureMode
        ? result.rowCount === 101 &&
          result.focusReturned &&
          result.mutationFlow &&
          result.capabilityFlow &&
          result.relationshipFlow &&
          result.settingsFlow &&
          (result.profileId === "desktop"
            ? result.drawerGeometry.width <= 448
            : result.drawerGeometry.width <= result.drawerGeometry.viewportWidth &&
              result.drawerGeometry.width >= 320)
        : result.emptyVisible) &&
      result.pageErrors.length === 0 &&
      result.controls.minimumHeight >= 44 &&
      !result.controls.horizontalOverflow &&
      result.workspaceLayout.sameWorkspace &&
      result.workspaceLayout.listAboveWorkspace &&
      result.workspaceLayout.desktopLayout &&
      result.workspaceLayout.mobileLayout &&
      result.workspaceLayout.canvasUsesGraphSpace &&
      result.workspaceLayout.topologyOwnsMainSpace,
  )
    ? "passed"
    : "failed"
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify({ status, results }, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ status, results }, null, 2)}\n`)
  if (status !== "passed") process.exitCode = 1
} finally {
  await browser.close()
}
