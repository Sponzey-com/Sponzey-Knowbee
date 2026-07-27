import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { eventBus } from "../packages/core/src/events/index.js"
import { hashApprovalParams } from "../packages/core/src/runs/approval-registry.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import type { ToolAuthorizationReceipt } from "../packages/core/src/tools/types.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

beforeEach(() => {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-tool-dispatcher-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("tool dispatcher source filtering", () => {
  it("does not apply removed discovery-search transition blocking to direct web fetches", async () => {
    insertSession({
      id: "session-web-transition",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-web-transition",
      sessionId: "session-web-transition",
      prompt: "현재 주가를 확인해줘",
      source: "webui",
      requestGroupId: "group-web-transition",
    })
    const config = {
      ...DEFAULT_CONFIG,
      security: { ...DEFAULT_CONFIG.security, approvalMode: "off" as const },
    }
    const execute = vi.fn(async () => ({
      success: true,
      output: "URL: https://finance.example/quote/000660",
      details: {
        sourceEvidence: [{ sourceUrl: "https://finance.example/quote/000660" }],
      },
    }))
    const context = {
      sessionId: "session-web-transition",
      runId: "run-web-transition",
      requestGroupId: "group-web-transition",
      workDir: process.cwd(),
      userMessage: "현재 주가를 확인해줘",
      source: "webui" as const,
      allowWebAccess: true,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }
    const firstDispatcher = new ToolDispatcher({ config })
    firstDispatcher.register({
      name: "web_fetch",
      description: "fetches a direct quote URL",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      execute,
    })

    const detach = eventBus.on("approval.request", ({ resolve }) => resolve("allow_run"))
    await expect(firstDispatcher.dispatch("web_fetch", { url: "https://finance.example/quote/000660" }, context))
      .resolves.toMatchObject({ success: true })

    const restartedDispatcher = new ToolDispatcher({ config })
    restartedDispatcher.register({
      name: "web_fetch",
      description: "fetches another direct quote URL",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      execute,
    })
    const second = await restartedDispatcher.dispatch(
      "web_fetch",
      { url: "https://finance.example/quote/005930" },
      context,
    )
    detach()

    expect(execute).toHaveBeenCalledTimes(2)
    expect(second).toMatchObject({
      success: true,
    })
  })

  it("resumes the waiting tool when approval is resolved without a WebSocket subscriber", async () => {
    insertSession({
      id: "session-rest-approval",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-rest-approval",
      sessionId: "session-rest-approval",
      prompt: "현재 값을 조회해줘",
      source: "webui",
    })
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const execute = vi.fn(async () => ({ success: true, output: "current value" }))
    dispatcher.register({
      name: "approval_probe",
      description: "REST approval continuation probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: true,
      execute,
    })
    const abortController = new AbortController()
    let markRequested: (() => void) | undefined
    const requested = new Promise<void>((resolve) => {
      markRequested = resolve
    })
    const detach = eventBus.on("approval.request", () => markRequested?.())

    try {
      const dispatch = dispatcher.dispatch("approval_probe", { query: "current value" }, {
        sessionId: "session-rest-approval",
        runId: "run-rest-approval",
        requestGroupId: "run-rest-approval",
        workDir: process.cwd(),
        userMessage: "현재 값을 조회해줘",
        source: "webui",
        allowWebAccess: true,
        onProgress: () => undefined,
        signal: abortController.signal,
      })

      await requested
      expect(dispatcher.resolvePendingInteraction("run-rest-approval", "allow_run")).toBe(true)
      await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
      await expect(dispatch).resolves.toMatchObject({ success: true, output: "current value" })
    } finally {
      abortController.abort()
      detach()
    }
  })

  it("does not reuse allow_run approval for a different side-effect tool", async () => {
    insertSession({
      id: "session-operation-scope",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-operation-scope",
      sessionId: "session-operation-scope",
      prompt: "capture and deliver",
      source: "webui",
      requestGroupId: "group-operation-scope",
    })
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const capture = vi.fn(async () => ({ success: true, output: "captured" }))
    const delivery = vi.fn(async () => ({ success: true, output: "delivered" }))
    dispatcher.register({
      name: "capture_probe",
      description: "capture approval scope probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "moderate",
      requiresApproval: true,
      execute: capture,
    })
    dispatcher.register({
      name: "delivery_probe",
      description: "delivery approval scope probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "moderate",
      requiresApproval: true,
      execute: delivery,
    })
    const approvals: string[] = []
    const detach = eventBus.on("approval.request", ({ toolName, resolve }) => {
      approvals.push(toolName)
      resolve(approvals.length === 1 ? "allow_run" : "deny")
    })
    const context = {
      sessionId: "session-operation-scope",
      runId: "run-operation-scope",
      requestGroupId: "group-operation-scope",
      workDir: process.cwd(),
      userMessage: "capture and deliver",
      source: "webui" as const,
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }

    try {
      await expect(dispatcher.dispatch("capture_probe", { targetId: "target-a" }, context))
        .resolves.toMatchObject({ success: true })
      await expect(dispatcher.dispatch("capture_probe", { targetId: "target-a" }, context))
        .resolves.toMatchObject({ success: true })
      await expect(dispatcher.dispatch("capture_probe", { targetId: "target-b" }, context))
        .resolves.toMatchObject({ success: false, error: "denied" })
      await expect(dispatcher.dispatch("delivery_probe", {}, context))
        .resolves.toMatchObject({ success: false, error: "denied" })
    } finally {
      detach()
    }

    expect(approvals).toEqual(["capture_probe", "capture_probe", "delivery_probe"])
    expect(capture).toHaveBeenCalledTimes(2)
    expect(delivery).not.toHaveBeenCalled()
  })

  it("snapshots explicit evidence source metadata at registration", async () => {
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: { ...DEFAULT_CONFIG.security, approvalMode: "off" },
      },
    })
    const tool = {
      name: "external_quote_probe",
      description: "source metadata probe",
      parameters: { type: "object" as const, properties: {} },
      riskLevel: "safe" as const,
      requiresApproval: false,
      evidenceSourceKind: "mcp" as const,
      async execute() {
        return { success: true, output: "quote=123" }
      },
    }
    dispatcher.register(tool)
    ;(tool as { evidenceSourceKind: string }).evidenceSourceKind = "skill"

    const result = await dispatcher.dispatch("external_quote_probe", {}, {
      sessionId: "session-source",
      runId: "run-source",
      requestGroupId: "group-source",
      workDir: process.cwd(),
      userMessage: "quote",
      source: "webui",
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    })

    expect(result.evidenceSource).toMatchObject({
      sourceKind: "mcp",
      trustClass: "untrusted_external",
      instructionIsolation: "data_only",
    })
    expect(result.evidenceSource?.sourceRef).toMatch(/^tool-result:mcp:[a-f0-9]{64}$/u)
    expect(JSON.stringify(result.evidenceSource)).not.toContain("quote=123")
    expect(JSON.stringify(result.evidenceSource)).not.toContain("group-source")
  })

  it("preserves the same evidence source receipt when an exact call is deduplicated", async () => {
    insertSession({
      id: "session-source-replay",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-source-replay",
      sessionId: "session-source-replay",
      prompt: "quote",
      source: "webui",
      requestGroupId: "group-source-replay",
    })
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: { ...DEFAULT_CONFIG.security, approvalMode: "off" },
      },
    })
    const execute = vi.fn(async () => ({ success: true, output: "capture" }))
    dispatcher.register({
      name: "web_fetch",
      description: "dedupe source probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      evidenceSourceKind: "mcp",
      execute,
    })
    const context = {
      sessionId: "session-source-replay",
      runId: "run-source-replay",
      requestGroupId: "group-source-replay",
      workDir: process.cwd(),
      userMessage: "capture",
      source: "webui" as const,
      allowWebAccess: true,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }

    const detach = eventBus.on("approval.request", ({ resolve }) => resolve("allow_once"))
    const first = await dispatcher.dispatch("web_fetch", { url: "https://finance.example/quote" }, context)
    const replay = await dispatcher.dispatch("web_fetch", { url: "https://finance.example/quote" }, context)
    detach()

    expect(execute).toHaveBeenCalledTimes(1)
    expect(replay.evidenceSource).toEqual(first.evidenceSource)
    expect(replay.evidenceSource?.sourceKind).toBe("mcp")
  })

  it("does not execute a sensitive Yeonjang operation when safe-default approval is denied", async () => {
    insertSession({
      id: "session-sensitive-boundary",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-sensitive-boundary",
      sessionId: "session-sensitive-boundary",
      prompt: "파일을 변경해줘",
      source: "webui",
    })
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: {
          ...DEFAULT_CONFIG.security,
          approvalMode: "off",
        },
      },
    })
    const execute = vi.fn(async () => ({ success: true, output: "must not execute" }))
    dispatcher.register({
      name: "file_write",
      description: "sensitive boundary probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      execute,
    })
    const detach = eventBus.on("approval.request", ({ resolve }) => resolve("deny"))

    try {
      const result = await dispatcher.dispatch("file_write", {}, {
        sessionId: "session-sensitive-boundary",
        runId: "run-sensitive-boundary",
        requestGroupId: "run-sensitive-boundary",
        workDir: process.cwd(),
        userMessage: "파일을 변경해줘",
        source: "webui",
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      })

      expect(result).toMatchObject({ success: false, error: "denied" })
      expect(execute).not.toHaveBeenCalled()
    } finally {
      detach()
    }
  })

  it("passes an exact policy authorization receipt to the tool adapter", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    let observedReceipt: Readonly<ToolAuthorizationReceipt> | undefined
    dispatcher.register({
      name: "receipt_probe",
      description: "captures dispatcher authorization",
      parameters: { type: "object", properties: { value: { type: "string" } } },
      riskLevel: "safe",
      requiresApproval: false,
      async execute(_params, ctx) {
        observedReceipt = ctx.authorizationReceipt
        return { success: true, output: "ok" }
      },
    })
    const params = { value: "exact-scope" }

    const result = await dispatcher.dispatch("receipt_probe", params, {
      sessionId: "session-receipt",
      runId: "run-receipt",
      requestGroupId: "group-receipt",
      workDir: process.cwd(),
      userMessage: "probe",
      source: "webui",
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    })

    expect(result.success).toBe(true)
    expect(observedReceipt).toMatchObject({
      toolName: "receipt_probe",
      paramsHash: hashApprovalParams(params),
      runId: "run-receipt",
      requestGroupId: "group-receipt",
    })
    expect(observedReceipt?.policyDecisionId).toEqual(expect.any(String))
  })

  it("rejects channel-specific tools on unsupported sources", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    dispatcher.register({
      name: "telegram_send_file",
      description: "telegram only",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      availableSources: ["telegram"],
      async execute() {
        return { success: true, output: "ok" }
      },
    })

    const result = await dispatcher.dispatch(
      "telegram_send_file",
      {},
      {
        sessionId: "session-1",
        runId: "run-1",
        workDir: process.cwd(),
        userMessage: "send it to slack",
        source: "slack",
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe("TOOL_SOURCE_NOT_SUPPORTED")
  })

  it("emits request group metadata on tool lifecycle events", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    dispatcher.register({
      name: "echo_tool",
      description: "returns ok",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute() {
        return { success: true, output: "ok" }
      },
    })

    const seenBefore: Array<{ requestGroupId?: string; toolName: string }> = []
    const seenAfter: Array<{ requestGroupId?: string; toolName: string }> = []
    const detachBefore = eventBus.on("tool.before", (payload) => {
      seenBefore.push({ requestGroupId: payload.requestGroupId, toolName: payload.toolName })
    })
    const detachAfter = eventBus.on("tool.after", (payload) => {
      seenAfter.push({ requestGroupId: payload.requestGroupId, toolName: payload.toolName })
    })

    try {
      const result = await dispatcher.dispatch(
        "echo_tool",
        {},
        {
          sessionId: "session-1",
          runId: "run-1",
          requestGroupId: "group-1",
          workDir: process.cwd(),
          userMessage: "run it",
          source: "webui",
          allowWebAccess: false,
          onProgress: () => undefined,
          signal: new AbortController().signal,
        },
      )

      expect(result.success).toBe(true)
      expect(seenBefore).toContainEqual({ requestGroupId: "group-1", toolName: "echo_tool" })
      expect(seenAfter).toContainEqual({ requestGroupId: "group-1", toolName: "echo_tool" })
    } finally {
      detachBefore()
      detachAfter()
    }
  })

  it("redacts thrown tool errors before returning tool results", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const secret = "sk-task0584-tool-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/tool-secret.txt"
    dispatcher.register({
      name: "throwing_tool",
      description: "throws",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute() {
        throw new Error(`provider failed token=${secret} path=${localPath}`)
      },
    })

    const result = await dispatcher.dispatch(
      "throwing_tool",
      {},
      {
        sessionId: "session-redaction",
        runId: "run-redaction",
        workDir: process.cwd(),
        userMessage: "run throwing tool",
        source: "webui",
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
    )

    const logOutput = stderr.mock.calls.map((call) => String(call[0])).join("")
    const resultText = JSON.stringify(result)
    expect(result.success).toBe(false)
    expect(resultText).toContain("token=***")
    expect(resultText).toContain("[internal-path-redacted]")
    expect(logOutput).toContain("token=***")
    expect(logOutput).toContain("[internal-path-redacted]")
    expect(`${resultText}\n${logOutput}`).not.toContain(secret)
    expect(`${resultText}\n${logOutput}`).not.toContain(localPath)
    stderr.mockRestore()
  })

  it("does not use raw error expressions for dispatcher failure payloads", () => {
    const source = readFileSync(
      new URL("../packages/core/src/tools/dispatcher.ts", import.meta.url),
      "utf-8",
    )

    expect(source).toContain("function safeDispatcherErrorMessage")
    expect(source).toContain("const message = safeDispatcherErrorMessage(error)")
    expect(source).toContain("const msg = safeDispatcherErrorMessage(err)")
    expect(source).not.toContain(
      "approval continuity update failed: ${error instanceof Error ? error.message : String(error)}",
    )
    expect(source).not.toContain(
      "const message = error instanceof Error ? error.message : String(error)",
    )
    expect(source).not.toContain("const msg = err instanceof Error ? err.message : String(err)")
  })
})
