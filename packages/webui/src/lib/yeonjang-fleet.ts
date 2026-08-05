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

export function describeYeonjangSupportProfile(
  instance: Pick<YeonjangProjectedInstance, "supportProfile">,
  text: TextFn,
): string {
  switch (instance.supportProfile) {
    case "desktop_interactive":
      return text("화면 조작 가능", "Screen control available")
    case "desktop_limited":
      return text("일부 기능 제한", "Some features limited")
    case "headless_managed":
      return text("백그라운드 관리 전용", "Background management only")
    default:
      return text("지원 방식 확인 필요", "Support mode needs review")
  }
}

export function describeYeonjangReasonCode(code: string, text: TextFn): string {
  switch (code) {
    case "single_trusted_local_interactive":
      return text("신뢰된 이 컴퓨터의 연장을 자동 선택합니다.", "A trusted extension on this computer is selected automatically.")
    case "multiple_trusted_local_candidates":
      return text("신뢰된 이 컴퓨터의 연장이 여러 개라서 직접 선택해야 합니다.", "Multiple trusted extensions on this computer are available, so you must choose one.")
    case "multiple_local_candidates":
      return text("이 컴퓨터에서 쓸 수 있는 연장이 여러 개라서 자동 선택을 중단했습니다.", "Multiple extensions on this computer are available, so automatic selection is blocked.")
    case "local_profile_not_interactive":
      return text("이 컴퓨터의 연장이 화면 조작을 지원하지 않아 직접 선택이 필요합니다.", "The extension on this computer does not support screen control, so direct selection is required.")
    case "local_not_trusted":
      return text("이 컴퓨터의 연장을 신뢰된 내 기기로 확정하지 못했습니다.", "The extension on this computer could not be confirmed as a trusted device.")
    case "pinned_default_remote_instance":
      return text("고정한 원격 연장을 기본 대상으로 사용합니다.", "The pinned remote extension is used as the default target.")
    case "pinned_remote_unavailable":
      return text("고정한 원격 연장이 현재 사용할 수 없습니다.", "The pinned remote extension is not currently available.")
    case "remote_only_requires_explicit_selection":
      return text("현재 원격 컴퓨터의 연장만 연결되어 직접 선택해야 합니다.", "Only extensions on remote computers are online, so direct selection is required.")
    case "no_online_target_candidate":
      return text("현재 연결된 연장이 없어 실행 대상을 선택할 수 없습니다.", "There is no connected extension available right now.")
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
      return text("최근 연결 신호 차이", "Connection freshness mismatch")
    case "latency_unavailable":
      return text("지연 시간 정보 없음", "Latency unavailable")
    case "missing_capability_on_remote":
      return text("원격 컴퓨터에 없는 기능이 있습니다.", "Some features are missing on the remote computer.")
    case "missing_capability_on_local":
      return text("이 컴퓨터에 없는 기능이 있습니다.", "Some features are missing on this computer.")
    case "update_required":
      return text("업데이트가 필요합니다.", "An update is required.")
    case "matched_gateway_host_fingerprint":
      return text("현재 실행 중인 연장과 일치하는 내 기기입니다.", "This device matches the currently running extension.")
    case "matched_gateway_default_node":
      return text("기본 로컬 연장으로 확인되었습니다.", "Confirmed as the default local extension.")
    case "gateway_host_mismatch":
      return text("현재 실행 중인 연장과 다른 컴퓨터입니다.", "This computer does not match the currently running extension.")
    default:
      return text("추가 상태 확인 필요", "Additional state needs review")
  }
}

export function describeYeonjangDefaultTargetSelection(
  selection: YeonjangDefaultTargetSelection,
  text: TextFn,
): string {
  switch (selection.status) {
    case "auto_selected_local_interactive":
      return text("대상을 따로 지정하지 않으면 이 컴퓨터의 화면 조작 연장을 자동 사용합니다.", "If no target is specified, the screen-control extension on this computer is selected automatically.")
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
  const count = instance.supportedMethods.length || instance.methodCount
  if (count <= 0) {
    return text("지원 기능 정보 없음", "Supported feature information unavailable")
  }
  return text(`지원 기능 ${count}개`, `${count} supported features`)
}

export function buildYeonjangTargetPickerPlacements(text: TextFn): YeonjangTargetPickerPlacement[] {
  return [
    {
      id: "chat_composer",
      label: text("채팅 작성창", "Chat composer"),
      description: text("원격 컴퓨터의 연장만 연결되어 있을 때는 메시지를 보내기 전에 사용할 연장을 고릅니다.", "When only extensions on remote computers are online, choose which extension to use before sending the message."),
    },
    {
      id: "advanced_run_panel",
      label: text("실행 전 확인 패널", "Pre-run review panel"),
      description: text("실행하기 전에 사용할 연장을 확인하고 바꿀 수 있어야 합니다.", "You should be able to review and change the extension before execution."),
    },
    {
      id: "admin_control_panel",
      label: text("관리 화면", "Management screen"),
      description: text("연결 끊김, 신뢰 차단, 대상 불명확 상태를 실행 기록과 함께 확인합니다.", "Show disconnected, trust-blocked, and ambiguous target states with execution history."),
    },
  ]
}
