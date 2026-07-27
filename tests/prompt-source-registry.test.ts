import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chdir, cwd } from "node:process"
import { afterEach, describe, expect, it } from "vitest"
import { bootstrap } from "../packages/core/src/index.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  detectPromptSourceSecretMarkers,
  ensurePromptSourceFiles,
  loadFirstRunPromptSourceAssembly,
  loadPromptSourceRegistry,
  loadSystemPromptSourceAssembly,
} from "../packages/core/src/memory/knowbee-md.ts"
import { closeDb, getDb, getPromptSourceStates } from "../packages/core/src/db/index.js"
import { sanitizeUserFacingError } from "../packages/core/src/runs/error-sanitizer.js"

const tempDirs: string[] = []
const originalCwd = cwd()

const FIXTURE_PROMPT_FILES = [
  "system.md",
  "definitions.md",
  "identity.md",
  "user.md",
  "task_intake.md",
  "work_record.md",
  "tool_policy.md",
  "memory_policy.md",
  "prompt_visibility.md",
  "soul.md",
  "planner.md",
  "knowbee-execution.md",
  "workflow.md",
  "sub_agent_delegation.md",
  "yeonjang_policy.md",
  "prompt_improvement.md",
  "recovery_policy.md",
  "topology_executor_policy.md",
  "completion_policy.md",
  "result_review.md",
  "output_policy.md",
  "final_response.md",
  "maintenance_policy.md",
  "ui_policy.md",
  "runtime_environment_policy.md",
  "logging_policy.md",
  "channel.md",
  "bootstrap.md",
  "sub_agent_base.md",
  "agent_persona.md",
  "completion_review.md",
  "completion_review_policy_v2.md",
  "completion_review_contract_v2.md",
  "completion_followup_evidence_user.md",
  "task_intake_user.md",
  "task_intake_identity_retry_user.md",
  "task_intake_schema_retry_user.md",
  "completion_review_user.md",
  "completion_review_context_v2.md",
  "request_continuation.md",
  "execution_decision_harness.md",
  "request_diagnosis.md",
  "result_diagnosis.md",
  "diagnosis_schema_repair.md",
  "ai_connection_test.md",
  "schedule_comparison.md",
  "node_definition_suggestion.md",
] as const

const EXPECTED_REGISTRY_SOURCE_IDS = [
  "system",
  "definitions",
  "identity",
  "user",
  "task_intake",
  "work_record",
  "tool_policy",
  "memory_policy",
  "prompt_visibility",
  "soul",
  "planner",
  "knowbee_execution",
  "workflow",
  "sub_agent_delegation",
  "yeonjang_policy",
  "prompt_improvement",
  "recovery_policy",
  "topology_executor_policy",
  "completion_policy",
  "output_policy",
  "maintenance_policy",
  "ui_policy",
  "runtime_environment_policy",
  "logging_policy",
  "channel",
  "result_review",
  "final_response",
  "bootstrap",
  "sub_agent_base",
  "agent_persona",
  "completion_review",
  "completion_review_policy_v2",
  "task_intake_user",
  "task_intake_identity_retry_user",
  "task_intake_schema_retry_user",
  "completion_review_user",
  "completion_review_context_v2",
  "completion_review_contract_v2",
  "completion_followup_evidence_user",
  "request_continuation",
  "execution_decision_harness",
  "request_diagnosis",
  "result_diagnosis",
  "diagnosis_schema_repair",
  "ai_connection_test",
  "schedule_comparison",
  "node_definition_suggestion",
] as const

const EXPECTED_RUNTIME_SOURCE_IDS = [
  "system",
  "definitions",
  "identity",
  "user",
  "task_intake",
  "work_record",
  "tool_policy",
  "memory_policy",
  "prompt_visibility",
  "soul",
  "planner",
  "knowbee_execution",
  "workflow",
  "sub_agent_delegation",
  "yeonjang_policy",
  "prompt_improvement",
  "recovery_policy",
  "topology_executor_policy",
  "completion_policy",
  "output_policy",
  "maintenance_policy",
  "ui_policy",
  "runtime_environment_policy",
  "logging_policy",
  "channel",
  "result_review",
  "final_response",
] as const

function createPromptFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-prompt-sources-"))
  tempDirs.push(root)
  const promptsDir = join(root, "prompts")
  mkdirSync(promptsDir)
  for (const filename of FIXTURE_PROMPT_FILES) {
    writeFileSync(join(promptsDir, filename), `# ${filename}\n\n${filename} content`, "utf-8")
  }
  return root
}

afterEach(() => {
  closeDb()
  chdir(originalCwd)
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("prompt source registry", () => {
  it("loads prompt sources and excludes only bootstrap from default runtime assembly", () => {
    const root = createPromptFixture()

    const registry = loadPromptSourceRegistry(root)
    expect(registry.map((source) => source.sourceId)).toEqual([...EXPECTED_REGISTRY_SOURCE_IDS])

    const assembly = loadSystemPromptSourceAssembly(root)
    expect(assembly?.snapshot.sources.map((source) => source.sourceId)).toEqual([...EXPECTED_RUNTIME_SOURCE_IDS])
    expect(assembly?.snapshot.diagnostics).toEqual([])
    expect(assembly?.text).toContain("definitions.md content")
    expect(assembly?.text).toContain("identity.md content")
    expect(assembly?.text).toContain("work_record.md content")
    expect(assembly?.text).toContain("prompt_visibility.md content")
    expect(assembly?.text).toContain("workflow.md content")
    expect(assembly?.text).toContain("result_review.md content")
    expect(assembly?.text).toContain("final_response.md content")
    expect(assembly?.text).toContain("maintenance_policy.md content")
    expect(assembly?.text).toContain("ui_policy.md content")
    expect(assembly?.text).toContain("runtime_environment_policy.md content")
    expect(assembly?.text).toContain("logging_policy.md content")
    expect(assembly?.text).toContain("soul.md content")
    expect(assembly?.text).toContain("planner.md content")
    expect(assembly?.text).toContain("knowbee-execution.md content")
    expect(assembly?.text).toContain("topology_executor_policy.md content")
    expect(assembly?.text).toContain("output_policy.md content")
    expect(assembly?.text).toContain("channel.md content")
    expect(assembly?.snapshot.sources.at(-2)?.sourceId).toBe("result_review")
    expect(assembly?.snapshot.sources.at(-1)?.sourceId).toBe("final_response")
    expect(assembly?.text).not.toContain("bootstrap.md content")
    expect(assembly?.text).not.toContain("sub_agent_base.md content")
    expect(assembly?.text).not.toContain("agent_persona.md content")
    expect(assembly?.text).not.toContain("request_diagnosis.md content")
    expect(assembly?.text).not.toContain("result_diagnosis.md content")
    expect(assembly?.text).not.toContain("diagnosis_schema_repair.md content")
    expect(assembly?.snapshot.sources.every((source) => source.checksum.length === 64)).toBe(true)
  })

  it("builds the root execution profile from only the common execution policies", () => {
    const root = createPromptFixture()

    const assembly = loadSystemPromptSourceAssembly(
      root,
      "en",
      [],
      {},
      "execution",
    )

    expect(assembly?.snapshot.sources.map((source) => source.sourceId)).toEqual([
      "system",
      "definitions",
      "identity",
      "user",
      "tool_policy",
      "workflow",
      "recovery_policy",
      "completion_policy",
      "output_policy",
      "channel",
    ])
    expect(assembly?.text).not.toContain("result_review.md content")
    expect(assembly?.text).not.toContain("final_response.md content")
    expect(assembly?.text).not.toContain("work_record.md content")
    expect(assembly?.text).not.toContain("prompt_improvement.md content")
    expect(assembly?.text).not.toContain("topology_executor_policy.md content")
    expect(assembly?.snapshot.diagnostics).toEqual([])
  })

  it("keeps required runtime sources in the assembly even when a stored state is disabled", () => {
    const root = createPromptFixture()

    const assembly = loadSystemPromptSourceAssembly(root, "en", [
      { sourceId: "identity", locale: "en", enabled: false },
    ])
    const identity = assembly?.snapshot.sources.find((source) => source.sourceId === "identity")

    expect(identity).toBeTruthy()
    expect(identity?.enabled).toBe(false)
  })

  it("excludes disabled optional runtime sources from the assembly", () => {
    const root = createPromptFixture()

    const assembly = loadSystemPromptSourceAssembly(root, "en", [
      { sourceId: "output_policy", locale: "en", enabled: false },
    ])

    expect(assembly?.snapshot.sources.map((source) => source.sourceId)).not.toContain("output_policy")
    expect(assembly?.text).not.toContain("output_policy.md content")
  })

  it("records a diagnostic when a required runtime source is missing", () => {
    const root = createPromptFixture()
    rmSync(join(root, "prompts", "definitions.md"), { force: true })

    const assembly = loadSystemPromptSourceAssembly(root)

    expect(assembly?.snapshot.sources.map((source) => source.sourceId)).not.toContain("definitions")
    expect(assembly?.snapshot.diagnostics).toContainEqual({
      severity: "error",
      code: "required_prompt_source_missing",
      sourceId: "definitions",
      locale: "en",
      message: "Required prompt source 'definitions' is missing for runtime assembly.",
    })
  })

  it("reuses cached runtime prompt assembly when source checksums and states do not change", () => {
    const root = createPromptFixture()

    const first = loadSystemPromptSourceAssembly(root)
    const second = loadSystemPromptSourceAssembly(root)

    expect(second).toBe(first)
  })

  it("seeds missing prompt sources idempotently without overwriting user edits", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-prompt-seed-"))
    tempDirs.push(root)

    const first = ensurePromptSourceFiles(root)
    expect(first.created).toContain("definitions.md")
    expect(first.created).toContain("identity.md")
    expect(first.created).toContain("user.md")
    expect(first.created).toContain("task_intake.md")
    expect(first.created).toContain("work_record.md")
    expect(first.created).toContain("planner.md")
    expect(first.created).toContain("knowbee-execution.md")
    expect(first.created).toContain("memory_policy.md")
    expect(first.created).toContain("tool_policy.md")
    expect(first.created).toContain("prompt_visibility.md")
    expect(first.created).toContain("workflow.md")
    expect(first.created).toContain("sub_agent_delegation.md")
    expect(first.created).toContain("yeonjang_policy.md")
    expect(first.created).toContain("prompt_improvement.md")
    expect(first.created).toContain("recovery_policy.md")
    expect(first.created).toContain("topology_executor_policy.md")
    expect(first.created).toContain("completion_policy.md")
    expect(first.created).toContain("result_review.md")
    expect(first.created).toContain("output_policy.md")
    expect(first.created).toContain("final_response.md")
    expect(first.created).toContain("maintenance_policy.md")
    expect(first.created).toContain("ui_policy.md")
    expect(first.created).toContain("channel.md")
    expect(first.created).toContain("bootstrap.md")
    expect(first.created).toContain("sub_agent_base.md")
    expect(first.created).toContain("agent_persona.md")
    expect(first.created).toContain("request_diagnosis.md")
    expect(first.created).toContain("result_diagnosis.md")
    expect(first.created).toContain("diagnosis_schema_repair.md")
    expect(existsSync(join(first.promptsDir, "user.md"))).toBe(true)
    expect(existsSync(join(first.promptsDir, "knowbee-execution.md"))).toBe(true)
    expect(existsSync(join(first.promptsDir, "topology_executor_policy.md"))).toBe(true)
    expect(existsSync(join(first.promptsDir, "output_policy.md"))).toBe(true)
    expect(existsSync(join(first.promptsDir, "work_record.md"))).toBe(true)
    expect(existsSync(join(first.promptsDir, "final_response.md"))).toBe(true)

    const userPromptPath = join(first.promptsDir, "user.md")
    writeFileSync(userPromptPath, "# User\n\n- Preferred name: custom-user-edit\n", "utf-8")

    const second = ensurePromptSourceFiles(root)
    expect(second.created).toEqual([])
    expect(readFileSync(userPromptPath, "utf-8")).toContain("custom-user-edit")
  })

  it("keeps first-run bootstrap isolated from normal runtime assembly", () => {
    const root = createPromptFixture()

    const runtime = loadSystemPromptSourceAssembly(root)
    const firstRun = loadFirstRunPromptSourceAssembly(root)

    expect(runtime?.snapshot.sources.map((source) => source.sourceId)).not.toContain("bootstrap")
    expect(firstRun?.snapshot.sources.map((source) => source.sourceId)).toEqual(["bootstrap"])
    expect(firstRun?.snapshot.diagnostics).toEqual([])
    expect(firstRun?.text).toContain("bootstrap.md content")
  })

  it("keeps late runtime policies inside the prompt assembly ceiling", () => {
    const root = createPromptFixture()
    const promptsDir = join(root, "prompts")
    const repeated = "policy line ".repeat(450)
    for (const filename of [
      "definitions.md",
      "identity.md",
      "user.md",
      "soul.md",
      "planner.md",
      "knowbee-execution.md",
      "memory_policy.md",
      "tool_policy.md",
      "recovery_policy.md",
      "topology_executor_policy.md",
      "completion_policy.md",
      "output_policy.md",
      "runtime_environment_policy.md",
      "logging_policy.md",
      "channel.md",
    ]) {
      const tailMarker = filename === "channel.md" ? "\nCHANNEL_TAIL_MARKER\n" : "\n"
      writeFileSync(join(promptsDir, filename), `# ${filename}\n\n${repeated}${tailMarker}`, "utf-8")
    }

    const assembly = loadSystemPromptSourceAssembly(root)

    expect(assembly?.snapshot.sources.at(-7)?.sourceId).toBe("maintenance_policy")
    expect(assembly?.snapshot.sources.at(-6)?.sourceId).toBe("ui_policy")
    expect(assembly?.snapshot.sources.at(-5)?.sourceId).toBe("runtime_environment_policy")
    expect(assembly?.snapshot.sources.at(-4)?.sourceId).toBe("logging_policy")
    expect(assembly?.snapshot.sources.at(-3)?.sourceId).toBe("channel")
    expect(assembly?.snapshot.sources.at(-2)?.sourceId).toBe("result_review")
    expect(assembly?.snapshot.sources.at(-1)?.sourceId).toBe("final_response")
    expect(assembly?.text).toContain("CHANNEL_TAIL_MARKER")
    expect(assembly?.text).toContain("final_response.md content")
    expect(assembly?.text).not.toContain("bootstrap.md content")
  })

  it("detects secret-like prompt source content and excludes it from the registry", () => {
    const root = createPromptFixture()
    const unsafe = "# identity\n\napi_key = sk-abcdefghijklmnopqrstuvwxyz123456"
    writeFileSync(join(root, "prompts", "identity.md"), unsafe, "utf-8")

    expect(detectPromptSourceSecretMarkers(unsafe)).toContain("api_key_assignment")
    expect(loadPromptSourceRegistry(root).some((source) => source.sourceId === "identity" && source.locale === "en")).toBe(false)
  })

  it("bootstraps prompt source metadata into an empty DB without duplicate rows", () => {
    closeDb()
    const root = mkdtempSync(join(tmpdir(), "knowbee-prompt-bootstrap-"))
    tempDirs.push(root)
    const runtimePaths = createRuntimePaths({ KNOWBEE_STATE_DIR: join(root, "state") })
    chdir(root)
    const config = structuredClone(DEFAULT_CONFIG)
    config.profile.workspace = root

    bootstrap(config, { runtimePaths })
    const firstCount = (getDb().prepare("SELECT COUNT(*) AS count FROM prompt_sources").get() as { count: number }).count
    expect(firstCount).toBe(loadPromptSourceRegistry(root).length)
    expect(getPromptSourceStates().some((source) => source.sourceId === "bootstrap" && source.locale === "en")).toBe(true)

    bootstrap(config, { runtimePaths })
    const secondCount = (getDb().prepare("SELECT COUNT(*) AS count FROM prompt_sources").get() as { count: number }).count
    expect(secondCount).toBe(firstCount)
  })

  it("sanitizes provider HTML errors for user-facing output", () => {
    const sanitized = sanitizeUserFacingError("<!doctype html><html><title>403 Forbidden</title><body>Cloudflare challenge</body></html>")
    expect(sanitized.kind).toBe("access_blocked")
    expect(sanitized.userMessage).toBe("인증 또는 접근 차단 문제로 서버가 HTML 오류 페이지를 반환했습니다.")
    expect(sanitized.userMessage).not.toContain("<html")
  })
})
