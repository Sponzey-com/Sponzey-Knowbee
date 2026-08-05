import React, { useEffect, useMemo, useState } from "react"
import type {
  UiMode,
  YeonjangFleetResponse,
  YeonjangGovernanceEvent,
  YeonjangProjectedInstance,
} from "../../api/client"
import {
  buildYeonjangTargetPickerPlacements,
  describeYeonjangDefaultTargetSelection,
  describeYeonjangPermissionState,
  describeYeonjangReasonCode,
  describeYeonjangSelectionAction,
  describeYeonjangState,
  describeYeonjangSupportProfile,
  filterYeonjangFleetInstances,
  formatYeonjangRelativeAge,
  resolveInspectableYeonjangInstance,
  resolveYeonjangCurrentDevice,
  resolveYeonjangDiffSummary,
  resolveYeonjangFleetVisibility,
  sortYeonjangFleetInstances,
  summarizeYeonjangCapabilities,
  type YeonjangFleetFilter,
} from "../../lib/yeonjang-fleet"
import { useUiI18n } from "../../lib/ui-i18n"

function badgeToneClass(tone: "stone" | "emerald" | "amber" | "rose" | "sky") {
  switch (tone) {
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-800"
    case "rose":
      return "border-rose-200 bg-rose-50 text-rose-700"
    case "sky":
      return "border-sky-200 bg-sky-50 text-sky-700"
    default:
      return "border-stone-200 bg-stone-100 text-stone-700"
  }
}

function stateTone(instance: Pick<YeonjangProjectedInstance, "state">): "stone" | "emerald" | "amber" | "rose" {
  switch (instance.state) {
    case "online":
      return "emerald"
    case "permission_required":
    case "update_required":
    case "degraded":
      return "amber"
    case "offline":
      return "rose"
    default:
      return "stone"
  }
}

function locationTone(instance: Pick<YeonjangProjectedInstance, "location">): "sky" | "stone" {
  return instance.location === "local" ? "sky" : "stone"
}

function trustStateDisplayLabel(
  state: string,
  text: ReturnType<typeof useUiI18n>["text"],
): string {
  if (state === "trusted") return text("신뢰됨", "Trusted")
  if (state === "pending") return text("검토 중", "Pending")
  if (state === "revoked") return text("차단됨", "Revoked")
  if (state === "quarantined") return text("격리됨", "Quarantined")
  return text("상태 확인 필요", "State needs review")
}

function differenceDisplayLabel(
  different: boolean,
  text: ReturnType<typeof useUiI18n>["text"],
): string {
  return different ? text("다름", "Different") : text("같음", "Same")
}

function summarizeYeonjangCapabilityDifference(
  count: number,
  location: "local" | "remote",
  text: ReturnType<typeof useUiI18n>["text"],
): string {
  if (location === "local") {
    return text(`이 컴퓨터에서만 가능한 기능 ${count}개`, `${count} features only on this computer`)
  }
  return text(`원격 컴퓨터에서만 가능한 기능 ${count}개`, `${count} features only on the remote computer`)
}

function describeYeonjangGovernanceAction(
  action: string,
  text: ReturnType<typeof useUiI18n>["text"],
): string {
  switch (action) {
    case "yeonjang_pairing_approved":
      return text("연결 승인", "Connection approved")
    case "yeonjang_trust_updated":
      return text("신뢰 상태 변경", "Trust state changed")
    case "yeonjang_instance_renamed":
      return text("연장 이름 변경", "Extension name changed")
    case "yeonjang_local_marker_assigned":
      return text("로컬 기준 변경", "Local baseline changed")
    case "yeonjang_remote_execution_approved":
      return text("원격 실행 승인", "Remote execution approved")
    case "yeonjang_broadcast_execution_approved":
      return text("전체 실행 승인", "Broadcast execution approved")
    default:
      return text("연장 관리 작업", "Extension management action")
  }
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
        active
          ? "border-stone-900 bg-stone-900 text-white"
          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
      }`}
    >
      {label}
    </button>
  )
}

function SummaryMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-stone-900">{value}</div>
    </div>
  )
}

function yeonjangInstanceTitle(
  instance: Pick<YeonjangProjectedInstance, "instanceAlias" | "displayName">,
  text: ReturnType<typeof useUiI18n>["text"],
): string {
  return instance.instanceAlias || instance.displayName || text("이름 없는 연장", "Unnamed Yeonjang")
}

function yeonjangInstanceSubtitle(
  instance: Pick<YeonjangProjectedInstance, "displayName" | "instanceAlias" | "location">,
  text: ReturnType<typeof useUiI18n>["text"],
  displayText: ReturnType<typeof useUiI18n>["displayText"],
): string {
  if (instance.displayName && instance.displayName !== instance.instanceAlias) {
    return displayText(instance.displayName)
  }
  return instance.location === "local"
    ? text("이 컴퓨터의 연장", "Yeonjang on this computer")
    : text("원격 컴퓨터의 연장", "Yeonjang on a remote computer")
}

function InstanceInspector({
  instance,
  fleet,
  actionPending,
  actionError,
  actionMessage,
  onApprovePairing,
  onUpdateTrust,
  onRenameInstance,
  onAssignLocalMarker,
}: {
  instance: YeonjangProjectedInstance | null
  fleet: YeonjangFleetResponse | null
  actionPending: boolean
  actionError: string
  actionMessage: string
  onApprovePairing: (payload: {
    instanceId: string
    pairingSecret: string
    ownerUserId?: string
    workspaceScopeId?: string
    reason?: string
  }) => void
  onUpdateTrust: (payload: {
    instanceId: string
    trustState: "pending" | "trusted" | "revoked" | "quarantined"
    reason?: string
  }) => void
  onRenameInstance: (payload: {
    instanceId: string
    instanceAlias?: string
    displayName?: string
    reason?: string
  }) => void
  onAssignLocalMarker: (payload: {
    instanceId: string
    reason?: string
  }) => void
}) {
  const { text, displayText, formatDateTime } = useUiI18n()
  const diff = resolveYeonjangDiffSummary(fleet, instance)
  const [pairingSecret, setPairingSecret] = useState("")
  const [ownerUserId, setOwnerUserId] = useState("")
  const [workspaceScopeId, setWorkspaceScopeId] = useState("")
  const [instanceAlias, setInstanceAlias] = useState("")
  const [displayName, setDisplayName] = useState("")

  useEffect(() => {
    setPairingSecret("")
    setOwnerUserId("")
    setWorkspaceScopeId("")
    setInstanceAlias(instance?.instanceAlias ?? "")
    setDisplayName(instance?.displayName ?? "")
  }, [instance?.instanceId, instance?.instanceAlias, instance?.displayName])

  if (!instance) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
        {text("선택한 연장이 없습니다.", "No extension selected.")}
      </div>
    )
  }

  const instanceTitle = yeonjangInstanceTitle(instance, text)
  const instanceSubtitle = yeonjangInstanceSubtitle(instance, text, displayText)
  const instanceSessionConnected = Boolean(instance.session?.sessionId)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-stone-900">
              {instanceTitle}
            </div>
            <div className="mt-1 text-xs text-stone-500">
              {instanceSubtitle}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeToneClass(stateTone(instance))}`}>
              {describeYeonjangState(instance, text)}
            </span>
            <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeToneClass(locationTone(instance))}`}>
              {instance.location === "local" ? text("로컬", "Local") : text("원격", "Remote")}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SummaryMetric label={text("연장 이름", "Extension name")} value={instanceTitle} />
          <SummaryMetric
            label={text("연결 세션", "Connection session")}
            value={instanceSessionConnected ? text("연결됨", "Connected") : text("없음", "None")}
          />
          <SummaryMetric
            label={text("OS / 지원 방식", "OS / support mode")}
            value={[instance.platform ?? "-", instance.arch ?? "-", describeYeonjangSupportProfile(instance, text)].join(" / ")}
          />
          <SummaryMetric label={text("권한 상태", "Permission state")} value={describeYeonjangPermissionState(instance, text)} />
          <SummaryMetric label={text("신뢰 상태", "Trust state")} value={trustStateDisplayLabel(instance.trustState, text)} />
          <SummaryMetric
            label={text("최근 연결 신호", "Recent heartbeat")}
            value={formatYeonjangRelativeAge(instance.lastHeartbeatAgeMs, text)}
          />
          <SummaryMetric label={text("지원 기능 요약", "Supported feature summary")} value={summarizeYeonjangCapabilities(instance, text)} />
          <SummaryMetric
            label={text("마지막 확인", "Last seen")}
            value={formatDateTime(instance.lastSeenAt)}
          />
        </div>

        {instance.stateMessage ? (
          <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
            {displayText(instance.stateMessage)}
          </div>
        ) : null}

        {instance.localityReasonCodes.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {instance.localityReasonCodes.map((code) => (
              <span key={code} className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-700">
                {describeYeonjangReasonCode(code, text)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="text-sm font-semibold text-stone-900">{text("이 컴퓨터와 선택한 컴퓨터 차이", "This computer vs selected computer")}</div>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          {text("선택한 원격 연장과 현재 이 컴퓨터의 연장 차이를 비교합니다.", "Compares the selected remote extension against the extension on this computer.")}
        </p>

        {!diff ? (
          <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
            {text("비교할 차이가 없습니다.", "There is no difference to show.")}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <SummaryMetric
                label={text("버전", "Version")}
                value={`${diff.version.local ?? "-"} / ${diff.version.remote ?? "-"}`}
              />
              <SummaryMetric
                label={text("연동 규격", "Compatibility")}
                value={differenceDisplayLabel(diff.protocolVersion.different, text)}
              />
              <SummaryMetric
                label={text("권한", "Permission")}
                value={differenceDisplayLabel(diff.permissionState.different, text)}
              />
              <SummaryMetric
                label={text("플랫폼", "Platform")}
                value={`${diff.platform.local ?? "-"} / ${diff.platform.remote ?? "-"}`}
              />
            </div>

            {diff.supportedMethods.localOnly.length > 0 || diff.supportedMethods.remoteOnly.length > 0 ? (
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                {diff.supportedMethods.localOnly.length > 0 ? (
                  <div>{summarizeYeonjangCapabilityDifference(diff.supportedMethods.localOnly.length, "local", text)}</div>
                ) : null}
                {diff.supportedMethods.remoteOnly.length > 0 ? (
                  <div className={diff.supportedMethods.localOnly.length > 0 ? "mt-2" : ""}>
                    {summarizeYeonjangCapabilityDifference(diff.supportedMethods.remoteOnly.length, "remote", text)}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {diff.reasonCodes.map((code) => (
                <span key={code} className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-700">
                  {describeYeonjangReasonCode(code, text)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-stone-900">{text("연결 승인과 신뢰", "Connection approval and trust")}</div>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {text("선택한 연장의 연결 승인, 신뢰 상태, 이름, 로컬 기준을 관리합니다.", "Manage connection approval, trust state, naming, and local baseline for the selected extension.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["trusted", "pending", "revoked", "quarantined"] as const).map((trustState) => (
              <button
                key={trustState}
                type="button"
                disabled={actionPending}
                onClick={() => onUpdateTrust({ instanceId: instance.instanceId, trustState, reason: `ui_${trustState}` })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  instance.trustState === trustState
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {trustStateDisplayLabel(trustState, text)}
              </button>
            ))}
          </div>
        </div>

        {actionError ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {displayText(actionError)}
          </div>
        ) : null}
        {actionMessage ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {displayText(actionMessage)}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
              {text("연결 승인", "Connection approval")}
            </div>
            <input
              type="password"
              autoComplete="new-password"
              value={pairingSecret}
              onChange={(event) => setPairingSecret(event.target.value)}
              placeholder={text("연결 승인 코드", "Connection approval code")}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
            <input
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
              placeholder={text("소유 사용자 범위", "Owner user scope")}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
            <input
              value={workspaceScopeId}
              onChange={(event) => setWorkspaceScopeId(event.target.value)}
              placeholder={text("작업 공간 범위", "Workspace scope")}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
            {instance.ownerUserId || instance.workspaceScopeId ? (
              <div className="flex flex-wrap gap-2 text-[11px] text-stone-600">
                {instance.ownerUserId ? (
                  <span className="rounded-full bg-white px-2 py-1 ring-1 ring-stone-200">
                    {text("사용자 범위 기록 있음", "User scope recorded")}
                  </span>
                ) : null}
                {instance.workspaceScopeId ? (
                  <span className="rounded-full bg-white px-2 py-1 ring-1 ring-stone-200">
                    {text("작업 공간 범위 기록 있음", "Workspace scope recorded")}
                  </span>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              disabled={actionPending || pairingSecret.trim().length === 0}
              onClick={() => onApprovePairing({
                instanceId: instance.instanceId,
                pairingSecret,
                ...(ownerUserId.trim() ? { ownerUserId: ownerUserId.trim() } : {}),
                ...(workspaceScopeId.trim() ? { workspaceScopeId: workspaceScopeId.trim() } : {}),
                reason: "ui_pairing_approve",
              })}
              className="rounded-lg border border-stone-900 bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {actionPending ? text("처리 중", "Working") : text("연결 승인", "Approve connection")}
            </button>
          </div>

          <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
              {text("이름과 기준", "Names and baseline")}
            </div>
            <input
              value={instanceAlias}
              onChange={(event) => setInstanceAlias(event.target.value)}
              placeholder={text("연장 이름", "Extension name")}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={text("화면 표시 이름", "Display name")}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={actionPending}
                onClick={() => onRenameInstance({
                  instanceId: instance.instanceId,
                  ...(instanceAlias.trim() ? { instanceAlias: instanceAlias.trim() } : {}),
                  ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
                  reason: "ui_rename",
                })}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {text("이름 저장", "Save names")}
              </button>
              <button
                type="button"
                disabled={actionPending}
                onClick={() => onAssignLocalMarker({
                  instanceId: instance.instanceId,
                  reason: "ui_local_marker",
                })}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {instance.localMarker ? text("현재 로컬 기준", "Current local baseline") : text("이 연장을 로컬 기준으로 지정", "Use this extension as local baseline")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function GovernanceHistory({
  items,
}: {
  items: YeonjangGovernanceEvent[]
}) {
  const { text, formatDateTime } = useUiI18n()

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
        {text("표시할 연장 관리 이력이 없습니다.", "There is no extension management history to show.")}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-stone-900">{describeYeonjangGovernanceAction(item.action, text)}</div>
            <div className="text-xs text-stone-500">{formatDateTime(item.at)}</div>
          </div>
          <div className="mt-1 text-xs text-stone-600">
            {[item.instanceAlias, item.displayName].filter(Boolean).join(" · ") || text("연장 정보 없음", "No extension info")}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-600">
            {item.actor ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-stone-200">{text("처리자 기록 있음", "Actor recorded")}</span> : null}
            {item.trustState ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-stone-200">{trustStateDisplayLabel(item.trustState, text)}</span> : null}
            {item.workspaceScopeId ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-stone-200">{text("작업 범위 연결됨", "Workspace scope linked")}</span> : null}
            {item.reason ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-stone-200">{text("사유 기록 있음", "Reason recorded")}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function YeonjangFleetPanel({
  fleet,
  loading,
  error,
  actionPending,
  actionError,
  actionMessage,
  mode,
  selectedInstanceId,
  onSelectInstance,
  onRefresh,
  onApprovePairing,
  onUpdateTrust,
  onRenameInstance,
  onAssignLocalMarker,
}: {
  fleet: YeonjangFleetResponse | null
  loading: boolean
  error: string
  actionPending: boolean
  actionError: string
  actionMessage: string
  mode: UiMode
  selectedInstanceId: string | null
  onSelectInstance: (instanceId: string) => void
  onRefresh: () => void
  onApprovePairing: (payload: {
    instanceId: string
    pairingSecret: string
    ownerUserId?: string
    workspaceScopeId?: string
    reason?: string
  }) => void
  onUpdateTrust: (payload: {
    instanceId: string
    trustState: "pending" | "trusted" | "revoked" | "quarantined"
    reason?: string
  }) => void
  onRenameInstance: (payload: {
    instanceId: string
    instanceAlias?: string
    displayName?: string
    reason?: string
  }) => void
  onAssignLocalMarker: (payload: {
    instanceId: string
    reason?: string
  }) => void
}) {
  const { text, displayText } = useUiI18n()
  const [filter, setFilter] = useState<YeonjangFleetFilter>("all")
  const visibility = resolveYeonjangFleetVisibility(mode)
  const currentDevice = resolveYeonjangCurrentDevice(fleet)
  const selected = resolveInspectableYeonjangInstance(fleet, selectedInstanceId)
  const placements = buildYeonjangTargetPickerPlacements(text)
  const filteredInstances = useMemo(
    () => sortYeonjangFleetInstances(filterYeonjangFleetInstances(fleet?.instances ?? [], filter)),
    [fleet?.instances, filter],
  )

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">{text("연장 목록", "Extension list")}</h3>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {text("이 컴퓨터와 원격 컴퓨터의 연장, 기본 실행 대상, 직접 선택할 연장을 한 화면에서 봅니다.", "View extensions on this computer and remote computers, the default execution target, and direct selection options in one place.")}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
          >
            {text("새로고침", "Refresh")}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {displayText(error)}
          </div>
        ) : null}

        {loading && !fleet ? (
          <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
            {text("연장 목록 상태를 불러오는 중입니다.", "Loading extension list status.")}
          </div>
        ) : null}

        {!fleet ? null : visibility === "summary" ? (
          <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              {text("현재 연결된 내 기기", "Current device")}
            </div>
             <div className="mt-2 text-sm font-semibold text-stone-900">
               {currentDevice ? yeonjangInstanceTitle(currentDevice, text) : text("없음", "None")}
             </div>
            <div className="mt-1 text-xs leading-5 text-stone-600">
              {currentDevice
                ? `${currentDevice.location === "local" ? text("로컬", "Local") : text("원격", "Remote")} · ${describeYeonjangState(currentDevice, text)}`
                : text("연결된 연장이 없습니다.", "No connected extension.")}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  {text("현재 연결된 내 기기", "Current device")}
                </div>
                 <div className="mt-2 text-sm font-semibold text-stone-900">
                   {currentDevice ? yeonjangInstanceTitle(currentDevice, text) : text("없음", "None")}
                 </div>
                <div className="mt-1 text-xs leading-5 text-stone-600">
                  {currentDevice
                    ? `${currentDevice.location === "local" ? text("로컬", "Local") : text("원격", "Remote")} · ${describeYeonjangState(currentDevice, text)}`
                    : text("연결된 연장이 없습니다.", "No connected extension.")}
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 lg:col-span-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  {text("기본 실행 대상", "Default execution target")}
                </div>
                <div className="mt-2 text-sm font-semibold text-stone-900">
                  {describeYeonjangDefaultTargetSelection(fleet.defaultTarget, text)}
                </div>
                <div className="mt-2 text-xs leading-5 text-stone-600">
                  {describeYeonjangSelectionAction(fleet.defaultTarget, text)}
                </div>
                {fleet.defaultTarget.reasonCodes.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {fleet.defaultTarget.reasonCodes.map((code) => (
                      <span key={code} className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-stone-700 ring-1 ring-stone-200">
                        {describeYeonjangReasonCode(code, text)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                {text("직접 선택 위치", "Direct selection locations")}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {placements.map((placement) => (
                  <div key={placement.id} className="rounded-xl border border-stone-200 bg-white px-3 py-3">
                    <div className="text-sm font-semibold text-stone-900">{placement.label}</div>
                    <div className="mt-1 text-xs leading-5 text-stone-600">{placement.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                {text("직접 선택할 연장", "Extensions available for direct selection")}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {sortYeonjangFleetInstances(fleet.instances).map((instance) => (
                  <button
                    key={instance.instanceId}
                    type="button"
                    onClick={() => onSelectInstance(instance.instanceId)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      selected?.instanceId === instance.instanceId
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    {yeonjangInstanceTitle(instance, text)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {visibility === "summary" ? null : (
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">{text("전체 연장 목록", "Full extension list")}</h3>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                {text("이 컴퓨터와 원격 컴퓨터의 연장을 프로파일, 권한, 최근 상태 기준으로 비교하고 하나를 선택합니다.", "Compare extensions on this computer and remote computers by profile, permissions, and recent state, then inspect one in detail.")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterButton active={filter === "all"} label={text("전체", "All")} onClick={() => setFilter("all")} />
              <FilterButton active={filter === "online"} label={text("온라인", "Online")} onClick={() => setFilter("online")} />
              <FilterButton active={filter === "local"} label={text("로컬", "Local")} onClick={() => setFilter("local")} />
              <FilterButton active={filter === "remote"} label={text("원격", "Remote")} onClick={() => setFilter("remote")} />
            </div>
          </div>

          {!fleet || filteredInstances.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
              {text("표시할 연장이 없습니다.", "There are no extensions to show.")}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="space-y-3">
                <div className="grid grid-cols-[minmax(0,1.4fr)_0.8fr_0.9fr_0.9fr_0.9fr_1fr] gap-2 rounded-xl bg-stone-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                  <div>{text("이름", "Name")}</div>
                  <div>{text("위치", "Location")}</div>
                  <div>{text("지원 방식", "Support mode")}</div>
                  <div>{text("상태", "State")}</div>
                  <div>{text("버전", "Version")}</div>
                  <div>{text("최근 상태", "Last seen")}</div>
                </div>
                {filteredInstances.map((instance) => (
                  <button
                    key={instance.instanceId}
                    type="button"
                    onClick={() => onSelectInstance(instance.instanceId)}
                    className={`grid w-full grid-cols-[minmax(0,1.4fr)_0.8fr_0.9fr_0.9fr_0.9fr_1fr] gap-2 rounded-xl border px-3 py-3 text-left ${
                      selected?.instanceId === instance.instanceId
                        ? "border-stone-900 bg-white shadow-sm"
                        : "border-stone-200 bg-stone-50 hover:border-stone-300"
                    }`}
                  >
                    <div className="min-w-0">
                       <div className="truncate text-sm font-semibold text-stone-900">
                         {yeonjangInstanceTitle(instance, text)}
                       </div>
                       <div className="mt-1 truncate text-xs text-stone-500">
                         {yeonjangInstanceSubtitle(instance, text, displayText)}
                       </div>
                    </div>
                    <div className="text-xs text-stone-700">
                      <span className={`inline-flex rounded-full border px-2 py-1 font-semibold ${badgeToneClass(locationTone(instance))}`}>
                        {instance.location === "local" ? text("로컬", "Local") : text("원격", "Remote")}
                      </span>
                    </div>
                    <div className="text-xs text-stone-700">{describeYeonjangSupportProfile(instance, text)}</div>
                    <div className="text-xs text-stone-700">
                      <span className={`inline-flex rounded-full border px-2 py-1 font-semibold ${badgeToneClass(stateTone(instance))}`}>
                        {describeYeonjangState(instance, text)}
                      </span>
                    </div>
                    <div className="text-xs text-stone-700">{instance.version ?? "-"}</div>
                    <div className="text-xs text-stone-700">{formatYeonjangRelativeAge(instance.lastHeartbeatAgeMs, text)}</div>
                  </button>
                ))}
              </div>
              <InstanceInspector
                instance={selected}
                fleet={fleet}
                actionPending={actionPending}
                actionError={actionError}
                actionMessage={actionMessage}
                onApprovePairing={onApprovePairing}
                onUpdateTrust={onUpdateTrust}
                onRenameInstance={onRenameInstance}
                onAssignLocalMarker={onAssignLocalMarker}
              />
            </div>
          )}
        </section>
      )}

      {visibility === "summary" || !fleet ? null : (
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">{text("연장 관리 이력", "Extension management history")}</h3>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {text("연결 승인, 신뢰 변경, 이름 변경, 로컬 기준, 원격/전체 실행 승인 이력을 최근 순서대로 봅니다.", "Shows recent connection approval, trust changes, rename, local baseline, and remote/broadcast approval events.")}
            </p>
          </div>
          <div className="mt-4">
            <GovernanceHistory items={fleet.governanceHistory} />
          </div>
        </section>
      )}
    </div>
  )
}
