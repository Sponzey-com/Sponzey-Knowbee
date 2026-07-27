export type SubAgentEditSessionStatus =
  | "closed"
  | "editing"
  | "saving"
  | "saved"
  | "cancelled"
  | "failed"

export interface SubAgentEditSession<T> {
  status: SubAgentEditSessionStatus
  baseline: T
  working: T
}

export interface FocusTarget {
  isConnected: boolean
  focus(): void
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function expectStatus<T>(
  session: SubAgentEditSession<T>,
  allowed: SubAgentEditSessionStatus[],
  event: string,
): void {
  if (!allowed.includes(session.status)) {
    throw new Error(`Cannot apply ${event} while sub-agent edit session is ${session.status}.`)
  }
}

export function createSubAgentEditSession<T>(baseline: T): SubAgentEditSession<T> {
  return { status: "closed", baseline: clone(baseline), working: clone(baseline) }
}

export function openSubAgentEditSession<T>(session: SubAgentEditSession<T>): SubAgentEditSession<T> {
  expectStatus(session, ["closed", "cancelled", "saved", "failed", "editing"], "open")
  return { status: "editing", baseline: clone(session.baseline), working: clone(session.baseline) }
}

export function changeSubAgentEditSession<T>(
  session: SubAgentEditSession<T>,
  working: T,
): SubAgentEditSession<T> {
  expectStatus(session, ["editing", "failed"], "change")
  return { ...session, status: "editing", working: clone(working) }
}

export function cancelSubAgentEditSession<T>(session: SubAgentEditSession<T>): SubAgentEditSession<T> {
  expectStatus(session, ["editing", "failed"], "cancel")
  return { status: "cancelled", baseline: clone(session.baseline), working: clone(session.baseline) }
}

export function beginSubAgentEditSave<T>(session: SubAgentEditSession<T>): SubAgentEditSession<T> {
  expectStatus(session, ["editing", "failed"], "save")
  return { ...session, status: "saving" }
}

export function completeSubAgentEditSave<T>(session: SubAgentEditSession<T>): SubAgentEditSession<T> {
  expectStatus(session, ["saving"], "save_succeeded")
  return { status: "saved", baseline: clone(session.working), working: clone(session.working) }
}

export function failSubAgentEditSave<T>(session: SubAgentEditSession<T>): SubAgentEditSession<T> {
  expectStatus(session, ["saving"], "save_failed")
  return { ...session, status: "failed" }
}

export function restoreSubAgentEditFocus(
  primary: FocusTarget | null,
  fallback: FocusTarget | null,
  schedule: (callback: () => void) => void = (callback) => {
    globalThis.setTimeout(callback, 0)
  },
): void {
  schedule(() => {
    if (primary?.isConnected) primary.focus()
    else if (fallback?.isConnected) fallback.focus()
  })
}
