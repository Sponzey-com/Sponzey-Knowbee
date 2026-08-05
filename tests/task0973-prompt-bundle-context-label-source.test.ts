import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import {
  renderDiagnosisPromptSourceBlock,
  renderPromptPolicySourceBlock,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

const repoRoot = process.cwd()

describe("task0973 prompt bundle context labels source", () => {
  it("registers prompt bundle context labels as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot).find(
      (item) => item.sourceId === "prompt_bundle_context_labels_user" && item.locale === "en",
    )

    expect(source).toMatchObject({ sourceId: "prompt_bundle_context_labels_user", usageScope: "internal", enabled: true })
    expect(source?.content).toContain("agent_prompt_bundle_header=[AgentPromptBundle]")
    expect(source?.content).toContain("runtime_prompt_policy_sources_header=[Runtime Prompt Policy Sources]")
    expect(source?.content).toContain("diagnosis_prompt_sources_header=[Diagnosis Prompt Sources]")
  })

  it("renders default policy block labels from the file-backed source", () => {
    expect(renderPromptPolicySourceBlock({ sources: [] })).toContain("[Runtime Prompt Policy Sources]")
    expect(renderDiagnosisPromptSourceBlock({ sources: [] })).toContain("[Diagnosis Prompt Sources]")
  })

  it("removes prompt bundle labels from TypeScript", () => {
    const bundleSource = readFileSync(join(repoRoot, "packages/core/src/orchestration/prompt-bundle.ts"), "utf8")
    const adapterSource = readFileSync(join(repoRoot, "packages/core/src/orchestration/prompt-policy-adapter.ts"), "utf8")

    expect(bundleSource).not.toContain("\"[AgentPromptBundle]\"")
    expect(bundleSource).not.toContain("\"[Safety Boundaries]\"")
    expect(bundleSource).not.toContain("\"[Active Profile Fragments]\"")
    expect(bundleSource).not.toContain("\"[Blocked Prompt Bundle Issues]\"")
    expect(adapterSource).not.toContain("\"[Runtime Prompt Policy Sources]\"")
    expect(adapterSource).not.toContain("\"[Diagnosis Prompt Sources]\"")
    expect(adapterSource).not.toContain("\"reason: no enabled runtime prompt policy sources were loaded\"")
  })
})
