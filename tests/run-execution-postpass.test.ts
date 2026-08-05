import { describe, expect, it } from "vitest"
import { decideExecutionPostPassRecovery } from "../packages/core/src/runs/execution-postpass.ts"
import { buildRecoveryKey } from "../packages/core/src/runs/recovery.ts"

describe("execution post-pass recovery", () => {
  it("returns a command failure retry when an unseen failed command exists", () => {
    const decision = decideExecutionPostPassRecovery({
      originalRequest: "스크린샷을 보내줘",
      preview: "screencapture failed",
      directArtifactDeliverySatisfied: false,
      failedCommandTools: [
        {
          toolName: "shell_exec",
          output: "command not found: screencapture",
        },
      ],
      commandFailureSeen: true,
      commandRecoveredWithinSamePass: false,
      executionRecovery: null,
      seenCommandFailureRecoveryKeys: new Set<string>(),
      seenExecutionRecoveryKeys: new Set<string>(),
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      usedTurns: 0,
      maxDelegationTurns: 3,
    })

    expect(decision.kind).toBe("retry")
    if (decision.kind !== "retry") return
    expect(decision.seenKeyKind).toBe("command")
    expect(decision.state.eventLabel).toBe("명령 실패 대안 재시도")
    expect(decision.state.failureTitle).toBe("command_failure_recovery")
    expect(decision.state.nextMessage).toContain("[Command Failure Recovery]")
  })

  it("returns retry when generic execution recovery passes the old fixed budget", () => {
    const decision = decideExecutionPostPassRecovery({
      originalRequest: "예약을 등록해줘",
      preview: "create_schedule failed",
      directArtifactDeliverySatisfied: false,
      failedCommandTools: [],
      commandFailureSeen: false,
      commandRecoveredWithinSamePass: false,
      executionRecovery: {
        summary: "create_schedule 실패 후 다른 방법을 찾습니다.",
        reason: "invalid schedule registration path",
        toolNames: ["create_schedule"],
      },
      seenCommandFailureRecoveryKeys: new Set<string>(),
      seenExecutionRecoveryKeys: new Set<string>(),
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      usedTurns: 2,
      maxDelegationTurns: 2,
    })

    expect(decision.kind).toBe("retry")
    if (decision.kind !== "retry") return
    expect(decision.seenKeyKind).toBe("generic_execution")
    expect(decision.state.eventLabel).toBe("도구 실패 대안 재시도")
    expect(decision.state.nextMessage).toContain("[Execution Recovery]")
  })

  it("returns to LLM result review when deterministic command recovery has no unseen path", () => {
    const decision = decideExecutionPostPassRecovery({
      originalRequest: "스크린샷을 보내줘",
      preview: "screencapture failed",
      directArtifactDeliverySatisfied: false,
      failedCommandTools: [
        {
          toolName: "shell_exec",
          output: "command not found: screencapture",
        },
      ],
      commandFailureSeen: true,
      commandRecoveredWithinSamePass: false,
      executionRecovery: null,
      seenCommandFailureRecoveryKeys: new Set<string>([
        buildRecoveryKey({
          action: "command_failure",
          toolName: "shell_exec",
          error: "command not found: screencapture",
        }),
      ]),
      seenExecutionRecoveryKeys: new Set<string>(),
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      usedTurns: 0,
      maxDelegationTurns: 3,
    })

    expect(decision).toEqual({ kind: "none" })
  })

  it("returns to LLM result review when generic recovery has no unseen deterministic path", () => {
    const decision = decideExecutionPostPassRecovery({
      originalRequest: "예약을 등록해줘",
      preview: "create_schedule failed",
      directArtifactDeliverySatisfied: false,
      failedCommandTools: [],
      commandFailureSeen: false,
      commandRecoveredWithinSamePass: false,
      executionRecovery: {
        summary: "create_schedule 실패 후 다른 방법을 찾습니다.",
        reason: "invalid schedule registration path",
        toolNames: ["create_schedule"],
      },
      seenCommandFailureRecoveryKeys: new Set<string>(),
      seenExecutionRecoveryKeys: new Set<string>([
        buildRecoveryKey({
          action: "execution_failure",
          toolName: "create_schedule",
          error: "invalid schedule registration path",
        }),
      ]),
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      usedTurns: 0,
      maxDelegationTurns: 3,
    })

    expect(decision).toEqual({ kind: "none" })
  })

  it("does not retry stale execution recovery after direct artifact delivery is already satisfied", () => {
    const decision = decideExecutionPostPassRecovery({
      originalRequest: "FaceTime HD 카메라로 사진 한번만 찍어줘",
      preview: "사진을 전송했습니다.",
      directArtifactDeliverySatisfied: true,
      failedCommandTools: [],
      commandFailureSeen: false,
      commandRecoveredWithinSamePass: false,
      executionRecovery: {
        summary: "도구 실패 대안 재시도",
        reason: "earlier capture timeout",
        toolNames: ["yeonjang_camera_capture"],
      },
      seenCommandFailureRecoveryKeys: new Set<string>(),
      seenExecutionRecoveryKeys: new Set<string>(),
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      usedTurns: 1,
      maxDelegationTurns: 3,
    })

    expect(decision).toEqual({ kind: "none" })
  })
})
