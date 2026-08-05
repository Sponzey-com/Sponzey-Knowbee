import { createElement, createRef } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { localAdapter } from "../packages/webui/src/api/adapters/local.js"
import { SkillDetailDrawer } from "../packages/webui/src/components/capabilities/SkillDetailDrawer.js"
import { initialSkillDetailFlow } from "../packages/webui/src/lib/skill-detail-flow.js"

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks() })

function browserStorage() {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } })
}

const item = { skillRef: `skill_v1_${"a".repeat(24)}`, displayName: "UI", description: "Review", sourceKind: "local" as const, validationStatus: "valid" as const, runtimeStatus: "active" as const, bindingCount: 0, revision: 7 }

describe("task025 skill detail adapter and UI", () => {
  it("reads detail by public reference and forwards AbortSignal", async () => {
    browserStorage()
    const signal = new AbortController().signal
    globalThis.fetch = vi.fn(async (input, init) => {
      expect(String(input)).toContain(encodeURIComponent(item.skillRef))
      expect(init?.signal).toBe(signal)
      return new Response(JSON.stringify(item), { status: 200 })
    }) as typeof fetch
    await expect(localAdapter.getSkillDetail(item.skillRef, signal)).resolves.toEqual(item)
  })

  it("updates by public reference without actor, source, path, or internal ID", async () => {
    browserStorage()
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body))
      expect(JSON.stringify(body)).not.toMatch(/actor|source|path|internal/)
      return new Response(JSON.stringify({ mutationId: "m1", state: "rejected", reasonCode: "mutation_revision_conflict", allowedActions: [], revision: 7, skillRef: item.skillRef }), { status: 409 })
    }) as typeof fetch
    const receipt = await localAdapter.updateSkill(item.skillRef, { envelope: { scope: "capability:write", mutationId: "m1", targetRevision: 8, purpose: "skill_update", issuedAt: 1, nonce: "n1" }, change: { displayName: "UI Pro" } })
    expect(receipt).toMatchObject({ state: "rejected", reasonCode: "mutation_revision_conflict" })
  })

  it("renders edit and status actions without exposing source paths", () => {
    const html = renderToStaticMarkup(createElement(SkillDetailDrawer, {
      item,
      flow: initialSkillDetailFlow(item),
      returnFocusRef: createRef(),
      onEdit: () => undefined,
      onDraftChange: () => undefined,
      onSave: () => undefined,
      onCancelEdit: () => undefined,
      onToggleStatus: () => undefined,
      onClose: () => undefined,
    }))
    expect(html).toContain("편집")
    expect(html).toContain("비활성화")
    expect(html).toMatch(/local|로컬/u)
    expect(html).not.toMatch(/canonicalPath|\/private|internal-1/)
  })
})
