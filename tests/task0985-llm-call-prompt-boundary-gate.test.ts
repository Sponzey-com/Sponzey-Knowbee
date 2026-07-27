import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

interface Invocation {
  file: string
  index: number
  kind: "chatWithContextPreflight" | "provider.chat"
  offset: number
}

const repoRoot = process.cwd()
const coreSrcRoot = join(repoRoot, "packages/core/src")

const EXPECTED_INVOCATION_COUNTS: Record<string, Record<Invocation["kind"], number>> = {
  "packages/core/src/agent/completion-review.ts": { chatWithContextPreflight: 1, "provider.chat": 0 },
  "packages/core/src/agent/index.ts": { chatWithContextPreflight: 1, "provider.chat": 0 },
  "packages/core/src/agent/intake.ts": { chatWithContextPreflight: 1, "provider.chat": 0 },
  "packages/core/src/ai/diagnosis-adapter.ts": { chatWithContextPreflight: 0, "provider.chat": 1 },
  "packages/core/src/ai/observed-provider.ts": { chatWithContextPreflight: 0, "provider.chat": 2 },
  "packages/core/src/ai/solution-plan-adapter.ts": { chatWithContextPreflight: 0, "provider.chat": 1 },
  "packages/core/src/api/routes/settings.ts": { chatWithContextPreflight: 1, "provider.chat": 0 },
  "packages/core/src/api/routes/topologies.ts": { chatWithContextPreflight: 0, "provider.chat": 1 },
  "packages/core/src/memory/compaction.ts": { chatWithContextPreflight: 0, "provider.chat": 1 },
  "packages/core/src/memory/compressor.ts": { chatWithContextPreflight: 1, "provider.chat": 0 },
  "packages/core/src/runs/context-preflight.ts": { chatWithContextPreflight: 0, "provider.chat": 1 },
  "packages/core/src/runs/entry-comparison.ts": { chatWithContextPreflight: 1, "provider.chat": 0 },
  "packages/core/src/runs/final-response-renderer.ts": { chatWithContextPreflight: 0, "provider.chat": 2 },
  "packages/core/src/runs/intake-bridge-pass.ts": { chatWithContextPreflight: 0, "provider.chat": 1 },
  "packages/core/src/schedules/comparison.ts": { chatWithContextPreflight: 1, "provider.chat": 0 },
}

const REQUIRED_OWNERSHIP_SNIPPETS: Record<string, string[]> = {
  "packages/core/src/agent/completion-review.ts": [
    'sourceId: "completion_review_user"',
    "buildCompletionReviewSystemPrompt",
    "agentRuntimePromptContextLabel",
  ],
  "packages/core/src/agent/index.ts": [
    "loadSystemPromptSourceAssembly",
    'sourceId: "system"',
    "buildMainAgentIdentityPromptContext",
    "agentRuntimePromptContextLabel",
  ],
  "packages/core/src/agent/intake.ts": [
    'sourceId: "task_intake_user"',
    "buildTaskIntakeSystemPrompt",
    "buildMainAgentIdentityPromptContext",
    "agentRuntimePromptContextLabel",
  ],
  "packages/core/src/ai/diagnosis-adapter.ts": [
    '"diagnosis_json_instruction_user"',
    "content: JSON.stringify(promptPayload)",
  ],
  "packages/core/src/ai/observed-provider.ts": [
    "const { observability, ...providerParams } = params",
    "this.options.repository.append(receipt)",
    "this.provider.chat(providerParams)",
  ],
  "packages/core/src/api/routes/settings.ts": [
    'loadPromptValue("ai_connection_test"',
    'loadPromptTemplate({ sourceId: "ai_connection_test" })',
  ],
  "packages/core/src/api/routes/topologies.ts": [
    "NODE_DEFINITION_API_SYSTEM_SOURCE_ID",
    "loadPromptValue(NODE_DEFINITION_API_SYSTEM_SOURCE_ID",
    "content: input.prompt",
  ],
  "packages/core/src/memory/compaction.ts": [
    "rootSessionSummaryPrompt()",
    "memoryCompactionContextLabel",
  ],
  "packages/core/src/memory/compressor.ts": [
    "memoryPromptValue(MEMORY_COMPRESSOR_SUMMARY_PROMPT_SOURCE_ID)",
    "memoryContextLabel",
  ],
  "packages/core/src/runs/context-preflight.ts": [
    "messages: prepared.messages",
    "input.system !== undefined",
  ],
  "packages/core/src/runs/entry-comparison.ts": [
    "comparisonPromptContextLabel",
    "buildRequestContinuationSystemPrompt",
  ],
  "packages/core/src/runs/final-response-renderer.ts": [
    'sourceId: "final_response_user"',
    'sourceId: "response_language_exception_review"',
    'sourceId: "response_language_exception_review_user"',
    "systemWithIdentity",
  ],
  "packages/core/src/runs/intake-bridge-pass.ts": [
    'sourceId: "execution_decision_harness"',
    "content: params.prompt",
    "executionHarnessPolicyContextLabel",
  ],
  "packages/core/src/schedules/comparison.ts": [
    "buildComparisonPrompt",
    "buildScheduleContractComparisonSystemPrompt",
    "comparisonPromptContextLabel",
  ],
}

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) return listTypeScriptFiles(path)
    if (!entry.endsWith(".ts") || entry.endsWith(".d.ts")) return []
    return [path]
  })
}

function toRepoPath(path: string): string {
  return relative(repoRoot, path).split(/[\\/]/gu).join("/")
}

function findInvocations(): Invocation[] {
  return listTypeScriptFiles(coreSrcRoot).flatMap((path) => {
    const file = toRepoPath(path)
    const source = readFileSync(path, "utf-8")
    const invocations: Invocation[] = []

    for (const match of source.matchAll(/\bchatWithContextPreflight\s*\(\s*\{/gu)) {
      invocations.push({ file, index: match.index ?? 0, kind: "chatWithContextPreflight", offset: match.index ?? 0 })
    }
    for (const match of source.matchAll(/\b(?:input\.provider|this\.options\.provider|provider|input\.provider\.provider)\.chat\s*\(/gu)) {
      invocations.push({ file, index: match.index ?? 0, kind: "provider.chat", offset: match.index ?? 0 })
    }

    return invocations.sort((left, right) => left.offset - right.offset)
  })
}

function invocationCounts(invocations: Invocation[]): Record<string, Record<Invocation["kind"], number>> {
  const counts: Record<string, Record<Invocation["kind"], number>> = {}
  for (const invocation of invocations) {
    counts[invocation.file] ??= { chatWithContextPreflight: 0, "provider.chat": 0 }
    counts[invocation.file]![invocation.kind] += 1
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

function invocationWindow(source: string, offset: number): string {
  return source.slice(offset, Math.min(source.length, offset + 450))
}

describe("task0985 LLM call prompt boundary gate", () => {
  it("keeps direct LLM call sites under explicit review", () => {
    expect(invocationCounts(findInvocations())).toEqual(EXPECTED_INVOCATION_COUNTS)
  })

  it("requires reviewed call sites to declare prompt or runtime input ownership", () => {
    const missing: string[] = []

    for (const [file, snippets] of Object.entries(REQUIRED_OWNERSHIP_SNIPPETS)) {
      const source = readFileSync(join(repoRoot, file), "utf-8")
      for (const snippet of snippets) {
        if (!source.includes(snippet)) missing.push(`${file} missing ${snippet}`)
      }
    }

    expect(missing).toEqual([])
  })

  it("blocks direct literal system or user prompt instructions in invocation windows", () => {
    const offenders: string[] = []
    const allowedLiteralContentSources = [
      "loadPrompt",
      "memoryPromptValue",
      "rootSessionSummaryPrompt",
      "JSON.stringify",
      "input.prompt",
      "params.prompt",
      "user",
    ]

    for (const invocation of findInvocations()) {
      const source = readFileSync(join(repoRoot, invocation.file), "utf-8")
      const window = invocationWindow(source, invocation.offset)
      if (/system:\s*["`]/u.test(window)) {
        offenders.push(`${invocation.file} has direct literal system prompt near ${invocation.kind}`)
      }
      for (const match of window.matchAll(/content:\s*(["`])([\s\S]{0,160})/gu)) {
        const preview = match[2] ?? ""
        if (!allowedLiteralContentSources.some((allowed) => preview.includes(allowed))) {
          offenders.push(`${invocation.file} has direct literal user prompt near ${invocation.kind}: ${preview.slice(0, 80)}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
