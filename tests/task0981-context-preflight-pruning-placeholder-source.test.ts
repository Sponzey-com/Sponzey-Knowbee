import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { Message, MessageContent } from "../packages/core/src/ai/types.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { pruneMessagesForContext } from "../packages/core/src/runs/context-preflight.ts"

const SOURCE_ID = "context_preflight_pruning_labels_user"
const repoRoot = process.cwd()

describe("task0981 context preflight pruning placeholder", () => {
  it("registers context preflight pruning labels as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot)
      .find((item) => item.sourceId === SOURCE_ID && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: SOURCE_ID,
      required: false,
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("tool_result_pruned_marker=[tool_result_pruned: original_chars={{originalChars}}]")
  })

  it("renders the pruning marker from the prompt source with runtime original length", () => {
    const oldToolResult = "old-tool-result\n".repeat(700)
    const messages: Message[] = [
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool-1", content: oldToolResult }],
      },
      ...Array.from({ length: 8 }, (_, index) => ({ role: "user" as const, content: `recent-${index}` })),
    ]

    const pruned = pruneMessagesForContext({ messages })
    const preparedBlocks = pruned.messages[0]?.content as MessageContent[]
    const content = String(preparedBlocks[0]?.type === "tool_result" ? preparedBlocks[0].content : "")

    expect(content).toContain("old-tool-result")
    expect(content).toContain(`[tool_result_pruned: original_chars=${oldToolResult.trim().length}]`)
    expect(pruned.decisions[0]).toMatchObject({
      messageIndex: 0,
      blockIndex: 0,
      blockType: "tool_result",
      strategy: "head_tail_soft_trim",
    })
  })

  it("removes the pruning marker template from TypeScript", () => {
    const source = readFileSync(join(repoRoot, "packages/core/src/runs/context-preflight.ts"), "utf8")

    expect(source).toContain(SOURCE_ID)
    expect(source).not.toContain("`[tool_result_pruned: original_chars=${normalized.length}]`")
    expect(source).not.toContain("\"[tool_result_pruned: original_chars=")
  })
})
