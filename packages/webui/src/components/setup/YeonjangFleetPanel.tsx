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
    setOwnerUserId(instance?.ownerUserId ?? "")
    setWorkspaceScopeId(instance?.workspaceScopeId ?? "")
    setInstanceAlias(instance?.instanceAlias ?? "")
    setDisplayName(instance?.displayName ?? "")
  }, [instance?.instanceId, instance?.ownerUserId, instance?.workspaceScopeId, instance?.instanceAlias, instance?.displayName])

  if (!instance) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
        {text("선택한 인스턴스가 없습니다.", "No instance selected.")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-stone-900">
              {instance.instanceAlias || instance.displayName || instance.nodeId}
            </div>
            <div className="mt-1 text-xs text-stone-500">
              {instance.displayName !== instance.instanceAlias ? displayText(instance.displayName) : instance.nodeId}
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
          <SummaryMetric label={text("인스턴스 ID", "Instance ID")} value={instance.instanceId} />
          <SummaryMetric label={text("세션 ID", "Session ID")} value={instance.session?.sessionId ?? text("없음", "None")} />
          <SummaryMetric
            label={text("OS / 프로파일", "OS / profile")}
            value={[instance.platform ?? "-", instance.arch ?? "-", instance.supportProfile].join(" / ")}
          />
          <SummaryMetric label={text("권한 상태", "Permission state")} value={describeYeonjangPermissionState(instance, text)} />
          <SummaryMetric label={text("Trust 상태", "Trust state")} value={instance.trustState} />
          <SummaryMetric
            label={text("Heartbeat", "Heartbeat")}
            value={formatYeonjangRelativeAge(instance.lastHeartbeatAgeMs, text)}
          />
          <SummaryMetric label={text("기능 요약", "Capability summary")} value={summarizeYeonjangCapabilities(instance, text)} />
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
        <div className="text-sm font-semibold text-stone-900">{text("로컬 대비 차이", "Local vs remote diff")}</div>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          {text("선택한 원격 인스턴스와 현재 로컬 기준 차이를 비교합니다.", "Compares the selected remote instance against the current local baseline.")}
        </p>

        {!diff ? (
          <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
            {text("비교할 local/remote 차이가 없습니다.", "There is no local/remote diff to show.")}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <SummaryMetric
                label={text("버전", "Version")}
                value={`${diff.version.local ?? "-"} / ${diff.version.remote ?? "-"}`}
              />
              <SummaryMetric
                label={text("프로토콜", "Protocol")}
                value={`${diff.protocolVersion.local ?? "-"} / ${diff.protocolVersion.remote ?? "-"}`}
              />
              <SummaryMetric
                label={text("권한", "Permission")}
                value={`${diff.permissionState.local} / ${diff.permissionState.remote}`}
              />
              <SummaryMetric
                label={text("플랫폼", "Platform")}
                value={`${diff.platform.local ?? "-"} / ${diff.platform.remote ?? "-"}`}
              />
            </div>

            {diff.supportedMethods.localOnly.length > 0 || diff.supportedMethods.remoteOnly.length > 0 ? (
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                {diff.supportedMethods.localOnly.length > 0 ? (
                  <div>{text("로컬 전용 기능", "Local-only methods")}: {diff.supportedMethods.localOnly.join(", ")}</div>
                ) : null}
                {diff.supportedMethods.remoteOnly.length > 0 ? (
                  <div className={diff.supportedMethods.localOnly.length > 0 ? "mt-2" : ""}>
                    {text("원격 전용 기능", "Remote-only methods")}: {diff.supportedMethods.remoteOnly.join(", ")}
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
            <div className="text-sm font-semibold text-stone-900">{text("신뢰와 Pairing", "Trust and pairing")}</div>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {text("선택한 인스턴스의 pairing 승인, trust 상태, 이름, local marker를 관리합니다.", "Manage pairing approval, trust state, naming, and local marker for the selected instance.")}
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
                {trustState}
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
              {text("Pairing 승인", "Pairing approval")}
            </div>
            <input
              value={pairingSecret}
              onChange={(event) => setPairingSecret(event.target.value)}
              placeholder={text("Pairing secret", "Pairing secret")}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
            <input
              value={ownerUserId}
              onChange={(event) => setOwnerUserId(event.target.value)}
              placeholder={text("Owner user ID", "Owner user ID")}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
            <input
              value={workspaceScopeId}
              onChange={(event) => setWorkspaceScopeId(event.target.value)}
              placeholder={text("Workspace scope ID", "Workspace scope ID")}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
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
              {actionPending ? text("처리 중", "Working") : text("Pairing 승인", "Approve pairing")}
            </button>
          </div>

          <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
              {text("이름과 기준", "Names and baseline")}
            </div>
            <input
              value={instanceAlias}
              onChange={(event) => setInstanceAlias(event.target.value)}
              placeholder={text("Instance alias", "Instance alias")}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
            />
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={text("Display name", "Display name")}
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
                {instance.localMarker ? text("현재 local marker", "Current local marker") : text("이 인스턴스를 local marker로 지정", "Make local marker")}
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
  const { text, formatDateTime, displayText } = useUiI18n()

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
        {text("표시할 governance 이력이 없습니다.", "There is no governance history to show.")}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-stone-900">{item.action}</div>
            <div className="text-xs text-stone-500">{formatDateTime(item.at)}</div>
          </div>
          <div className="mt-1 text-xs text-stone-600">
            {[item.instanceAlias, item.displayName].filter(Boolean).join(" · ") || text("인스턴스 정보 없음", "No instance info")}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-600">
            {item.actor ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-stone-200">{item.actor}</span> : null}
            {item.trustState ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-stone-200">{item.trustState}</span> : null}
            {item.workspaceScopeId ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-stone-200">{item.workspaceScopeId}</span> : null}
          </div>
          {item.reason ? (
            <div className="mt-2 text-xs leading-5 text-stone-600">{displayText(item.reason)}</div>
          ) : null}
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
            <h3 className="text-sm font-semibold text-stone-900">{text("연장 Fleet", "Extension fleet")}</h3>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {text("로컬/원격 인스턴스, 기본 대상 결정, 명시 선택 후보를 한 화면에서 봅니다.", "View local and remote instances, default targeting, and explicit selection candidates in one place.")}
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
            {text("Fleet 상태를 불러오는 중입니다.", "Loading fleet status.")}
          </div>
        ) : null}

        {!fleet ? null : visibility === "summary" ? (
          <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              {text("현재 연결된 내 기기", "Current device")}
            </div>
            <div className="mt-2 text-sm font-semibold text-stone-900">
              {currentDevice ? currentDevice.instanceAlias || currentDevice.displayName || currentDevice.nodeId : text("없음", "None")}
            </div>
            <div className="mt-1 text-xs leading-5 text-stone-600">
              {currentDevice
                ? `${currentDevice.location === "local" ? text("로컬", "Local") : text("원격", "Remote")} · ${describeYeonjangState(currentDevice, text)}`
                : text("연결된 인스턴스가 없습니다.", "No connected instance.")}
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
                  {currentDevice ? currentDevice.instanceAlias || currentDevice.displayName || currentDevice.nodeId : text("없음", "None")}
                </div>
                <div className="mt-1 text-xs leading-5 text-stone-600">
                  {currentDevice
                    ? `${currentDevice.location === "local" ? text("로컬", "Local") : text("원격", "Remote")} · ${describeYeonjangState(currentDevice, text)}`
                    : text("연결된 인스턴스가 없습니다.", "No connected instance.")}
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 lg:col-span-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  {text("기본 대상 결정", "Default target decision")}
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
                {text("명시 대상 선택 위치", "Explicit target picker placements")}
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
                {text("명시 대상 후보", "Explicit target candidates")}
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
                    {instance.instanceAlias || instance.displayName || instance.nodeId}
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
              <h3 className="text-sm font-semibold text-stone-900">{text("전체 연장 Fleet", "Full extension fleet")}</h3>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                {text("local/remote, profile, 권한, 최근 상태를 비교하고 특정 인스턴스를 선택합니다.", "Compare local and remote instances by profile, permissions, and recent state, then inspect one in detail.")}
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
              {text("표시할 인스턴스가 없습니다.", "There are no instances to show.")}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="space-y-3">
                <div className="grid grid-cols-[minmax(0,1.4fr)_0.8fr_0.9fr_0.9fr_0.9fr_1fr] gap-2 rounded-xl bg-stone-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                  <div>{text("이름", "Name")}</div>
                  <div>{text("위치", "Location")}</div>
                  <div>{text("프로파일", "Profile")}</div>
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
                        {instance.instanceAlias || instance.displayName || instance.nodeId}
                      </div>
                      <div className="mt-1 truncate text-xs text-stone-500">
                        {instance.displayName !== instance.instanceAlias ? displayText(instance.displayName) : instance.nodeId}
                      </div>
                    </div>
                    <div className="text-xs text-stone-700">
                      <span className={`inline-flex rounded-full border px-2 py-1 font-semibold ${badgeToneClass(locationTone(instance))}`}>
                        {instance.location === "local" ? text("로컬", "Local") : text("원격", "Remote")}
                      </span>
                    </div>
                    <div className="text-xs text-stone-700">{instance.supportProfile}</div>
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
            <h3 className="text-sm font-semibold text-stone-900">{text("Governance 이력", "Governance history")}</h3>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {text("pairing, trust, rename, local marker, remote/broadcast 승인 이력을 최근 순서대로 봅니다.", "Shows recent pairing, trust, rename, local marker, and remote/broadcast approval events.")}
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
