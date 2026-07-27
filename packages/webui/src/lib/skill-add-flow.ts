import type { SkillSourceKind } from "./skill-catalog-contract"

export type SkillAddState = "editing" | "validating" | "ready" | "saving" | "succeeded" | "failed"
export interface SkillAddDraft { displayName: string; description: string; sourceKind: SkillSourceKind; requestedPath?: string }
export interface SkillAddFlow { state: SkillAddState; draft: SkillAddDraft; reasonCodes: string[] }
export type SkillAddEvent =
  | { type: "draft_changed"; patch: Partial<SkillAddDraft> }
  | { type: "validate" }
  | { type: "validation_completed"; ready: boolean; reasonCodes: string[] }
  | { type: "save" }
  | { type: "save_completed"; active: boolean; reasonCode?: string }

export function initialSkillAddFlow(): SkillAddFlow {
  return {
    state: "editing",
    draft: { displayName: "", description: "", sourceKind: "local", requestedPath: "" },
    reasonCodes: [],
  }
}

const REASON_TEXT: Readonly<Record<string, readonly [string, string]>> = {
  skill_name_missing: ["이름을 입력해 주세요.", "Enter a name."],
  skill_name_duplicated: ["이미 사용 중인 이름입니다.", "This name is already in use."],
  skill_path_missing: ["Skill 폴더 경로를 입력해 주세요.", "Enter the Skill folder path."],
  skill_path_null_byte: ["경로에 사용할 수 없는 문자가 있습니다.", "The path contains an invalid character."],
  skill_path_traversal: ["상위 폴더로 이동하는 경로는 사용할 수 없습니다.", "Parent-directory traversal is not allowed."],
  skill_path_not_found: ["해당 폴더를 찾을 수 없습니다.", "The folder could not be found."],
  skill_path_outside_root: ["허용된 작업 폴더 안의 경로를 선택해 주세요.", "Choose a path inside an allowed workspace."],
  skill_symlink_escape: ["허용 범위를 벗어나는 심볼릭 링크는 사용할 수 없습니다.", "A symbolic link cannot leave the allowed workspace."],
  skill_path_unsupported_type: ["폴더 경로를 입력해 주세요.", "Enter a folder path."],
  skill_path_unreadable: ["해당 폴더를 읽을 수 없습니다.", "The folder is not readable."],
  skill_owner_mismatch: ["현재 사용자가 소유한 폴더를 선택해 주세요.", "Choose a folder owned by the current user."],
  skill_manifest_missing: ["선택한 폴더에 SKILL.md가 없습니다.", "The selected folder has no SKILL.md."],
  mutation_revision_conflict: ["목록이 변경되었습니다. 새로고침 후 다시 검사해 주세요.", "The catalog changed. Refresh and validate again."],
  mutation_nonce_replayed: ["저장 요청이 만료되었습니다. 다시 검사해 주세요.", "The save request expired. Validate again."],
  mutation_expired: ["저장 준비 시간이 지났습니다. 다시 검사해 주세요.", "The save request expired. Validate again."],
  mutation_scope_denied: ["이 작업을 저장할 권한이 없습니다.", "You do not have permission to save this Skill."],
  mutation_purpose_denied: ["지원하지 않는 저장 요청입니다.", "This save request is not supported."],
  mutation_field_missing: ["저장 요청이 완전하지 않습니다. 다시 검사해 주세요.", "The save request is incomplete. Validate again."],
  persisted_revision_mismatch: ["저장 중 목록이 변경되었습니다. 다시 검사해 주세요.", "The catalog changed while saving. Validate again."],
  skill_source_validation_failed: ["Skill 폴더를 검사하지 못했습니다. 다시 시도해 주세요.", "Could not validate the Skill folder. Try again."],
  skill_create_failed: ["Skill을 저장하지 못했습니다.", "Could not save the Skill."],
  skill_ref_not_found: ["Skill을 찾을 수 없습니다. 목록을 새로고침해 주세요.", "The Skill was not found. Refresh the catalog."],
  skill_source_change_denied: ["등록 후에는 Skill 출처를 바꿀 수 없습니다.", "A Skill source cannot be changed after registration."],
  skill_update_verify_failed: ["저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.", "Could not verify the saved Skill. Try again."],
  skill_update_rollback_failed: ["이전 상태 복구에 실패했습니다. 상태를 새로고침해 주세요.", "Could not restore the previous state. Refresh the catalog."],
  skill_update_failed: ["Skill 변경을 저장하지 못했습니다.", "Could not save the Skill change."],
  skill_projection_not_verified: ["최신 목록에서 변경 결과를 확인하지 못했습니다.", "The change was not visible in the latest catalog."],
  agent_ref_not_found: ["에이전트를 찾을 수 없습니다. 목록을 새로고침해 주세요.", "The agent was not found. Refresh the catalog."],
  skill_binding_inactive: ["비활성 Skill은 에이전트에 연결할 수 없습니다.", "An inactive Skill cannot be bound to an agent."],
  skill_binding_verify_failed: ["최신 상태에서 에이전트 연결을 확인하지 못했습니다.", "The binding was not visible in the latest state."],
  skill_binding_rollback_failed: ["이전 연결 상태를 복구하지 못했습니다.", "Could not restore the previous binding state."],
  skill_binding_failed: ["에이전트 연결을 저장하지 못했습니다.", "Could not save the agent binding."],
  skill_delete_in_use: ["연결된 에이전트를 먼저 해제해 주세요.", "Remove bound agents before deleting this Skill."],
  skill_delete_not_visible: ["삭제 결과를 최신 목록에서 확인하지 못했습니다.", "The deletion was not visible in the latest catalog."],
  skill_delete_rollback_failed: ["삭제 이전 상태를 복구하지 못했습니다.", "Could not restore the Skill after deletion failed."],
  skill_delete_failed: ["Skill을 삭제하지 못했습니다.", "Could not delete the Skill."],
}

export function skillAddReasonText(reasonCode: string, language: "ko" | "en"): string {
  const entry = REASON_TEXT[reasonCode]
  return entry ? entry[language === "ko" ? 0 : 1] : language === "ko" ? "요청을 완료하지 못했습니다." : "The request could not be completed."
}

export function reduceSkillAddFlow(current: SkillAddFlow, event: SkillAddEvent): SkillAddFlow {
  if (event.type === "draft_changed") return { state: "editing", draft: { ...current.draft, ...event.patch }, reasonCodes: [] }
  if (event.type === "validate" && ["editing", "failed"].includes(current.state)) return { ...current, state: "validating", reasonCodes: [] }
  if (event.type === "validation_completed" && current.state === "validating") return { ...current, state: event.ready ? "ready" : "failed", reasonCodes: event.reasonCodes }
  if (event.type === "save" && current.state === "ready") return { ...current, state: "saving" }
  if (event.type === "save_completed" && current.state === "saving") return { ...current, state: event.active ? "succeeded" : "failed", reasonCodes: event.reasonCode ? [event.reasonCode] : [] }
  throw new Error("skill_add_transition_invalid")
}

export function createSkillMutationRequest(input: { draft: SkillAddDraft; revision: number; now: number; randomId: () => string }) {
  const draft = input.draft.sourceKind === "local" ? input.draft : { displayName: input.draft.displayName, description: input.draft.description, sourceKind: input.draft.sourceKind }
  return { envelope: { scope: "capability:write", mutationId: input.randomId(), targetRevision: input.revision + 1, purpose: "skill_create", issuedAt: input.now, nonce: input.randomId() }, draft }
}
