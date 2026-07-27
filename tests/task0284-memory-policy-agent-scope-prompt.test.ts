import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const REQUIRED_MARKERS = [
  "## Agent Memory Ownership",
  "The MainAgent and every SubAgent must have independent short-term memory and independent long-term memory under that agent's owner scope.",
  "The active agent may directly read and write only its own owner-scoped memory.",
  "Compaction may rewrite the active prompt window, but it must not merge owner scopes or promote compacted facts into long-term memory by itself.",
  "## Memory Injection Gate",
  "Inject memory only from the active agent's owner scope, the current session or task lineage, explicit `DataExchangePackage`s, or approved shared context.",
  "Do not inject another agent's private memory as raw text.",
  "Data exchange payloads must be summarized, filtered, redacted, purpose-bound, and limited to the recipient's task.",
  "## Long-Term Write Gate",
  "Before writing long-term memory, verify storage need, sensitivity, user intent, target owner scope, source evidence, and retention purpose.",
  "Long-term write gates use `OwnerScope.ownerType` values `knowbee` and `sub_agent`.",
  "Teams and system scopes do not own long-term memory.",
  "Compaction capsules and active memory state use `MemoryCapsuleOwnerScope.ownerType` values `main_agent` and `sub_agent`.",
  "General chat is not long-term memory unless the user explicitly asks to remember it.",
] as const

describe("task0284 memory policy agent scope prompt contract", () => {
  it("documents independent short-term and long-term memory ownership for every agent", () => {
    const policy = readFileSync(join(process.cwd(), "prompts", "memory_policy.md"), "utf-8")

    for (const marker of REQUIRED_MARKERS) {
      expect(policy).toContain(marker)
    }
  })
})
