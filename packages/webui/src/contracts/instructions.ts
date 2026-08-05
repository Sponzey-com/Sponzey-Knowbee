export interface ActiveInstructionSource {
  path: string
  scope: "global" | "project"
  level: number
  loaded: boolean
  size: number
  error?: string
}

export interface ActiveInstructionsResponse {
  workDir: string
  gitRoot?: string
  disclosure: {
    purpose: "prompt_review" | "prompt_improvement" | "administration" | "security_review" | "debugging" | "audit"
    actor: string
    target: string
    audience: string
    redactionMode: "redacted" | "raw_authorized"
    state: "redacted" | "raw_authorized"
  }
  mergedText: string
  sources: ActiveInstructionSource[]
}
