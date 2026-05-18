import type {
  UiMode,
  YeonjangDefaultTargetSelection,
  YeonjangFleetResponse,
  YeonjangLocalRemoteDiffSummary,
  YeonjangProjectedInstance,
} from "../api/client"

type TextFn = (ko: string, en: string) => string

export type YeonjangFleetVisibility = "summary" | "fleet"
export type YeonjangFleetFilter = "all" | "online" | "local" | "remote"

export interface YeonjangTargetPickerPlacement {
  id: "chat_composer" | "advanced_run_panel" | "admin_control_panel"
  label: string
  description: string
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "ko")
}

export function resolveYeonjangFleetVisibility(mode: UiMode): YeonjangFleetVisibility {
  return mode === "beginner" ? "summary" : "fleet"
}

export function sortYeonjangFleetInstances(
  instances: readonly YeonjangProjectedInstance[],
): YeonjangProjectedInstance[] {
  return [...instances].sort((left, right) => {
    const leftLocationWeight = left.location === "local" ? 0 : 1
    const rightLocationWeight = right.location === "local" ? 0 : 1
    if (leftLocationWeight !== rightLocationWeight) return leftLocationWeight - rightLocationWeight

    const leftStateWeight = left.state === "online" ? 0 : 1
    const rightStateWeight = right.state === "online" ? 0 : 1
    if (leftStateWeight !== rightStateWeight) return leftStateWeight - rightStateWeight

    const leftEligibilityWeight = left.defaultTargetEligible ? 0 : 1
    const rightEligibilityWeight = right.defaultTargetEligible ? 0 : 1
    if (leftEligibilityWeight !== rightEligibilityWeight) {
      return leftEligibilityWeight - rightEligibilityWeight
    }

    const leftName = left.instanceAlias.trim() || left.displayName.trim() || left.nodeId
    const rightName = right.instanceAlias.trim() || right.displayName.trim() || right.nodeId
    return compareText(leftName, rightName)
  })
}

export function filterYeonjangFleetInstances(
  instances: readonly YeonjangProjectedInstance[],
  filter: YeonjangFleetFilter,
): YeonjangProjectedInstance[] {
  switch (filter) {
    case "online":
      return instances.filter((instance) => instance.state === "online")
    case "local":
      return instances.filter((instance) => instance.location === "local")
    case "remote":
      return instances.filter((instance) => instance.location === "remote")
    default:
      return [...instances]
  }
}

export function resolveYeonjangCurrentDevice(
  fleet: YeonjangFleetResponse | null,
): YeonjangProjectedInstance | null {
  if (!fleet) return null
  return sortYeonjangFleetInstances(fleet.instances).find((instance) => instance.location === "local")
    ?? sortYeonjangFleetInstances(fleet.instances)[0]
    ?? null
}

export function resolveInspectableYeonjangInstance(
  fleet: YeonjangFleetResponse | null,
  selectedInstanceId?: string | null,
): YeonjangProjectedInstance | null {
  if (!fleet) return null
  if (selectedInstanceId) {
    const matched = fleet.instances.find((instance) => instance.instanceId === selectedInstanceId)
    if (matched) return matched
  }
  if (fleet.defaultTarget.instanceId) {
    const matchedDefault = fleet.instances.find(
      (instance) => instance.instanceId === fleet.defaultTarget.instanceId,
    )
    if (matchedDefault) return matchedDefault
  }
  return resolveYeonjangCurrentDevice(fleet)
}

export function resolveYeonjangDiffSummary(
  fleet: YeonjangFleetResponse | null,
  selected: YeonjangProjectedInstance | null,
): YeonjangLocalRemoteDiffSummary | null {
  if (!fleet || !selected) return null
  if (selected.location === "remote") {
    return fleet.diffSummaries.find((item) => item.remoteInstanceId === selected.instanceId) ?? null
  }
  return fleet.diffSummaries.find((item) => item.localInstanceId === selected.instanceId) ?? fleet.diffSummaries[0] ?? null
}

export function formatYeonjangRelativeAge(
  value: number | null | undefined,
  text: TextFn,
): string {
  if (value == null) return text("수신 없음", "No heartbeat")
  if (value < 1_000) return text("방금 전", "Just now")
  if (value < 60_000) return text(`${Math.floor(value / 1_000)}초 전`, `${Math.floor(value / 1_000)}s ago`)
  if (value < 3_600_000) return text(`${Math.floor(value / 60_000)}분 전`, `${Math.floor(value / 60_000)}m ago`)
  return text(`${Math.floor(value / 3_600_000)}시간 전`, `${Math.floor(value / 3_600_000)}h ago`)
}

export function describeYeonjangState(
  instance: Pick<YeonjangProjectedInstance, "state">,
  text: TextFn,
): string {
  switch (instance.state) {
    case "online":
      return text("온라인", "Online")
    case "offline":
      return text("오프라인", "Offline")
    case "degraded":
      return text("저하", "Degraded")
    case "permission_required":
      return text("OS 승인 필요", "OS approval required")
    case "update_required":
      return text("업데이트 필요", "Update required")
    case "discovered":
      return text("발견됨", "Discovered")
  }
}

export function describeYeonjangPermissionState(
  instance: Pick<YeonjangProjectedInstance, "state">,
  text: TextFn,
): string {
  if (instance.state === "permission_required") {
    return text("운영체제 승인 필요", "OS approval required")
  }
  return text("사용 가능", "Available")
}

export function describeYeonjangReasonCode(code: string, text: TextFn): string {
  switch (code) {
    case "single_trusted_local_interactive":
      return text("신뢰 가능한 로컬 interactive 연장을 자동 선택합니다.", "A trusted local interactive extension is selected automatically.")
    case "multiple_trusted_local_candidates":
      return text("신뢰 가능한 로컬 연장이 여러 개라서 직접 선택해야 합니다.", "Multiple trusted local extensions are available, so you must choose one.")
    case "multiple_local_candidates":
      return text("로컬 후보가 여러 개라서 자동 선택을 중단했습니다.", "Multiple local candidates are available, so automatic selection is blocked.")
    case "local_profile_not_interactive":
      return text("로컬 연장이 interactive desktop을 지원하지 않아 직접 선택이 필요합니다.", "The local extension does not support an interactive desktop, so explicit selection is required.")
    case "local_not_trusted":
      return text("로컬 연장을 신뢰 가능한 내 기기로 확정하지 못했습니다.", "The local extension could not be confirmed as a trusted local device.")
    case "pinned_default_remote_instance":
      return text("고정한 원격 연장을 기본 대상으로 사용합니다.", "The pinned remote extension is used as the default target.")
    case "pinned_remote_unavailable":
      return text("고정한 원격 연장이 현재 사용할 수 없습니다.", "The pinned remote extension is not currently available.")
    case "remote_only_requires_explicit_selection":
      return text("원격 연장만 online 상태라서 명시적으로 지정해야 합니다.", "Only remote extensions are online, so an explicit target is required.")
    case "no_online_target_candidate":
      return text("현재 online 대상이 없어 실행 대상을 선택할 수 없습니다.", "There is no online target available right now.")
    case "version_mismatch":
      return text("버전 차이", "Version mismatch")
    case "protocol_version_mismatch":
      return text("프로토콜 차이", "Protocol mismatch")
    case "permission_state_mismatch":
      return text("권한 상태 차이", "Permission mismatch")
    case "build_target_mismatch":
      return text("빌드 타깃 차이", "Build target mismatch")
    case "platform_mismatch":
      return text("플랫폼 차이", "Platform mismatch")
    case "heartbeat_age_mismatch":
      return text("최근 heartbeat 차이", "Heartbeat freshness mismatch")
    case "latency_unavailable":
      return text("지연 시간 정보 없음", "Latency unavailable")
    case "missing_capability_on_remote":
      return text("원격에 없는 기능이 있습니다.", "Some capabilities are missing on the remote instance.")
    case "missing_capability_on_local":
      return text("로컬에 없는 기능이 있습니다.", "Some capabilities are missing on the local instance.")
    case "update_required":
      return text("업데이트가 필요합니다.", "An update is required.")
    case "matched_gateway_host_fingerprint":
      return text("현재 게이트웨이와 일치하는 내 기기입니다.", "This device matches the current gateway fingerprint.")
    case "matched_gateway_default_node":
      return text("기본 로컬 노드로 관찰되었습니다.", "Observed as the default local node.")
    case "gateway_host_mismatch":
      return text("현재 게이트웨이와 다른 인스턴스입니다.", "This instance does not match the current gateway host.")
    default:
      return code.replace(/_/g, " ")
  }
}

export function describeYeonjangDefaultTargetSelection(
  selection: YeonjangDefaultTargetSelection,
  text: TextFn,
): string {
  switch (selection.status) {
    case "auto_selected_local_interactive":
      return text("대상을 따로 지정하지 않으면 로컬 interactive 연장을 자동 사용합니다.", "If no target is specified, the local interactive extension is selected automatically.")
    case "auto_selected_pinned_remote":
      return text("대상을 따로 지정하지 않으면 고정한 원격 연장을 사용합니다.", "If no target is specified, the pinned remote extension is used.")
    case "ambiguous_state":
      return text("자동으로 하나를 고를 수 없어서 직접 선택이 필요합니다.", "Automatic selection is blocked, so you need to choose a target.")
    case "selection_required":
      return text("현재 상태로는 명시적인 대상 지정이 필요합니다.", "The current state requires an explicit target selection.")
  }
}

export function describeYeonjangSelectionAction(
  selection: YeonjangDefaultTargetSelection,
  text: TextFn,
): string {
  switch (selection.uiAction) {
    case "ui_selection":
      return text("대상 후보에서 하나를 선택하세요.", "Choose one of the available targets.")
    case "ask_user":
      return text("실행 전에 어떤 연장을 쓸지 다시 물어야 합니다.", "The UI should ask which extension to use before execution.")
    default:
      return text("추가 선택이 필요하지 않습니다.", "No additional selection is required.")
  }
}

export function summarizeYeonjangCapabilities(
  instance: Pick<YeonjangProjectedInstance, "supportedMethods" | "methodCount">,
  text: TextFn,
): string {
  const preview = instance.supportedMethods.slice(0, 3).join(", ")
  const count = instance.supportedMethods.length || instance.methodCount
  if (!preview) return text(`기능 ${count}개`, `${count} capabilities`)
  return text(`기능 ${count}개 · ${preview}`, `${count} capabilities · ${preview}`)
}

export function buildYeonjangTargetPickerPlacements(text: TextFn): YeonjangTargetPickerPlacement[] {
  return [
    {
      id: "chat_composer",
      label: text("채팅 작성창", "Chat composer"),
      description: text("원격 연장만 online일 때는 메시지 작성 단계에서 명시 대상을 고릅니다.", "When only remote extensions are online, choose the explicit target in the composer."),
    },
    {
      id: "advanced_run_panel",
      label: text("고급 실행 패널", "Advanced run panel"),
      description: text("운영자는 실행 전에 대상을 확인하고 바꿀 수 있어야 합니다.", "Operators should be able to inspect and change the target before execution."),
    },
    {
      id: "admin_control_panel",
      label: text("관리 제어면", "Admin control panel"),
      description: text("stale, trust blocked, ambiguity 상태를 receipt와 함께 확인합니다.", "Show stale, trust-blocked, and ambiguous receipts in the admin control surface."),
    },
  ]
}
