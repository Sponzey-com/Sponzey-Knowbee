import { createElement, createRef } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { localAdapter } from "../packages/webui/src/api/adapters/local.js"
import { SkillAddDrawer } from "../packages/webui/src/components/capabilities/SkillAddDrawer.js"
import { skillAddReasonText } from "../packages/webui/src/lib/skill-add-flow.js"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

function installBrowserStubs() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => null },
  })
}

describe("task024 skill add adapter and drawer", () => {
  it("sends only the public validation DTO and forwards cancellation", async () => {
    installBrowserStubs()
    const signal = new AbortController().signal
    globalThis.fetch = vi.fn(async (_input, init) => {
      expect(init?.signal).toBe(signal)
      expect(JSON.parse(String(init?.body))).toEqual({ displayName: "UI", sourceKind: "local", requestedPath: "/workspace/ui" })
      return new Response(JSON.stringify({ ready: true, displayName: "UI", sourceKind: "local", reasonCodes: [] }), { status: 200 })
    }) as typeof fetch
    await expect(localAdapter.validateSkillSource({ displayName: "UI", sourceKind: "local", requestedPath: "/workspace/ui" }, signal)).resolves.toMatchObject({ ready: true })
  })

  it("returns a rejected mutation receipt without adding an actor to the request", async () => {
    installBrowserStubs()
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(JSON.stringify(body)).not.toContain("actor")
      return new Response(JSON.stringify({ mutationId: "m1", state: "rejected", reasonCode: "mutation_revision_conflict", allowedActions: [], revision: 7, skillRef: null }), { status: 409 })
    }) as typeof fetch
    const receipt = await localAdapter.createSkill({
      envelope: { scope: "capability:write", mutationId: "m1", targetRevision: 8, purpose: "skill_create", issuedAt: 1, nonce: "n1" },
      draft: { displayName: "UI", description: "Review", sourceKind: "builtin" },
    })
    expect(receipt).toMatchObject({ state: "rejected", reasonCode: "mutation_revision_conflict" })
  })

  it("renders local-only path, actions, and safe bilingual reason text", () => {
    const html = renderToStaticMarkup(createElement(SkillAddDrawer, {
      open: true,
      flow: { state: "failed", draft: { displayName: "UI", description: "", sourceKind: "local", requestedPath: "" }, reasonCodes: ["skill_manifest_missing"] },
      returnFocusRef: createRef(),
      onDraftChange: () => undefined,
      onValidate: () => undefined,
      onSave: () => undefined,
      onClose: () => undefined,
    }))
    expect(html).toContain("Skill 폴더")
    expect(html).toContain("검사")
    expect(html).toContain("저장")
    expect(html).not.toContain('<option value="builtin">')
    expect(html).toContain("SKILL.md가 없습니다")
    expect(skillAddReasonText("mutation_revision_conflict", "en")).toContain("Refresh")
    expect(skillAddReasonText("unknown_internal_detail", "ko")).not.toContain("unknown_internal_detail")
  })
})
