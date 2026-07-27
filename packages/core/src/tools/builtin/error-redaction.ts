import { redactLogText } from "../../logger/index.js"

export function toolUserFacingErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}
