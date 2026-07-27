import type { SkillBindingRequest, SkillDeleteRequest, SkillUpdateRequest } from "../contracts/skills"

export type SkillDetailState = "viewing" | "editing" | "saving" | "failed"
export interface SkillDetailDraft { displayName: string; description: string }
export interface SkillDetailFlow { state: SkillDetailState; draft: SkillDetailDraft; reasonCode: string | null }
export type SkillDetailEvent =
  | { type: "edit" }
  | { type: "draft_changed"; patch: Partial<SkillDetailDraft> }
  | { type: "save" }
  | { type: "save_succeeded"; projection: SkillDetailDraft }
  | { type: "save_failed"; reasonCode: string }
  | { type: "cancel"; projection: SkillDetailDraft }

export function initialSkillDetailFlow(projection: SkillDetailDraft): SkillDetailFlow {
  return { state: "viewing", draft: { ...projection }, reasonCode: null }
}

export function reduceSkillDetailFlow(current: SkillDetailFlow, event: SkillDetailEvent): SkillDetailFlow {
  if (event.type === "edit" && ["viewing", "failed"].includes(current.state)) return { ...current, state: "editing", reasonCode: null }
  if (event.type === "draft_changed" && ["editing", "failed"].includes(current.state)) return { state: "editing", draft: { ...current.draft, ...event.patch }, reasonCode: null }
  if (event.type === "save" && ["editing", "viewing", "failed"].includes(current.state)) return { ...current, state: "saving", reasonCode: null }
  if (event.type === "save_succeeded" && current.state === "saving") return initialSkillDetailFlow(event.projection)
  if (event.type === "save_failed" && current.state === "saving") return { ...current, state: "failed", reasonCode: event.reasonCode }
  if (event.type === "cancel" && ["editing", "failed"].includes(current.state)) return initialSkillDetailFlow(event.projection)
  throw new Error("skill_detail_transition_invalid")
}

export function createSkillUpdateRequest(input: { change: SkillUpdateRequest["change"]; revision: number; now: number; randomId: () => string }): SkillUpdateRequest {
  return {
    envelope: { scope: "capability:write", mutationId: input.randomId(), targetRevision: input.revision + 1, purpose: "skill_update", issuedAt: input.now, nonce: input.randomId() },
    change: input.change,
  }
}

export type SkillBindingFlowState = "viewing" | "editing" | "saving" | "failed"
export interface SkillBindingFlow { state: SkillBindingFlowState; persistedBoundAgentRefs: string[]; draftBoundAgentRefs: string[]; reasonCode: string | null }
export type SkillBindingFlowEvent = { type: "edit" } | { type: "toggle"; agentRef: string } | { type: "save" } | { type: "saved"; boundAgentRefs: string[] } | { type: "failed"; reasonCode: string } | { type: "cancel" }

const sortedRefs = (refs: readonly string[]) => [...new Set(refs)].sort((left, right) => left.localeCompare(right))
export function initialSkillBindingFlow(boundAgentRefs: readonly string[]): SkillBindingFlow { const refs = sortedRefs(boundAgentRefs); return { state: "viewing", persistedBoundAgentRefs: refs, draftBoundAgentRefs: refs, reasonCode: null } }
export function reduceSkillBindingFlow(current: SkillBindingFlow, event: SkillBindingFlowEvent): SkillBindingFlow {
  if (event.type === "edit" && ["viewing", "failed"].includes(current.state)) return { ...current, state: "editing", reasonCode: null }
  if (event.type === "toggle" && current.state === "editing") return { ...current, draftBoundAgentRefs: current.draftBoundAgentRefs.includes(event.agentRef) ? current.draftBoundAgentRefs.filter((ref) => ref !== event.agentRef) : sortedRefs([...current.draftBoundAgentRefs, event.agentRef]) }
  if (event.type === "save" && current.state === "editing") return { ...current, state: "saving", reasonCode: null }
  if (event.type === "saved" && current.state === "saving") return initialSkillBindingFlow(event.boundAgentRefs)
  if (event.type === "failed" && current.state === "saving") return { ...current, state: "failed", reasonCode: event.reasonCode }
  if (event.type === "cancel" && ["editing", "failed"].includes(current.state)) return initialSkillBindingFlow(current.persistedBoundAgentRefs)
  throw new Error("skill_binding_transition_invalid")
}

function mutationEnvelope(input: { revision: number; now: number; randomId: () => string; purpose: SkillBindingRequest["envelope"]["purpose"] | "skill_delete" }) {
  return { scope: "capability:write" as const, mutationId: input.randomId(), targetRevision: input.revision + 1, purpose: input.purpose, issuedAt: input.now, nonce: input.randomId() }
}
export function createSkillBindingRequest(input: { bound: boolean; revision: number; now: number; randomId: () => string }): SkillBindingRequest { return { envelope: mutationEnvelope({ ...input, purpose: input.bound ? "skill_bind" : "skill_unbind" }), bound: input.bound } }
export function createSkillDeleteRequest(input: { revision: number; now: number; randomId: () => string }): SkillDeleteRequest { return { envelope: mutationEnvelope({ ...input, purpose: "skill_delete" }) as SkillDeleteRequest["envelope"] } }
