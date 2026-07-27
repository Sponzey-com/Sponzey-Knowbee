import { describe, expect, it } from "vitest"
import {
  listPromptSourceDefinitions,
  type PromptSourceDefinition,
} from "../packages/core/src/memory/knowbee-md.ts"
import {
  AGENT_PROMPT_BUNDLE_SOURCE_IDS,
  DIAGNOSIS_PROMPT_SOURCE_IDS,
  EXECUTION_HARNESS_POLICY_SOURCE_IDS,
  REQUIRED_DIAGNOSIS_PROMPT_SOURCE_IDS,
  SUB_AGENT_PROMPT_BUNDLE_SOURCE_IDS,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

function registryDefinitions(): PromptSourceDefinition[] {
  return listPromptSourceDefinitions()
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function expectNoDuplicates(label: string, values: readonly string[]): void {
  expect(unique(values), `${label} must not contain duplicate source IDs`).toHaveLength(values.length)
}

describe("task0909 prompt policy adapter registry alignment", () => {
  it("keeps adapter source ID arrays unique and registered", () => {
    const definitions = registryDefinitions()
    const registeredIds = new Set(definitions.map((definition) => definition.sourceId))
    const adapterGroups = {
      AGENT_PROMPT_BUNDLE_SOURCE_IDS,
      SUB_AGENT_PROMPT_BUNDLE_SOURCE_IDS,
      EXECUTION_HARNESS_POLICY_SOURCE_IDS,
      DIAGNOSIS_PROMPT_SOURCE_IDS,
      REQUIRED_DIAGNOSIS_PROMPT_SOURCE_IDS,
    }

    for (const [label, values] of Object.entries(adapterGroups)) {
      expectNoDuplicates(label, values)
      expect(values.filter((sourceId) => !registeredIds.has(sourceId))).toEqual([])
    }
  })

  it("matches main and sub-agent runtime prompt bundle IDs to registry defaults", () => {
    const definitions = registryDefinitions()
    const runtimeDefaultIds = definitions
      .filter((definition) => definition.usageScope === "runtime" && definition.defaultRuntime)
      .map((definition) => definition.sourceId)
    const subAgentOnlyRuntimeIds = definitions
      .filter((definition) => definition.usageScope === "runtime" && !definition.defaultRuntime)
      .map((definition) => definition.sourceId)

    expect(sorted(AGENT_PROMPT_BUNDLE_SOURCE_IDS)).toEqual(sorted(runtimeDefaultIds))
    expect(sorted(SUB_AGENT_PROMPT_BUNDLE_SOURCE_IDS)).toEqual(sorted([
      ...runtimeDefaultIds,
      ...subAgentOnlyRuntimeIds,
    ]))
  })

  it("keeps harness and diagnosis prompt source scopes explicit", () => {
    const definitionsById = new Map(
      registryDefinitions().map((definition) => [definition.sourceId, definition]),
    )

    expect(EXECUTION_HARNESS_POLICY_SOURCE_IDS.every((sourceId) =>
      AGENT_PROMPT_BUNDLE_SOURCE_IDS.includes(sourceId as never)
    )).toBe(true)

    for (const sourceId of REQUIRED_DIAGNOSIS_PROMPT_SOURCE_IDS) {
      expect(definitionsById.get(sourceId)?.usageScope).toBe("internal")
    }

    for (const sourceId of DIAGNOSIS_PROMPT_SOURCE_IDS) {
      const usageScope = definitionsById.get(sourceId)?.usageScope
      expect(["internal", "runtime"]).toContain(usageScope)
    }
  })
})
