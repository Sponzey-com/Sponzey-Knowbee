import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from "react"
import { api } from "../api/client"
import { ResourceReadStatusNotice } from "../components/ResourceReadStatusNotice"
import {
  YeonjangActiveTabInfoAuthorizationPrompt,
  YeonjangActiveTabInfoReadinessPanel,
} from "../components/setup/YeonjangActiveTabInfoReadinessPanel"
import { CapabilityTabs } from "../components/capabilities/CapabilityTabs"
import { Button } from "../components/ui/Button"
import { InlineNotice } from "../components/ui/InlineNotice"
import { Skeleton } from "../components/ui/Skeleton"
import { StatusLabel, type StatusTone } from "../components/ui/StatusLabel"
import type {
  YeonjangCapabilityDetail,
  YeonjangCapabilityGroup,
  YeonjangCapabilityItem,
  YeonjangCapabilityPage,
  YeonjangCapabilityPlatform,
  YeonjangCapabilityStatus,
  YeonjangCapabilitySummary,
  YeonjangBrowserActiveTabInfoPreDispatchPreview,
  YeonjangPlatformSupportStatus,
} from "../contracts/yeonjang"
import {
  capabilityCommandRecoveryText,
  projectCapabilityCommandFailure,
  projectCapabilityReceiptReason,
} from "../lib/capability-command-recovery"
import {
  type ResourceReadState,
  initialResourceReadState,
  reduceResourceReadState,
} from "../lib/resource-read-state"
import { useUiI18n } from "../lib/ui-i18n"
import { projectUserRecovery } from "../lib/user-recovery"
import {
  createYeonjangActiveTabInfoApprovalReceipt,
  projectYeonjangActiveTabInfoApprovalReceiptForState,
  type YeonjangActiveTabInfoApprovalReceiptStateProjection,
  type YeonjangActiveTabInfoApprovalScope,
  type YeonjangActiveTabInfoApprovalReceipt,
} from "../lib/yeonjang-active-tab-info-approval-receipt"
import {
  loadYeonjangActiveTabInfoPreDispatchPreviewState,
} from "../lib/yeonjang-active-tab-info-pre-dispatch-preview-state"
import {
  buildYeonjangActiveTabInfoReadinessLoadingState,
  loadYeonjangBrowserActiveTabInfoReadinessState,
  type YeonjangActiveTabInfoReadinessLoadState,
} from "../lib/yeonjang-active-tab-info-readiness-load-state"
import type { YeonjangActiveTabInfoGeneralReadinessView } from "../lib/yeonjang-active-tab-info-readiness-view"
import type { YeonjangActiveTabInfoPrimaryActionView } from "../lib/yeonjang-active-tab-info-readiness-view"
import {
  type YeonjangBindingFlow,
  type YeonjangRecoveryFlow,
  initialYeonjangBindingFlow,
  initialYeonjangRecoveryFlow,
  reduceYeonjangBindingFlow,
  reduceYeonjangRecoveryFlow,
} from "../lib/yeonjang-detail-flow"

type LocationFilter = YeonjangCapabilityItem["location"] | ""
type PlatformFilter = YeonjangCapabilityPlatform | ""
type StatusFilter = YeonjangCapabilityStatus | ""
type YeonjangRecoveryAction = "reconnect" | "check_permissions"

const EMPTY_SUMMARY: YeonjangCapabilitySummary = {
  total: 0,
  ready: 0,
  local: 0,
  remote: 0,
  permissionRequired: 0,
  stale: 0,
  duplicateInstanceDetected: false,
  knowbeeFallbackAvailable: true,
  computerControlAvailable: false,
}

function statusTone(status: YeonjangCapabilityStatus): StatusTone {
  if (status === "ready") return "success"
  if (status === "permission_required" || status === "stale") return "warning"
  if (status === "unavailable") return "danger"
  return "neutral"
}

function formatAge(ageMs: number | null, korean: boolean): string {
  if (ageMs === null) return korean ? "확인되지 않음" : "Unknown"
  if (ageMs < 60_000) return korean ? "방금 전" : "Just now"
  const minutes = Math.floor(ageMs / 60_000)
  if (minutes < 60) return korean ? `${minutes}분 전` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return korean ? `${hours}시간 전` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  return korean ? `${days}일 전` : `${days}d ago`
}

function humanize(value: string): string {
  return value.replaceAll("_", " ")
}

function supportTone(status: YeonjangPlatformSupportStatus): StatusTone {
  if (status === "supported") return "success"
  if (status === "limited" || status === "permission_required") return "warning"
  return "neutral"
}

function recoveryActionForIssue(
  issue: YeonjangCapabilityItem["actionableIssue"],
): YeonjangRecoveryAction | null {
  if (issue === "yeonjang_stale" || issue === "yeonjang_unavailable") return "reconnect"
  if (issue === "yeonjang_permission_required" || issue === "yeonjang_restricted") {
    return "check_permissions"
  }
  return null
}

function capabilityGroupLabel(
  group: YeonjangCapabilityGroup,
  text: (ko: string, en: string) => string,
): string {
  switch (group) {
    case "applications":
      return text("앱 실행", "App launch")
    case "browser":
      return text("브라우저", "Browser")
    case "disk":
      return text("디스크", "Disk")
    case "files":
      return text("파일", "Files")
    case "input":
      return text("키보드/마우스", "Keyboard and mouse")
    case "process":
      return text("프로세스", "Processes")
    case "screen":
      return text("화면 캡처", "Screen capture")
    case "system":
      return text("시스템", "System")
  }
}

export interface YeonjangCatalogViewProps {
  items: readonly YeonjangCapabilityItem[]
  summary: YeonjangCapabilitySummary
  selectedItem: YeonjangCapabilityDetail | null
  recoveryFlow: YeonjangRecoveryFlow
  bindingFlow: YeonjangBindingFlow
  activeTabInfoReadinessState?: YeonjangActiveTabInfoReadinessLoadState
  activeTabInfoAuthorizationAction?: YeonjangActiveTabInfoPrimaryActionView | null
  activeTabInfoApprovalReceipt?: YeonjangActiveTabInfoApprovalReceiptStateProjection | null
  activeTabInfoPreDispatchPreview?: YeonjangBrowserActiveTabInfoPreDispatchPreview | null
  activeTabInfoPreDispatchPreviewLoading?: boolean | undefined
  activeTabInfoPreDispatchPreviewError?: string | null | undefined
  loading: boolean
  detailReadState?: ResourceReadState<YeonjangCapabilityDetail>
  readState?: ResourceReadState<YeonjangCapabilityPage>
  error?: string | null
  search: string
  location: LocationFilter
  platform: PlatformFilter
  status: StatusFilter
  onSearchChange(value: string): void
  onLocationChange(value: LocationFilter): void
  onPlatformChange(value: PlatformFilter): void
  onStatusChange(value: StatusFilter): void
  onSelect(yeonjangRef: string, trigger: HTMLElement): void
  onCloseDetail(): void
  onRefreshDetail?(): void
  onRefresh(): void
  onRequestActiveTabInfoAuthorization?(action: YeonjangActiveTabInfoPrimaryActionView): void
  onCreateActiveTabInfoApprovalReceipt?(
    action: YeonjangActiveTabInfoPrimaryActionView,
    approvalScope: Exclude<YeonjangActiveTabInfoApprovalScope, "deny">,
  ): void
  onCancelActiveTabInfoAuthorization?(): void
  onRequestRecovery(action: YeonjangRecoveryAction): void
  onRequestItemRecovery(yeonjangRef: string, action: YeonjangRecoveryAction): void
  onConfirmRecovery(): void
  onCancelRecovery(): void
  onEditBindings(): void
  onToggleBinding(agentRef: string): void
  onSaveBindings(): void
  onCancelBindings(): void
}

export function YeonjangCatalogView(props: YeonjangCatalogViewProps) {
  const { language, text } = useUiI18n()
  const isKorean = language === "ko"
  const readState =
    props.readState ??
    (props.error
      ? reduceResourceReadState(initialResourceReadState<YeonjangCapabilityPage>(), {
          type: "load_failed",
          failure: projectUserRecovery(props.error, "read"),
        })
      : initialResourceReadState<YeonjangCapabilityPage>())
  const detailReadState =
    props.detailReadState ??
    (props.selectedItem
      ? {
          status: "ready" as const,
          data: props.selectedItem,
          observedAt: 0,
          failure: null,
        }
      : initialResourceReadState<YeonjangCapabilityDetail>())
  const detailVerified = detailReadState.data !== null
  const issueRecoveryAction = recoveryActionForIssue(props.selectedItem?.actionableIssue ?? null)
  const manualStatusCheckAction = props.selectedItem && !issueRecoveryAction ? "check_permissions" : null
  const displayRecoveryAction =
    props.recoveryFlow.action ?? issueRecoveryAction ?? manualStatusCheckAction
  const bindings = props.selectedItem?.bindings ?? {
    boundAgents: [],
    availableAgents: [],
  }
  const agents = props.selectedItem
    ? [...bindings.boundAgents, ...bindings.availableAgents].sort((left, right) =>
        left.name.localeCompare(right.name),
      )
    : []
  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <header className="border-b border-stone-200 bg-white px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-stone-500">
              {text("컴퓨터 연결", "Computer connections")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-stone-950">
              {text("연장", "Yeonjang")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {text(
                "Knowbee가 작업할 수 있는 컴퓨터와 사용 가능한 범위를 확인합니다.",
                "Review computers Knowbee can use and the capabilities available on each one.",
              )}
            </p>
          </div>
          <Button className="!min-h-11" onClick={props.onRefresh} pending={props.loading}>
            {text("새로고침", "Refresh")}
          </Button>
        </div>
        <div className="mx-auto max-w-6xl">
          <CapabilityTabs active="yeonjang" />
        </div>
      </header>

      <div className="mx-auto max-w-none px-5 py-6 sm:px-8 2xl:max-w-[96rem]">
        <section
          aria-label={text("연장 요약", "Yeonjang summary")}
          className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--ui-surface-radius)] border border-stone-200 bg-stone-200 sm:grid-cols-4"
        >
          {[
            [text("전체", "Total"), props.summary.total],
            [text("사용 가능", "Ready"), props.summary.ready],
            [text("이 컴퓨터", "Local"), props.summary.local],
            [text("다른 컴퓨터", "Remote"), props.summary.remote],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-white px-4 py-3">
              <span className="block text-xs font-medium text-stone-500">{label}</span>
              <strong className="mt-1 block text-xl text-stone-950">{value}</strong>
            </div>
          ))}
        </section>

        {!props.summary.computerControlAvailable ? (
          <InlineNotice
            tone="info"
            title={text("컴퓨터 제어를 사용할 수 없습니다", "Computer control is unavailable")}
            className="mt-5"
          >
            {text(
              "대화와 Knowbee 자체 기능은 계속 사용할 수 있습니다. 컴퓨터 작업에는 연결 가능한 연장이 필요합니다.",
              "Chat and Knowbee's built-in capabilities remain available. Computer tasks require a connected Yeonjang.",
            )}
          </InlineNotice>
        ) : null}

        <div className="mt-5">
          <YeonjangActiveTabInfoReadinessSection
            state={props.activeTabInfoReadinessState}
            text={text}
            authorizationAction={props.activeTabInfoAuthorizationAction ?? null}
            approvalReceipt={props.activeTabInfoApprovalReceipt ?? null}
            preDispatchPreview={props.activeTabInfoPreDispatchPreview ?? null}
            preDispatchPreviewLoading={props.activeTabInfoPreDispatchPreviewLoading}
            preDispatchPreviewError={props.activeTabInfoPreDispatchPreviewError}
            onRequestAuthorization={props.onRequestActiveTabInfoAuthorization}
            onCreateApprovalReceipt={props.onCreateActiveTabInfoApprovalReceipt}
            onCancelAuthorization={props.onCancelActiveTabInfoAuthorization}
          />
        </div>

        <section
          aria-labelledby="yeonjang-filter-title"
          className="mt-6 border-b border-stone-200 pb-5"
        >
          <h2 id="yeonjang-filter-title" className="sr-only">
            {text("연장 필터", "Yeonjang filters")}
          </h2>
          <div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_10rem_10rem_12rem] md:items-end">
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>{text("검색", "Search")}</span>
              <input
                aria-label={text("연장 검색", "Search Yeonjang")}
                value={props.search}
                onChange={(event) => props.onSearchChange(event.target.value)}
                className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"
                placeholder={text("표시 이름", "Display name")}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>{text("위치", "Location")}</span>
              <select
                value={props.location}
                onChange={(event) => props.onLocationChange(event.target.value as LocationFilter)}
                className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"
              >
                <option value="">{text("전체", "All")}</option>
                <option value="local">{text("이 컴퓨터", "This computer")}</option>
                <option value="remote">{text("다른 컴퓨터", "Remote")}</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>{text("운영체제", "Platform")}</span>
              <select
                value={props.platform}
                onChange={(event) => props.onPlatformChange(event.target.value as PlatformFilter)}
                className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"
              >
                <option value="">{text("전체", "All")}</option>
                <option value="macos">macOS</option>
                <option value="windows">Windows</option>
                <option value="linux">Linux</option>
                <option value="unknown">{text("알 수 없음", "Unknown")}</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>{text("상태", "Status")}</span>
              <select
                value={props.status}
                onChange={(event) => props.onStatusChange(event.target.value as StatusFilter)}
                className="min-h-11 rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)]"
              >
                <option value="">{text("전체", "All")}</option>
                <option value="ready">{text("사용 가능", "Ready")}</option>
                <option value="inactive">{text("비활성", "Inactive")}</option>
                <option value="permission_required">
                  {text("권한 필요", "Permission required")}
                </option>
                <option value="stale">{text("응답 지연", "Stale")}</option>
                <option value="unavailable">{text("사용 불가", "Unavailable")}</option>
              </select>
            </label>
          </div>
        </section>

        {readState.status === "failed" ||
        readState.status === "stale" ||
        (readState.status === "loading" && readState.data !== null) ? (
          <div className="mt-5">
            <ResourceReadStatusNotice
              state={readState}
              subject="capabilities"
              text={text}
              onRefresh={props.onRefresh}
            />
          </div>
        ) : null}
        <div
          aria-label={text("연장 목록과 상세", "Yeonjang list and details")}
          className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start"
        >
          <div className="min-w-0">
        {props.loading && props.items.length === 0 ? (
          <div
            className="grid gap-3"
            aria-label={text("연장 목록 불러오는 중", "Loading Yeonjang list")}
          >
            <Skeleton
              width="100%"
              height="88px"
              label={text("연장 불러오는 중", "Loading Yeonjang")}
            />
            <Skeleton
              width="100%"
              height="88px"
              label={text("연장 불러오는 중", "Loading Yeonjang")}
            />
          </div>
        ) : null}
        {!props.loading && readState.status !== "failed" && props.items.length === 0 ? (
          <InlineNotice
            tone="info"
            title={text("조건에 맞는 연장이 없습니다", "No matching Yeonjang")}
            className="mt-5"
          >
            {text(
              "검색 조건을 바꾸거나 연결 상태를 확인해 주세요.",
              "Change the filters or check connection status.",
            )}
          </InlineNotice>
        ) : null}

        <section aria-label={text("연장 목록", "Yeonjang list")} className="mt-6 grid gap-3">
          {props.items.map((item) => {
            const itemRecoveryAction = recoveryActionForIssue(item.actionableIssue)
            return (
              <article
                key={item.yeonjangRef}
                data-yeonjang-ref={item.yeonjangRef}
                className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-stone-950">{item.displayName}</h3>
                    <p className="mt-1 text-sm leading-5 text-stone-600">
                      {item.location === "local"
                        ? text("이 컴퓨터", "This computer")
                        : text("다른 컴퓨터", "Remote")}{" "}
                      · {item.platform === "macos" ? "macOS" : humanize(item.platform)} ·{" "}
                      {formatAge(item.lastSeenAgeMs, isKorean)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusLabel tone={statusTone(item.status)}>{humanize(item.status)}</StatusLabel>
                    {item.permissionState !== "ready" ? (
                      <StatusLabel tone="warning">
                        {text("권한 필요", "Permission required")}
                      </StatusLabel>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.capabilityGroups.map((group) => (
                    <StatusLabel key={group}>{capabilityGroupLabel(group, text)}</StatusLabel>
                  ))}
                  <Button
                    className="!min-h-11"
                    onClick={(event) => props.onSelect(item.yeonjangRef, event.currentTarget)}
                  >
                    {text("상세 보기", "View details")}
                  </Button>
                  {itemRecoveryAction ? (
                    <Button
                      className="!min-h-11"
                      data-yeonjang-action={itemRecoveryAction}
                      variant="primary"
                      onClick={() => props.onRequestItemRecovery(item.yeonjangRef, itemRecoveryAction)}
                    >
                      {itemRecoveryAction === "check_permissions"
                        ? text("권한 확인", "Check permissions")
                        : text("다시 연결", "Reconnect")}
                    </Button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </section>
          </div>

          <aside
            aria-label={text("연장 운영 상세", "Yeonjang operational details")}
            className="rounded-[var(--ui-surface-radius)] border border-stone-200 bg-white p-5 shadow-sm xl:sticky xl:top-4"
          >
            <header className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-stone-500">
                  {text("상세", "Details")}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-stone-950">
                  {props.selectedItem?.displayName ??
                    text("연장 운영 상세", "Yeonjang operational details")}
                </h2>
              </div>
              {props.selectedItem ? (
                <Button className="!min-h-11" onClick={props.onCloseDetail}>
                  {text("닫기", "Close")}
                </Button>
              ) : null}
            </header>
            <div className="mt-5">
        {props.selectedItem ? (
          <div className="grid gap-6">
            {detailReadState.status === "failed" ||
            detailReadState.status === "stale" ||
            (detailReadState.status === "loading" && detailReadState.data !== null) ? (
              <ResourceReadStatusNotice
                state={detailReadState}
                subject="capabilities"
                text={text}
                onRefresh={props.onRefreshDetail ?? (() => undefined)}
              />
            ) : null}
            {detailReadState.status === "loading" && detailReadState.data === null ? (
              <Skeleton
                width="100%"
                height="120px"
                label={text("연장 상세 불러오는 중", "Loading Yeonjang details")}
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <StatusLabel tone={statusTone(props.selectedItem.status)}>
                {humanize(props.selectedItem.status)}
              </StatusLabel>
              <StatusLabel>
                {props.selectedItem.location === "local"
                  ? text("이 컴퓨터", "This computer")
                  : text("다른 컴퓨터", "Remote")}
              </StatusLabel>
            </div>
            <dl className="grid gap-4 text-sm">
              {[
                [
                  text("운영체제", "Platform"),
                  props.selectedItem.platform === "macos"
                    ? "macOS"
                    : humanize(props.selectedItem.platform),
                ],
                [text("지원 형태", "Support profile"), humanize(props.selectedItem.supportProfile)],
                [text("권한", "Permissions"), humanize(props.selectedItem.permissionState)],
                [
                  text("마지막 확인", "Last seen"),
                  formatAge(props.selectedItem.lastSeenAgeMs, isKorean),
                ],
              ].map(([term, description]) => (
                <div key={term} className="border-b border-stone-200 pb-3">
                  <dt className="text-stone-500">{term}</dt>
                  <dd className="mt-1 font-medium text-stone-950">{description}</dd>
                </div>
              ))}
            </dl>
            {detailVerified ? (
              <>
                <section>
                  <h3 className="font-semibold text-stone-950">
                    {text("사용 가능한 범위", "Available capabilities")}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {props.selectedItem.capabilityGroups.length > 0 ? (
                      props.selectedItem.capabilityGroups.map((group) => (
                        <StatusLabel key={group}>{capabilityGroupLabel(group, text)}</StatusLabel>
                      ))
                    ) : (
                      <span className="text-sm text-stone-600">
                        {text("확인된 기능이 없습니다.", "No capabilities reported.")}
                      </span>
                    )}
                  </div>
                </section>
                {props.selectedItem.platformSupport ? (
                  <section className="border-t border-stone-200 pt-5">
                    <h3 className="font-semibold text-stone-950">
                      {text("플랫폼 지원", "Platform support")}
                    </h3>
                    <dl className="mt-3 grid gap-3 text-sm">
                      {(
                        [
                          [
                            text("프로세스 제어", "Process control"),
                            props.selectedItem.platformSupport.processControl,
                          ],
                          [
                            text("트레이와 창", "Tray and window"),
                            props.selectedItem.platformSupport.trayWindow,
                          ],
                          [
                            text("설치 패키지", "Installation package"),
                            props.selectedItem.platformSupport.packageSmoke,
                          ],
                        ] as const
                      ).map(([label, support]) => (
                        <div
                          key={String(label)}
                          className="flex items-center justify-between gap-3"
                        >
                          <dt className="text-stone-600">{label}</dt>
                          <dd>
                            <StatusLabel tone={supportTone(support.status)}>
                              {humanize(support.status)}
                            </StatusLabel>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ) : null}
                {props.selectedItem.actionableIssue ? (
                  <InlineNotice tone="warning" title={text("확인이 필요합니다", "Action required")}>
                    {humanize(props.selectedItem.actionableIssue)}
                  </InlineNotice>
                ) : null}
                {displayRecoveryAction ? (
                  <section className="border-t border-stone-200 pt-5">
                    <h3 className="font-semibold text-stone-950">
                      {text("연결 복구", "Connection recovery")}
                    </h3>
                    {props.recoveryFlow.state === "idle" ? (
                      <Button
                        data-yeonjang-action={displayRecoveryAction}
                        className="mt-3 lg:min-h-11"
                        onClick={() => props.onRequestRecovery(displayRecoveryAction)}
                      >
                        {manualStatusCheckAction ? text("상태 확인", "Check status") : null}
                        {!manualStatusCheckAction && displayRecoveryAction === "reconnect"
                          ? text("다시 연결", "Reconnect")
                          : null}
                        {!manualStatusCheckAction && displayRecoveryAction === "check_permissions"
                          ? text("권한 다시 확인", "Check permissions again")
                          : null}
                      </Button>
                    ) : null}
                    {props.recoveryFlow.state === "confirming" ? (
                      <div className="mt-3 grid gap-3">
                        <InlineNotice tone="warning" title={text("실행 전 확인", "Confirm action")}>
                          {text(
                            "연장에 상태 확인 명령을 보내고 결과를 다시 검증합니다.",
                            "Knowbee will send a status check and verify the resulting state.",
                          )}
                        </InlineNotice>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            className="lg:min-h-11"
                            variant="primary"
                            onClick={props.onConfirmRecovery}
                          >
                            {text("실행", "Run")}
                          </Button>
                          <Button className="lg:min-h-11" onClick={props.onCancelRecovery}>
                            {text("취소", "Cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {props.recoveryFlow.state === "executing" ? (
                      <InlineNotice
                        tone="info"
                        title={text("확인 중", "Checking")}
                        className="mt-3"
                      >
                        {text("연결 결과를 확인하고 있습니다.", "Verifying the connection result.")}
                      </InlineNotice>
                    ) : null}
                    {props.recoveryFlow.state === "active" ? (
                      <InlineNotice
                        tone="success"
                        title={text("확인 완료", "Check complete")}
                        className="mt-3"
                      >
                        {text(
                          "연장을 사용할 수 있는 상태를 확인했습니다.",
                          "Yeonjang is ready to use.",
                        )}
                      </InlineNotice>
                    ) : null}
                    {props.recoveryFlow.state === "failed" ||
                    props.recoveryFlow.state === "blocked" ? (
                      <div className="mt-3 grid justify-items-start gap-3">
                        <InlineNotice
                          tone="danger"
                          title={text("복구하지 못했습니다", "Recovery did not complete")}
                          className="w-full"
                        >
                          {capabilityCommandRecoveryText(props.recoveryFlow.reasonCode, language)}
                        </InlineNotice>
                        <Button
                          className="lg:min-h-11"
                          onClick={
                            props.recoveryFlow.reasonCode === "capability_command_conflict" ||
                            props.recoveryFlow.reasonCode === "capability_command_unverified"
                              ? (props.onRefreshDetail ?? (() => undefined))
                              : props.onConfirmRecovery
                          }
                        >
                          {props.recoveryFlow.reasonCode === "capability_command_conflict" ||
                          props.recoveryFlow.reasonCode === "capability_command_unverified"
                            ? text("상태 새로고침", "Refresh state")
                            : props.recoveryFlow.action === "reconnect"
                              ? text("다시 연결", "Reconnect")
                              : text("권한 다시 확인", "Check permissions")}
                        </Button>
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <section className="border-t border-stone-200 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-stone-950">
                        {text("연결된 에이전트", "Connected agents")}
                      </h3>
                      <p className="mt-1 text-sm text-stone-600">
                        {text(
                          `${bindings.boundAgents.length}개 에이전트가 이 연장을 사용할 수 있습니다.`,
                          `${bindings.boundAgents.length} agents can use this Yeonjang.`,
                        )}
                      </p>
                    </div>
                    {props.bindingFlow.state === "viewing" ? (
                      <Button className="lg:min-h-11" onClick={props.onEditBindings}>
                        {text("연결 관리", "Manage")}
                      </Button>
                    ) : null}
                  </div>
                  {props.bindingFlow.state === "viewing" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {bindings.boundAgents.length > 0 ? (
                        bindings.boundAgents.map((agent) => (
                          <StatusLabel key={agent.agentRef}>{agent.name}</StatusLabel>
                        ))
                      ) : (
                        <span className="text-sm text-stone-600">
                          {text("연결된 에이전트가 없습니다.", "No agents connected.")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      {agents.length > 0 ? (
                        agents.map((agent) => (
                          <label
                            key={agent.agentRef}
                            className="flex min-h-11 items-center gap-3 rounded-[var(--ui-surface-radius)] border border-stone-200 px-3 text-sm font-medium text-stone-900"
                          >
                            <input
                              type="checkbox"
                              aria-label={agent.name}
                              checked={props.bindingFlow.selectedAgentRefs.includes(agent.agentRef)}
                              disabled={props.bindingFlow.state === "saving"}
                              onChange={() => props.onToggleBinding(agent.agentRef)}
                              className="h-5 w-5 accent-stone-900"
                            />
                            <span>{agent.name}</span>
                          </label>
                        ))
                      ) : (
                        <span className="text-sm text-stone-600">
                          {text("연결할 수 있는 에이전트가 없습니다.", "No agents are available.")}
                        </span>
                      )}
                      {props.bindingFlow.state === "failed" ? (
                        <InlineNotice
                          tone="danger"
                          title={text("연결을 저장하지 못했습니다", "Could not save connections")}
                        >
                          {capabilityCommandRecoveryText(props.bindingFlow.reasonCode, language)}
                        </InlineNotice>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="lg:min-h-11"
                          variant="primary"
                          pending={props.bindingFlow.state === "saving"}
                          onClick={
                            props.bindingFlow.requiresRefresh
                              ? (props.onRefreshDetail ?? (() => undefined))
                              : props.onSaveBindings
                          }
                        >
                          {props.bindingFlow.requiresRefresh
                            ? text("상태 새로고침", "Refresh state")
                            : text("연결 저장", "Save connections")}
                        </Button>
                        <Button
                          className="lg:min-h-11"
                          disabled={props.bindingFlow.state === "saving"}
                          onClick={props.onCancelBindings}
                        >
                          {text("취소", "Cancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
                <InlineNotice
                  tone="info"
                  title={text("연장을 사용할 수 없을 때", "When Yeonjang is unavailable")}
                >
                  {text(
                    "Knowbee는 자체 기능으로 가능한 작업을 계속 처리하고, 컴퓨터 제어가 필요한 경우 이유와 해결 방법을 알려드립니다.",
                    "Knowbee continues with built-in capabilities and explains the reason and resolution when computer control is required.",
                  )}
                </InlineNotice>
              </>
            ) : (
              <InlineNotice
                tone="info"
                title={text("상세 정보 확인 필요", "Details need verification")}
              >
                {text(
                  "목록에서 확인된 기본 정보만 표시합니다. 상세 상태를 새로고침한 뒤 변경하세요.",
                  "Only list-verified information is shown. Refresh details before making changes.",
                )}
              </InlineNotice>
            )}
          </div>
        ) : (
          <InlineNotice tone="info" title={text("연장을 선택하세요", "Select a Yeonjang")}>
            {text(
              "목록에서 컴퓨터를 선택하면 권한, 사용 가능한 범위, 연결된 에이전트를 여기에서 바로 확인할 수 있습니다.",
              "Select a computer from the list to review permissions, available capabilities, and connected agents here.",
            )}
          </InlineNotice>
        )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function YeonjangActiveTabInfoReadinessSection({
  state,
  text,
  authorizationAction,
  approvalReceipt,
  preDispatchPreview,
  preDispatchPreviewLoading,
  preDispatchPreviewError,
  onRequestAuthorization,
  onCreateApprovalReceipt,
  onCancelAuthorization,
}: {
  state: YeonjangActiveTabInfoReadinessLoadState | undefined
  text: (ko: string, en: string) => string
  authorizationAction: YeonjangActiveTabInfoPrimaryActionView | null
  approvalReceipt: YeonjangActiveTabInfoApprovalReceiptStateProjection | null
  preDispatchPreview: YeonjangBrowserActiveTabInfoPreDispatchPreview | null
  preDispatchPreviewLoading?: boolean | undefined
  preDispatchPreviewError?: string | null | undefined
  onRequestAuthorization?: (action: YeonjangActiveTabInfoPrimaryActionView) => void
  onCreateApprovalReceipt?: (
    action: YeonjangActiveTabInfoPrimaryActionView,
    approvalScope: Exclude<YeonjangActiveTabInfoApprovalScope, "deny">,
  ) => void
  onCancelAuthorization?: () => void
}) {
  if (!state) return null
  if (state.status === "loading" && !state.view) {
    return (
      <section aria-label={text("활성 탭 준비 상태", "Active tab readiness")}>
        <Skeleton
          width="100%"
          height="160px"
          label={text("활성 탭 준비 상태 불러오는 중", "Loading active tab readiness")}
        />
      </section>
    )
  }
  if (state.status === "error" && !state.view) {
    return (
      <InlineNotice
        tone="warning"
        title={text("활성 탭 준비 상태를 확인하지 못했습니다", "Active tab readiness could not be checked")}
      >
        {state.message ?? text("잠시 후 다시 시도하세요.", "Try again shortly.")}
      </InlineNotice>
    )
  }
  if (!state.view) return null
  return (
    <div className="space-y-3">
      <YeonjangActiveTabInfoReadinessPanel
        view={state.view}
        onPrimaryAction={onRequestAuthorization ? (action) => {
          if (action) onRequestAuthorization(action)
        } : undefined}
      />
      {authorizationAction ? (
        <YeonjangActiveTabInfoAuthorizationPrompt
          action={authorizationAction}
          receipt={
            approvalReceipt
              ? {
                  ...approvalReceipt,
                  nonce: "redacted",
                } satisfies YeonjangActiveTabInfoApprovalReceipt
              : null
          }
          preview={preDispatchPreview}
          previewLoading={preDispatchPreviewLoading}
          previewError={preDispatchPreviewError}
          onApprove={onCreateApprovalReceipt}
          onCancel={onCancelAuthorization}
        />
      ) : null}
    </div>
  )
}

export function YeonjangCatalogPage() {
  const { text } = useUiI18n()
  const [readState, setReadState] =
    useState<ResourceReadState<YeonjangCapabilityPage>>(initialResourceReadState)
  const [items, setItems] = useState<YeonjangCapabilityItem[]>([])
  const [summary, setSummary] = useState<YeonjangCapabilitySummary>(EMPTY_SUMMARY)
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [location, setLocation] = useState<LocationFilter>("")
  const [platform, setPlatform] = useState<PlatformFilter>("")
  const [status, setStatus] = useState<StatusFilter>("")
  const [selectedItem, setSelectedItem] = useState<YeonjangCapabilityDetail | null>(null)
  const [detailReadState, setDetailReadState] =
    useState<ResourceReadState<YeonjangCapabilityDetail>>(initialResourceReadState)
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [recoveryFlow, setRecoveryFlow] = useState<YeonjangRecoveryFlow>(
    initialYeonjangRecoveryFlow,
  )
  const [bindingFlow, setBindingFlow] = useState<YeonjangBindingFlow>(() =>
    initialYeonjangBindingFlow([]),
  )
  const [loading, setLoading] = useState(false)
  const [activeTabInfoReadinessState, setActiveTabInfoReadinessState] =
    useState<YeonjangActiveTabInfoReadinessLoadState>(() =>
      buildYeonjangActiveTabInfoReadinessLoadingState(),
    )
  const [activeTabInfoAuthorizationAction, setActiveTabInfoAuthorizationAction] =
    useState<YeonjangActiveTabInfoPrimaryActionView | null>(null)
  const [activeTabInfoApprovalReceipt, setActiveTabInfoApprovalReceipt] =
    useState<YeonjangActiveTabInfoApprovalReceiptStateProjection | null>(null)
  const [activeTabInfoPreDispatchPreview, setActiveTabInfoPreDispatchPreview] =
    useState<YeonjangBrowserActiveTabInfoPreDispatchPreview | null>(null)
  const [activeTabInfoPreDispatchPreviewLoading, setActiveTabInfoPreDispatchPreviewLoading] =
    useState(false)
  const [activeTabInfoPreDispatchPreviewError, setActiveTabInfoPreDispatchPreviewError] =
    useState<string | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const requestSequenceRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const detailSequenceRef = useRef(0)
  const detailControllerRef = useRef<AbortController | null>(null)
  const activeTabInfoReadinessSequenceRef = useRef(0)
  const activeTabInfoReadinessControllerRef = useRef<AbortController | null>(null)
  const activeTabInfoReadinessViewRef = useRef<YeonjangActiveTabInfoGeneralReadinessView | null>(null)
  const activeTabInfoPreDispatchPreviewSequenceRef = useRef(0)

  const load = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestSequence = ++requestSequenceRef.current
    setLoading(true)
    setReadState((current) => reduceResourceReadState(current, { type: "load_started" }))
    try {
      const page: YeonjangCapabilityPage = await api.yeonjangCapabilities(
        {
          limit: 100,
          ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
          ...(location ? { location } : {}),
          ...(platform ? { platform } : {}),
          ...(status ? { status } : {}),
        },
        controller.signal,
      )
      if (requestSequence !== requestSequenceRef.current) return
      setItems(page.items)
      setSummary(page.summary)
      setCatalogRevision(page.revision)
      setReadState((current) =>
        reduceResourceReadState(current, {
          type: "load_succeeded",
          data: page,
          observedAt: page.observedAt,
        }),
      )
    } catch (cause) {
      if (controller.signal.aborted || requestSequence !== requestSequenceRef.current) return
      setReadState((current) =>
        reduceResourceReadState(current, {
          type: "load_failed",
          failure: projectUserRecovery(cause, "read"),
        }),
      )
    } finally {
      if (requestSequence === requestSequenceRef.current) setLoading(false)
    }
  }, [deferredSearch, location, platform, status])

  useEffect(() => {
    void refreshRevision
    void load()
    return () => {
      requestSequenceRef.current += 1
      controllerRef.current?.abort()
      detailSequenceRef.current += 1
      detailControllerRef.current?.abort()
    }
  }, [load, refreshRevision])

  const loadActiveTabInfoReadiness = useCallback(async () => {
    activeTabInfoReadinessControllerRef.current?.abort()
    const controller = new AbortController()
    activeTabInfoReadinessControllerRef.current = controller
    const sequence = ++activeTabInfoReadinessSequenceRef.current
    setActiveTabInfoReadinessState(
      buildYeonjangActiveTabInfoReadinessLoadingState(activeTabInfoReadinessViewRef.current),
    )
    setActiveTabInfoAuthorizationAction(null)
    setActiveTabInfoApprovalReceipt(null)
    setActiveTabInfoPreDispatchPreview(null)
    setActiveTabInfoPreDispatchPreviewLoading(false)
    setActiveTabInfoPreDispatchPreviewError(null)
    activeTabInfoPreDispatchPreviewSequenceRef.current += 1
    const state = await loadYeonjangBrowserActiveTabInfoReadinessState({
      request: (signal) => api.yeonjangBrowserActiveTabInfoReadiness(signal),
      text,
      signal: controller.signal,
      previousView: activeTabInfoReadinessViewRef.current,
    })
    if (controller.signal.aborted || sequence !== activeTabInfoReadinessSequenceRef.current) return
    activeTabInfoReadinessViewRef.current = state.view
    setActiveTabInfoReadinessState(state)
  }, [text])

  useEffect(() => {
    void refreshRevision
    void loadActiveTabInfoReadiness()
    return () => {
      activeTabInfoReadinessSequenceRef.current += 1
      activeTabInfoReadinessControllerRef.current?.abort()
    }
  }, [loadActiveTabInfoReadiness, refreshRevision])

  const loadDetail = useCallback(
    async (yeonjangRef: string, reset: boolean) => {
      if (reset) setDetailReadState(initialResourceReadState())
      setDetailReadState((current) => reduceResourceReadState(current, { type: "load_started" }))
      detailControllerRef.current?.abort()
      const controller = new AbortController()
      detailControllerRef.current = controller
      const sequence = ++detailSequenceRef.current
      try {
        const detail = await api.yeonjangCapabilityDetail(yeonjangRef, controller.signal)
        if (controller.signal.aborted || sequence !== detailSequenceRef.current) return
        setSelectedItem(detail)
        setDetailReadState((current) =>
          reduceResourceReadState(current, {
            type: "load_succeeded",
            data: detail,
            observedAt: readState.observedAt ?? 0,
          }),
        )
        setBindingFlow(
          initialYeonjangBindingFlow(detail.bindings.boundAgents.map((agent) => agent.agentRef)),
        )
      } catch (cause) {
        if (controller.signal.aborted || sequence !== detailSequenceRef.current) return
        setDetailReadState((current) =>
          reduceResourceReadState(current, {
            type: "load_failed",
            failure: projectUserRecovery(cause, "read"),
          }),
        )
      }
    },
    [readState.observedAt],
  )

  const select = useCallback(
    async (yeonjangRef: string) => {
      const listItem = items.find((item) => item.yeonjangRef === yeonjangRef) ?? null
      setRecoveryFlow(initialYeonjangRecoveryFlow)
      setBindingFlow(initialYeonjangBindingFlow([]))
      if (listItem)
        setSelectedItem({
          ...listItem,
          revision: catalogRevision,
          bindings: { boundAgents: [], availableAgents: [] },
        })
      await loadDetail(yeonjangRef, true)
    },
    [catalogRevision, items, loadDetail],
  )

  const requestItemRecovery = useCallback(
    async (yeonjangRef: string, action: YeonjangRecoveryAction) => {
      await select(yeonjangRef)
      setRecoveryFlow((current) =>
        reduceYeonjangRecoveryFlow(current, { type: "request", action }),
      )
    },
    [select],
  )

  const confirmRecovery = useCallback(async () => {
    if (!selectedItem || !recoveryFlow.action) return
    setRecoveryFlow((current) => reduceYeonjangRecoveryFlow(current, { type: "confirm" }))
    try {
      const action = recoveryFlow.action
      const receipt = await api.recoverYeonjang(selectedItem.yeonjangRef, {
        action,
        envelope: {
          scope: "capability:write",
          mutationId: globalThis.crypto.randomUUID(),
          targetRevision: selectedItem.revision + 1,
          purpose: action === "reconnect" ? "yeonjang_reconnect" : "yeonjang_check_permissions",
          issuedAt: Date.now(),
          nonce: globalThis.crypto.randomUUID(),
        },
      })
      if (receipt.state !== "active") {
        setRecoveryFlow((current) =>
          reduceYeonjangRecoveryFlow(current, {
            type: "failed",
            reasonCode: projectCapabilityReceiptReason(receipt.reasonCode),
            blocked: receipt.reasonCode === "yeonjang_recovery_action_denied",
          }),
        )
        return
      }
      const detail = await api.yeonjangCapabilityDetail(selectedItem.yeonjangRef)
      setSelectedItem(detail)
      setRecoveryFlow((current) => reduceYeonjangRecoveryFlow(current, { type: "succeeded" }))
      setRefreshRevision((value) => value + 1)
    } catch (cause) {
      setRecoveryFlow((current) =>
        reduceYeonjangRecoveryFlow(current, {
          type: "failed",
          reasonCode: projectCapabilityCommandFailure(cause),
        }),
      )
    }
  }, [recoveryFlow.action, selectedItem])

  const saveBindings = useCallback(async () => {
    if (!selectedItem) return
    setBindingFlow((current) => reduceYeonjangBindingFlow(current, { type: "save" }))
    const original = new Set(selectedItem.bindings.boundAgents.map((agent) => agent.agentRef))
    const selected = new Set(bindingFlow.selectedAgentRefs)
    const agents = [...selectedItem.bindings.boundAgents, ...selectedItem.bindings.availableAgents]
    const changed = agents.filter(
      (agent) => original.has(agent.agentRef) !== selected.has(agent.agentRef),
    )
    let revision = selectedItem.revision
    let appliedCount = 0
    try {
      for (const agent of changed) {
        const bound = selected.has(agent.agentRef)
        const receipt = await api.updateYeonjangBinding(selectedItem.yeonjangRef, agent.agentRef, {
          bound,
          envelope: {
            scope: "capability:write",
            mutationId: globalThis.crypto.randomUUID(),
            targetRevision: revision + 1,
            purpose: bound ? "yeonjang_bind" : "yeonjang_unbind",
            issuedAt: Date.now(),
            nonce: globalThis.crypto.randomUUID(),
          },
        })
        if (receipt.state !== "active") {
          setBindingFlow((current) =>
            reduceYeonjangBindingFlow(current, {
              type: "failed",
              reasonCode: projectCapabilityReceiptReason(receipt.reasonCode),
              requiresRefresh: appliedCount > 0,
            }),
          )
          return
        }
        appliedCount += 1
        revision = receipt.revision
      }
      const detail = await api.yeonjangCapabilityDetail(selectedItem.yeonjangRef)
      setSelectedItem(detail)
      const refs = detail.bindings.boundAgents.map((agent) => agent.agentRef)
      setBindingFlow((current) =>
        reduceYeonjangBindingFlow(current, { type: "saved", selectedAgentRefs: refs }),
      )
      setRefreshRevision((value) => value + 1)
    } catch (cause) {
      setBindingFlow((current) =>
        reduceYeonjangBindingFlow(current, {
          type: "failed",
          reasonCode: projectCapabilityCommandFailure(cause),
          requiresRefresh: appliedCount > 0,
        }),
      )
    }
  }, [bindingFlow.selectedAgentRefs, selectedItem])

  return (
    <YeonjangCatalogView
      items={items}
      summary={summary}
      selectedItem={selectedItem}
      recoveryFlow={recoveryFlow}
      bindingFlow={bindingFlow}
      activeTabInfoReadinessState={activeTabInfoReadinessState}
      activeTabInfoAuthorizationAction={activeTabInfoAuthorizationAction}
      activeTabInfoApprovalReceipt={activeTabInfoApprovalReceipt}
      activeTabInfoPreDispatchPreview={activeTabInfoPreDispatchPreview}
      activeTabInfoPreDispatchPreviewLoading={activeTabInfoPreDispatchPreviewLoading}
      activeTabInfoPreDispatchPreviewError={activeTabInfoPreDispatchPreviewError}
      loading={loading}
      detailReadState={detailReadState}
      readState={readState}
      search={search}
      location={location}
      platform={platform}
      status={status}
      onSearchChange={setSearch}
      onLocationChange={setLocation}
      onPlatformChange={setPlatform}
      onStatusChange={setStatus}
      onSelect={(yeonjangRef) => {
        void select(yeonjangRef)
      }}
      onCloseDetail={() => {
        if (recoveryFlow.state === "executing" || bindingFlow.state === "saving") return
        detailControllerRef.current?.abort()
        detailSequenceRef.current += 1
        setSelectedItem(null)
        setDetailReadState(initialResourceReadState())
      }}
      onRefreshDetail={() => {
        if (selectedItem) void loadDetail(selectedItem.yeonjangRef, false)
      }}
      onRefresh={() => setRefreshRevision((value) => value + 1)}
      onRequestActiveTabInfoAuthorization={(action) => {
        setActiveTabInfoAuthorizationAction(action)
        setActiveTabInfoApprovalReceipt(null)
        setActiveTabInfoPreDispatchPreview(null)
        setActiveTabInfoPreDispatchPreviewLoading(false)
        setActiveTabInfoPreDispatchPreviewError(null)
        activeTabInfoPreDispatchPreviewSequenceRef.current += 1
      }}
      onCreateActiveTabInfoApprovalReceipt={(action, approvalScope) => {
        const receipt = createYeonjangActiveTabInfoApprovalReceipt({
          action,
          approvalScope,
        })
        if (receipt.ok) {
          const projection = projectYeonjangActiveTabInfoApprovalReceiptForState(receipt.receipt)
          setActiveTabInfoApprovalReceipt(projection)
          setActiveTabInfoPreDispatchPreview(null)
          setActiveTabInfoPreDispatchPreviewError(null)
          setActiveTabInfoPreDispatchPreviewLoading(true)
          const previewSequence = ++activeTabInfoPreDispatchPreviewSequenceRef.current
          void loadYeonjangActiveTabInfoPreDispatchPreviewState({
            projection,
            nonce: receipt.receipt.nonce,
            request: (input) => api.previewYeonjangBrowserActiveTabInfoPreDispatch(input),
          }).then((preview) => {
            if (previewSequence !== activeTabInfoPreDispatchPreviewSequenceRef.current) return
            setActiveTabInfoPreDispatchPreview(preview.preview)
            setActiveTabInfoPreDispatchPreviewError(preview.message)
          }).finally(() => {
            if (previewSequence !== activeTabInfoPreDispatchPreviewSequenceRef.current) return
            setActiveTabInfoPreDispatchPreviewLoading(false)
          })
        }
      }}
      onCancelActiveTabInfoAuthorization={() => {
        setActiveTabInfoAuthorizationAction(null)
        setActiveTabInfoApprovalReceipt(null)
        setActiveTabInfoPreDispatchPreview(null)
        setActiveTabInfoPreDispatchPreviewLoading(false)
        setActiveTabInfoPreDispatchPreviewError(null)
        activeTabInfoPreDispatchPreviewSequenceRef.current += 1
      }}
      onRequestRecovery={(action) =>
        setRecoveryFlow((current) =>
          reduceYeonjangRecoveryFlow(current, { type: "request", action }),
        )
      }
      onRequestItemRecovery={(yeonjangRef, action) => {
        void requestItemRecovery(yeonjangRef, action)
      }}
      onConfirmRecovery={() => {
        void confirmRecovery()
      }}
      onCancelRecovery={() =>
        setRecoveryFlow((current) => reduceYeonjangRecoveryFlow(current, { type: "cancel" }))
      }
      onEditBindings={() =>
        setBindingFlow((current) =>
          reduceYeonjangBindingFlow(current, {
            type: "edit",
            selectedAgentRefs:
              selectedItem?.bindings.boundAgents.map((agent) => agent.agentRef) ?? [],
          }),
        )
      }
      onToggleBinding={(agentRef) =>
        setBindingFlow((current) =>
          reduceYeonjangBindingFlow(current, { type: "toggle", agentRef }),
        )
      }
      onSaveBindings={() => {
        void saveBindings()
      }}
      onCancelBindings={() =>
        setBindingFlow((current) =>
          reduceYeonjangBindingFlow(current, {
            type: "cancel",
            selectedAgentRefs:
              selectedItem?.bindings.boundAgents.map((agent) => agent.agentRef) ?? [],
          }),
        )
      }
    />
  )
}
