import type { UserExecutionControlDecision } from "../contracts/safety-control-self-solve.js"

export type AppliedUserExecutionControl =
  | { status: "ignored"; reasonCode: "wrong_target" | "stale_or_duplicate" }
  | { status: "cancelled"; runId: string; commandId: string }
  | { status: "redirected"; previousRunId: string; nextRunId: string; newGoalRef: string; commandId: string }

export async function applyUserExecutionControl(input: {
  currentRunId: string
  decision: UserExecutionControlDecision
  cancelRun: (runId: string) => void | Promise<void>
  startRedirectedRun: (input: { previousRunId: string; newGoalRef: string; commandId: string }) => string | Promise<string>
}): Promise<AppliedUserExecutionControl> {
  if (input.decision.status === "ignored") return input.decision
  await input.cancelRun(input.currentRunId)
  if (input.decision.status === "cancelled") {
    return { status: "cancelled", runId: input.currentRunId, commandId: input.decision.commandId }
  }
  const nextRunId = await input.startRedirectedRun({
    previousRunId: input.currentRunId,
    newGoalRef: input.decision.newGoalRef,
    commandId: input.decision.commandId,
  })
  return {
    status: "redirected",
    previousRunId: input.currentRunId,
    nextRunId,
    newGoalRef: input.decision.newGoalRef,
    commandId: input.decision.commandId,
  }
}
