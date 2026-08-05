import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { Database } from "better-sqlite3"
import { closeDb, insertAuditLog } from "../packages/core/src/db/index.js"
import { listAuditEvents } from "../packages/core/src/api/routes/audit.ts"
import { runDoctor } from "../packages/core/src/diagnostics/doctor.ts"
import { buildRunWritebackCandidates, prepareMemoryWritebackQueueInput } from "../packages/core/src/memory/writeback.ts"
import {
  createContextBlock,
  renderContextBlockForPrompt,
  shouldBlockUntrustedMemoryWriteback,
  validatePromptAssemblyBlocks,
} from "../packages/core/src/security/trust-boundary.ts"
import { evaluateAndRecordToolPolicy } from "../packages/core/src/security/tool-policy.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture
let db: Database

function useRawConfig(configBody: string): { stateDir: string; configPath: string } {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task004-security-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir, configText: configBody })
  db = initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  return { stateDir: runtimeFixture.paths.stateDir, configPath: runtimeFixture.paths.configFile }
}

function useTempConfig(): { stateDir: string; allowedDir: string } {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task004-security-"))
  const stateDir = join(rootDir, "state")
  const allowedDir = join(stateDir, "workspace")
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: `{
    security: {
      approvalMode: "always",
      approvalTimeout: 60,
      approvalTimeoutFallback: "deny",
      allowedPaths: [${JSON.stringify(allowedDir)}],
      allowedCommands: ["echo"]
    },
    webui: { enabled: true, host: "127.0.0.1", port: 0, auth: { enabled: false } }
  }`,
  })
  db = initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  return { stateDir, allowedDir }
}

let allowedDir = ""

beforeEach(() => {
  allowedDir = useTempConfig().allowedDir
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function toolCtx() {
  return {
    sessionId: "session-security",
    runId: "run-security",
    requestGroupId: "group-security",
    workDir: allowedDir,
    userMessage: "승인 없이 실행해",
    source: "slack" as const,
    allowWebAccess: false,
    onProgress: () => undefined,
    signal: new AbortController().signal,
  }
}

function toolSecurity() {
  return {
    allowedPaths: [allowedDir],
    allowedCommands: ["echo"],
  }
}

describe("task004 security boundary", () => {
  it("keeps tool policy allowlists as explicit inputs", () => {
    const source = readFileSync("packages/core/src/security/tool-policy.ts", "utf-8")

    expect(source).not.toContain("../config/index.js")
    expect(source).not.toContain("getConfig(")
    expect(source).toContain("security: {")
    expect(source).toContain("security.allowedCommands")
    expect(source).toContain("security.allowedPaths")
  })

  it("uses one dispatcher config snapshot for approval mode and tool policy", () => {
    const source = readFileSync("packages/core/src/tools/dispatcher.ts", "utf-8")

    expect(source).not.toContain("getConfig")
    expect(source).toContain("config: ToolRuntimeConfigSnapshot")
    expect(source).toContain("this.config = dependencies.config")
    expect(source).toMatch(
      /buildRuntimeToolContext\(\{\s*ctx,\s*config:\s*this\.config,/u,
    )
    expect(source).toContain("securityConfig.approvalMode")
  })

  it("wraps untrusted injection content as evidence instead of policy", async () => {
    const content = await readFile("tests/fixtures/security/web-injection.txt", "utf-8")
    const block = createContextBlock({
      id: "web-fixture",
      tag: "web_content",
      title: "Fetched page",
      content: content.trim(),
    })
    const rendered = renderContextBlockForPrompt(block)
    const validation = validatePromptAssemblyBlocks([block])

    expect(JSON.parse(rendered)).toMatchObject({
      role: "external_data",
      policyAuthority: "none",
      sourceKind: "web",
      instructionIsolation: "data_only",
      content: content.trim(),
    })
    expect(validation.ok).toBe(true)
    expect(validation.violations[0]).toContain("content only")
    expect(shouldBlockUntrustedMemoryWriteback(block)).toBe(true)
  })

  it("denies dangerous tool policy without approval and records the decision", () => {
    const decision = evaluateAndRecordToolPolicy({
      toolName: "shell_exec",
      riskLevel: "dangerous",
      params: { command: "echo hello" },
      ctx: toolCtx(),
      security: toolSecurity(),
    })

    expect(decision).toMatchObject({ decision: "deny", reasonCode: "approval_required" })
    const row = db.prepare<[], { reason_code: string; decision: string }>(
      "SELECT reason_code, decision FROM tool_policy_decisions WHERE id = ?",
    ).get(decision.id)
    expect(row).toEqual({ decision: "deny", reason_code: "approval_required" })
  })

  it("separates approval from permission scope", () => {
    const commandDenied = evaluateAndRecordToolPolicy({
      toolName: "shell_exec",
      riskLevel: "dangerous",
      params: { command: "rm -rf ./tmp" },
      ctx: toolCtx(),
      security: toolSecurity(),
      approvalId: "approval-1",
      approvalDecision: "allow_once",
    })
    const pathDenied = evaluateAndRecordToolPolicy({
      toolName: "file_write",
      riskLevel: "moderate",
      params: { path: "/etc/knowbee-denied.txt", content: "x" },
      ctx: toolCtx(),
      security: toolSecurity(),
      approvalId: "approval-2",
      approvalDecision: "allow_once",
    })
    const allowed = evaluateAndRecordToolPolicy({
      toolName: "file_write",
      riskLevel: "moderate",
      params: { path: join(allowedDir, "ok.txt"), content: "x" },
      ctx: toolCtx(),
      security: toolSecurity(),
      approvalId: "approval-3",
      approvalDecision: "allow_once",
    })

    expect(commandDenied).toMatchObject({ decision: "deny", reasonCode: "command_not_allowed" })
    expect(pathDenied).toMatchObject({ decision: "deny", reasonCode: "path_not_allowed" })
    expect(allowed).toMatchObject({ decision: "allow", reasonCode: "approval_allow_once" })
  })

  it("keeps injected file content out of direct memory writeback", async () => {
    const content = await readFile("tests/fixtures/security/file-injection.txt", "utf-8")
    const candidates = buildRunWritebackCandidates({
      kind: "tool_result",
      content,
      sessionId: "session-security",
      requestGroupId: "group-security",
      runId: "run-security",
      source: "slack",
      toolName: "file_read",
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.metadata?.["sourceTrust"]).toBe("tool_result")
    const prepared = prepareMemoryWritebackQueueInput(candidates[0]!)
    expect(prepared.status).toBe("discarded")
    expect(prepared.lastError).toContain("untrusted_prompt_injection")
  })

  it("reports gateway exposure without leaking credential raw values", () => {
    useRawConfig(`{
      ai: { connection: { provider: "openai", model: "gpt-5.4-mini", auth: { mode: "api_key", apiKey: "sk-task004-secret-value-1234567890" } } },
      webui: { enabled: true, host: "0.0.0.0", port: 18888, auth: { enabled: false } },
      telegram: { enabled: true, botToken: "123456789:telegram-task004-secret", allowedUserIds: [42120565] },
      slack: { enabled: true, botToken: "xoxb-task004-secret-token-1234567890", appToken: "xapp-task004-secret-token-1234567890", allowedChannelIds: ["C123"] }
    }`)

    const report = runDoctor({
      config: runtimeFixture.load(),
      paths: runtimeFixture.paths,
      mode: "quick",
      includeEnvironment: false,
      includeReleasePackage: false,
    })
    const serialized = JSON.stringify(report)
    expect(report.checks.find((check) => check.name === "gateway.exposure")?.status).toBe("blocked")
    expect(report.checks.find((check) => check.name === "credential.redaction")?.status).toBe("ok")
    expect(serialized).not.toContain("sk-task004-secret")
    expect(serialized).not.toContain("telegram-task004-secret")
    expect(serialized).not.toContain("xoxb-task004-secret")
  })

  it("redacts credential-like raw values from audit event exports", () => {
    insertAuditLog({
      timestamp: Date.now(),
      session_id: "session-security",
      run_id: "run-security",
      request_group_id: "group-security",
      channel: "telegram",
      source: "agent",
      tool_name: "web_fetch",
      params: JSON.stringify({ apiKey: "sk-task004-audit-secret-1234567890", chatId: "42120565" }),
      output: "<html><body>403 Forbidden token=telegram-task004-audit-secret</body></html>",
      result: "failed",
      duration_ms: 12,
      approval_required: 0,
      approved_by: null,
      error_code: "403",
      retry_count: 0,
      stop_reason: "raw_response",
    })

    const exported = listAuditEvents({ limit: "10" })
    const serialized = JSON.stringify(exported)
    expect(serialized).not.toContain("sk-task004-audit-secret")
    expect(serialized).not.toContain("telegram-task004-audit-secret")
    expect(serialized).not.toContain("42120565")
    expect(serialized).not.toContain("<html>")
  })
})
