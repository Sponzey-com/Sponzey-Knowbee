import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext, ToolResult } from "../packages/core/src/tools/types.ts"

const invokeYeonjangMethod = vi.fn()
const getMqttExtensionSnapshots = vi.fn()
const isolatedStateDir = join(tmpdir(), `knowbee-readonly-evidence-test-${process.pid}`)

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  invokeYeonjangMethod,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

const realFs = await vi.importActual<typeof import("node:fs")>("node:fs")
realFs.mkdirSync(isolatedStateDir, { recursive: true })
const { closeDb } = await import("../packages/core/src/db/index.js")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
initializeTestDbRuntime(isolatedStateDir)
const { admitYeonjangEvidenceForReview } = await import("../packages/core/src/yeonjang/evidence-admission.ts")
const {
  yeonjangBrowserActiveHintTool,
  yeonjangBrowserListTool,
  yeonjangDiskExistsTool,
  yeonjangDiskInfoTool,
  yeonjangDiskUsageTool,
  yeonjangFileListTool,
  yeonjangFileReadTool,
  yeonjangProcessInfoTool,
  yeonjangProcessListTool,
} = await import("../packages/core/src/tools/builtin/yeonjang.ts")

afterAll(() => {
  closeDb()
  realFs.rmSync(isolatedStateDir, { recursive: true, force: true })
})

function createContext(): ToolContext {
  return {
    artifactStorage: {
      rootDir: join(isolatedStateDir, "artifacts"),
      fileSystem: {
        exists: () => false,
        realpath: (path) => path,
        remove: () => undefined,
        stat: () => ({ size: 0 }) as never,
      },
    },
    sessionId: "session-1",
    runId: "run-1",
    requestGroupId: "request-group-1",
    workDir: process.cwd(),
    userMessage: "연장으로 조회해줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

function expectAdmitted(result: ToolResult, expectedToolName: string) {
  expect(result.success).toBe(true)
  const admission = admitYeonjangEvidenceForReview({ result, expectedToolName })
  expect(admission).toMatchObject({
    status: "admitted",
    evidence: {
      schemaVersion: "yeonjang-evidence-v1",
      targetRef: "yeonjang-main",
      toolName: expectedToolName,
      postCheck: { kind: "not_required" },
      rawPayloadVisibility: "audit_only",
    },
  })
  return admission
}

describe("task017 Yeonjang read-only evidence coverage", () => {
  beforeEach(() => {
    invokeYeonjangMethod.mockReset()
    getMqttExtensionSnapshots.mockReturnValue([
      {
        extensionId: "yeonjang-main",
        displayName: "작업용 맥",
        instanceId: "instance-local",
        instanceAlias: "local-mac",
        state: "online",
        message: "ready",
        platform: "macos",
        methods: [
          "file.list",
          "file.read",
          "disk.info",
          "disk.usage",
          "disk.exists",
          "process.list",
          "process.info",
          "browser.list",
          "browser.active_hint",
        ],
        sessionId: "target-session-1",
        trustState: "trusted",
      },
    ])
  })

  it("admits file list and file read evidence without leaking file text into evidence", async () => {
    invokeYeonjangMethod
      .mockResolvedValueOnce({
        path: "/tmp",
        entries: [
          { name: "note.txt", kind: "file", bytes: 12, readonly: false, modifiedAt: "2026-07-21T00:00:00Z" },
        ],
      })
      .mockResolvedValueOnce({
        path: "/tmp/note.txt",
        encoding: "utf8",
        text: "private file body",
        bytesRead: 17,
        totalBytes: 17,
        truncated: false,
      })

    const listResult = await yeonjangFileListTool.execute({
      extensionId: "yeonjang-main",
      path: "/tmp",
    }, createContext())
    expectAdmitted(listResult, "yeonjang_file_list")

    const readResult = await yeonjangFileReadTool.execute({
      extensionId: "yeonjang-main",
      path: "/tmp/note.txt",
    }, createContext())
    expectAdmitted(readResult, "yeonjang_file_read")
    expect(JSON.stringify(readResult.details)).not.toContain("private file body")
  })

  it("admits disk info, usage, and exists evidence", async () => {
    invokeYeonjangMethod
      .mockResolvedValueOnce({
        path: "/",
        exists: true,
        kind: "directory",
        readonly: false,
        totalBytes: 1000,
        freeBytes: 400,
        availableBytes: 300,
      })
      .mockResolvedValueOnce({
        path: "/",
        totalBytes: 1000,
        freeBytes: 400,
        availableBytes: 300,
      })
      .mockResolvedValueOnce({
        path: "/tmp",
        exists: true,
        kind: "directory",
        readonly: false,
      })

    expectAdmitted(await yeonjangDiskInfoTool.execute({
      extensionId: "yeonjang-main",
      path: "/",
    }, createContext()), "yeonjang_disk_info")

    expectAdmitted(await yeonjangDiskUsageTool.execute({
      extensionId: "yeonjang-main",
      path: "/",
    }, createContext()), "yeonjang_disk_usage")

    expectAdmitted(await yeonjangDiskExistsTool.execute({
      extensionId: "yeonjang-main",
      path: "/tmp",
    }, createContext()), "yeonjang_disk_exists")
  })

  it("admits process and browser evidence without process internals or browser page data", async () => {
    const processEntry = {
      pid: 123,
      name: "Safari",
      status: "running",
      memoryBytes: 100,
      cpuUsage: 1.2,
      startedAt: 123456,
    }
    const browserEntry = {
      pid: 123,
      appName: "Safari",
      browser: "safari",
      running: true,
      confidence: "high",
      detectedBy: "process-name",
      status: "running",
    }
    invokeYeonjangMethod
      .mockResolvedValueOnce({
        processes: [processEntry],
        count: 1,
        totalCount: 1,
        truncated: false,
        limit: 50,
      })
      .mockResolvedValueOnce({
        process: processEntry,
      })
      .mockResolvedValueOnce({
        browsers: [browserEntry],
        count: 1,
        totalCount: 1,
        truncated: false,
        limit: 50,
      })
      .mockResolvedValueOnce({
        activeBrowser: browserEntry,
        available: true,
        reason: "highest-confidence-browser",
      })

    expectAdmitted(await yeonjangProcessListTool.execute({
      extensionId: "yeonjang-main",
    }, createContext()), "yeonjang_process_list")

    expectAdmitted(await yeonjangProcessInfoTool.execute({
      extensionId: "yeonjang-main",
      pid: 123,
    }, createContext()), "yeonjang_process_info")

    expectAdmitted(await yeonjangBrowserListTool.execute({
      extensionId: "yeonjang-main",
    }, createContext()), "yeonjang_browser_list")

    const activeHintResult = await yeonjangBrowserActiveHintTool.execute({
      extensionId: "yeonjang-main",
    }, createContext())
    expectAdmitted(activeHintResult, "yeonjang_browser_active_hint")
    expect(JSON.stringify(activeHintResult.details)).not.toContain("http://")
    expect(JSON.stringify(activeHintResult.details)).not.toContain("commandLine")
  })
})
