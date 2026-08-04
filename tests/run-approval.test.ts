import { afterEach, describe, expect, it, vi } from "vitest"
import {
  detectSyntheticApprovalRequest,
  requestSyntheticApproval,
} from "../packages/core/src/runs/approval.ts"

afterEach(() => {
  vi.useRealTimers()
})

describe("run approval helpers", () => {
  it("does not create a synthetic approval for a privileged Tool owned by the dispatcher", () => {
    const approval = detectSyntheticApprovalRequest({
      executionProfile: {
        approvalRequired: true,
        approvalTool: "screen_capture",
      },
      originalRequest: "메인 화면을 캡처해서 보여줘",
      preview: "스크린샷 캡처 권한이 필요합니다.",
      review: {
        status: "ask_user",
        summary: "화면 캡처 진행 전 승인이 필요합니다.",
        userMessage: "화면 기록 권한을 허용해 주세요.",
      },
      usesWorkerRuntime: true,
      requiresPrivilegedToolExecution: true,
      successfulTools: [],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
    })

    expect(approval).toBeNull()
  })

  it("does not request synthetic approval when meaningful execution evidence already exists", () => {
    const approval = detectSyntheticApprovalRequest({
      executionProfile: {
        approvalRequired: true,
        approvalTool: "file_write",
      },
      originalRequest: "파일을 만들어줘",
      preview: "파일을 만들었습니다.",
      review: {
        status: "ask_user",
        summary: "파일 작업 전 승인이 필요합니다.",
      },
      usesWorkerRuntime: true,
      requiresPrivilegedToolExecution: true,
      successfulTools: [{ toolName: "file_write", output: "ok" }],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: true,
    })

    expect(approval).toBeNull()
  })

  it("does not turn a privileged Tool failure into a second synthetic approval", () => {
    const approval = detectSyntheticApprovalRequest({
      executionProfile: {
        approvalRequired: true,
        approvalTool: "screen_capture",
      },
      originalRequest: "현재 상태를 확인한 뒤 화면을 캡처해줘",
      preview: "상태 확인을 마쳤으며 화면 캡처 승인이 필요합니다.",
      review: {
        status: "ask_user",
        summary: "화면 캡처 전 승인이 필요합니다.",
      },
      usesWorkerRuntime: true,
      requiresPrivilegedToolExecution: true,
      successfulTools: [{ toolName: "system_status", output: "ready" }],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
    })

    expect(approval).toBeNull()
  })

  it("does not request approval for non-privileged non-worker flows", () => {
    const approval = detectSyntheticApprovalRequest({
      executionProfile: {
        approvalRequired: false,
        approvalTool: "none",
      },
      originalRequest: "안녕이라고 말해줘",
      preview: "안녕",
      review: {
        status: "ask_user",
        summary: "사용자 확인이 필요합니다.",
      },
      usesWorkerRuntime: false,
      requiresPrivilegedToolExecution: false,
      successfulTools: [],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
    })

    expect(approval).toBeNull()
  })

  it("times out and cancels when synthetic approval is not resolved", async () => {
    vi.useFakeTimers()

    const steps: Array<{ stepKey: string; status: string; summary: string }> = []
    const statusUpdates: Array<{ status: string; summary: string; canCancel: boolean }> = []
    const cancelled: Array<{ runId: string; runSummary: string }> = []
    const resolvedEvents: Array<{ decision: string; reason?: string }> = []

    const promise = requestSyntheticApproval({
      runId: "run-timeout",
      sessionId: "session-timeout",
      toolName: "screen_capture",
      summary: "화면 캡처 진행 전 승인이 필요합니다.",
      params: { source: "agent_reply" },
      signal: new AbortController().signal,
    }, {
      timeoutSec: 5,
      fallback: "deny",
      appendRunEvent: () => undefined,
      setRunStepStatus: (runId, stepKey, status, summary) => {
        steps.push({ stepKey, status, summary })
      },
      updateRunStatus: (runId, status, summary, canCancel) => {
        statusUpdates.push({ status, summary, canCancel })
      },
      cancelRun: (runId, denial) => {
        cancelled.push({ runId, runSummary: denial.runSummary })
      },
      emitApprovalResolved: (payload) => {
        resolvedEvents.push({ decision: payload.decision, reason: payload.reason })
      },
      emitApprovalRequest: () => undefined,
    })

    await vi.advanceTimersByTimeAsync(5_000)
    await expect(promise).resolves.toBe("deny")

    expect(steps.some((step) => step.stepKey === "awaiting_approval" && step.status === "cancelled")).toBe(true)
    expect(statusUpdates[0]?.status).toBe("awaiting_approval")
    expect(cancelled).toEqual([{ runId: "run-timeout", runSummary: "screen_capture 승인 시간이 지나 시스템이 요청을 중단했습니다." }])
    expect(resolvedEvents).toEqual([{ decision: "deny", reason: "timeout" }])
  })

  it("resolves allow_run through the emitted approval callback", async () => {
    let resolveApproval: ((decision: "allow_once" | "allow_run" | "deny", reason?: "user" | "timeout" | "abort" | "system") => void) | undefined
    const steps: Array<{ stepKey: string; status: string; summary: string }> = []
    const cancelled: string[] = []

    const promise = requestSyntheticApproval({
      runId: "run-allow",
      sessionId: "session-allow",
      toolName: "file_write",
      summary: "파일 작업 진행 전 승인이 필요합니다.",
      params: { source: "agent_reply" },
      signal: new AbortController().signal,
    }, {
      timeoutSec: 30,
      fallback: "deny",
      appendRunEvent: () => undefined,
      setRunStepStatus: (runId, stepKey, status, summary) => {
        steps.push({ stepKey, status, summary })
      },
      updateRunStatus: () => undefined,
      cancelRun: (runId) => {
        cancelled.push(runId)
      },
      emitApprovalResolved: () => undefined,
      emitApprovalRequest: (payload) => {
        resolveApproval = payload.resolve
      },
    })

    resolveApproval?.("allow_run", "user")
    await expect(promise).resolves.toBe("allow_run")

    expect(cancelled).toEqual([])
    expect(steps.some((step) => step.stepKey === "awaiting_approval" && step.status === "completed")).toBe(true)
  })

  it("records an aborted approval wait as one canonical cancellation before execution", async () => {
    const controller = new AbortController()
    const steps: Array<{ stepKey: string; status: string; summary: string }> = []
    const cancelled: Array<{ runId: string; runSummary: string }> = []
    const resolvedEvents: Array<{ decision: string; reason?: string }> = []

    const promise = requestSyntheticApproval({
      runId: "run-aborted",
      sessionId: "session-aborted",
      toolName: "yeonjang_camera_capture",
      summary: "카메라 촬영 진행 전 승인이 필요합니다.",
      params: { source: "telegram" },
      signal: controller.signal,
    }, {
      timeoutSec: 30,
      fallback: "deny",
      appendRunEvent: () => undefined,
      setRunStepStatus: (_runId, stepKey, status, summary) => {
        steps.push({ stepKey, status, summary })
      },
      updateRunStatus: () => undefined,
      cancelRun: (runId, denial) => {
        cancelled.push({ runId, runSummary: denial.runSummary })
      },
      emitApprovalResolved: (payload) => {
        resolvedEvents.push({
          decision: payload.decision,
          reason: payload.reason,
        })
      },
      emitApprovalRequest: () => undefined,
    })

    controller.abort()
    await expect(promise).resolves.toBe("deny")

    expect(steps).toContainEqual(expect.objectContaining({
      stepKey: "awaiting_approval",
      status: "cancelled",
    }))
    expect(cancelled).toEqual([{
      runId: "run-aborted",
      runSummary: "yeonjang_camera_capture 승인 처리가 시스템에 의해 중단되었습니다.",
    }])
    expect(resolvedEvents).toEqual([{ decision: "deny", reason: "abort" }])
  })

  it("does not emit an approval request when cancellation already won admission", async () => {
    const controller = new AbortController()
    controller.abort()
    const emitApprovalRequest = vi.fn()
    const cancelRun = vi.fn()

    await expect(requestSyntheticApproval({
      runId: "run-pre-aborted",
      sessionId: "session-pre-aborted",
      toolName: "yeonjang_camera_capture",
      summary: "카메라 촬영 진행 전 승인이 필요합니다.",
      params: { source: "telegram" },
      signal: controller.signal,
    }, {
      timeoutSec: 30,
      fallback: "deny",
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      cancelRun,
      emitApprovalResolved: vi.fn(),
      emitApprovalRequest,
    })).resolves.toBe("deny")

    expect(emitApprovalRequest).not.toHaveBeenCalled()
    expect(cancelRun).toHaveBeenCalledOnce()
  })
})
