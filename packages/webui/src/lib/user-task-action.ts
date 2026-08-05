export type UserTaskActionState = "available" | "blocked" | "completed"

export interface UserTaskActionProjection {
  state: UserTaskActionState
  outcome: string
  reasonCode?: string
}

export function projectUserTaskAction(input: {
  available: boolean
  completed?: boolean
  outcome: string
  blockedReason?: string
}): UserTaskActionProjection {
  if (!input.available) {
    return {
      state: "blocked",
      outcome: input.outcome,
      reasonCode: input.blockedReason ?? "command_unavailable",
    }
  }
  return {
    state: input.completed ? "completed" : "available",
    outcome: input.outcome,
  }
}
