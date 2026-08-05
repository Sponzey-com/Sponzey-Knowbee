import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { Message } from "../packages/core/src/ai/types.ts"
import type { MemoryCapsule } from "../packages/core/src/memory/capsule.ts"
import { rewriteRootSessionRetrievalOnlyWindow, type RootSessionPinnedWorkingSet } from "../packages/core/src/memory/compaction.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const repoRoot = process.cwd()

function capsule(): MemoryCapsule {
  return {
    capsuleId: "capsule-structured-labels",
    capsuleVersion: 1,
    ownerScope: {
      ownerType: "main_agent",
      ownerId: "agent:knowbee",
      sessionId: "session-structured-labels",
    },
    agentNameSnapshot: "노비",
    capsuleKind: "session_compaction",
    summary: "Structured block label test capsule.",
    activeObjectives: [],
    confirmedFacts: ["fact"],
    decisions: [],
    constraints: [],
    pendingItems: [],
    artifactRefs: [],
    recoveryHints: [],
    sourceRefs: ["message:1"],
    compactedMessageIds: ["message:1"],
    sourceTokenEstimate: 100,
    resultTokenEstimate: 20,
    createdAt: 1,
  }
}

function workingSet(): RootSessionPinnedWorkingSet {
  return {
    activeObjectives: [],
    confirmedFacts: [],
    constraints: [],
    decisions: [],
    pendingItems: [],
    artifactRefs: [],
    blockedReasonCodes: [],
  }
}

describe("task0980 memory structured block labels", () => {
  it("keeps structured block labels in the memory context prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot).find(
      (item) => item.sourceId === "memory_restore_prompt_context_labels_user" && item.locale === "en",
    )

    expect(source).toMatchObject({ sourceId: "memory_restore_prompt_context_labels_user", usageScope: "internal", enabled: true })
    expect(source?.content).toContain("structured_tool_use_label=tool_use")
    expect(source?.content).toContain("structured_tool_result_label=tool_result")
  })

  it("renders root session retrieval snippets from source-owned structured block labels", () => {
    const messages: Message[] = [
      { role: "assistant", content: [{ type: "tool_use", id: "call-1", name: "screen_capture", input: { target: "main" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call-1", content: "ok" }] },
    ]

    const result = rewriteRootSessionRetrievalOnlyWindow({
      messages,
      capsule: capsule(),
      pinnedWorkingSet: workingSet(),
      maxSnippetCount: 4,
      maxSnippetChars: 400,
    })
    const rendered = result.messages.map((message) => String(message.content)).join("\n")

    expect(rendered).toContain("[tool_use:screen_capture] {\"target\":\"main\"}")
    expect(rendered).toContain("[tool_result:call-1] ok")
  })

  it("removes structured block label literals from memory TypeScript", () => {
    const restoreSource = readFileSync(join(repoRoot, "packages/core/src/memory/retrieval-restore.ts"), "utf8")
    const compactionSource = readFileSync(join(repoRoot, "packages/core/src/memory/compaction.ts"), "utf8")

    expect(restoreSource).toContain("structured_tool_use_label")
    expect(compactionSource).toContain("structured_tool_result_label")
    expect(restoreSource).not.toContain("`[tool_use:${block.name}]")
    expect(restoreSource).not.toContain("`[tool_result:${block.tool_use_id}]")
    expect(compactionSource).not.toContain("`[tool_use:${block.name}]")
    expect(compactionSource).not.toContain("`[tool_result:${block.tool_use_id}]")
  })
})
