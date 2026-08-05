import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { api } from "../api/client"
import type { SetupChecksResponse, StatusResponse } from "../api/adapters/types"
import { CapabilityBadge } from "../components/CapabilityBadge"
import type { DoctorMode, DoctorReport, DoctorStatus } from "../contracts/doctor"
import {
  buildAdvancedDashboardCards,
  loadAdvancedDashboardSources,
  type AdvancedDashboardCardStatus,
  type AdvancedDashboardLoadErrors,
  type AdvancedDashboardSources,
} from "../lib/advanced-dashboard"
import { getAIProviderDisplayLabel, getBackendDisplayLabel } from "../lib/ai-display"
import { useUiI18n } from "../lib/ui-i18n"
import { useCapabilitiesStore } from "../stores/capabilities"
import { useConnectionStore } from "../stores/connection"
import { useSetupStore } from "../stores/setup"
import type { UiLanguage } from "../stores/uiLanguage"
import type { AIBackendKind } from "../contracts/ai"
import type { SetupStepId } from "../contracts/setup"

export interface DashboardStorageCardView {
  title: string
  rows: Array<{ label: string; value: string }>
}

function pickDashboardStorageText(language: UiLanguage, korean: string, english: string): string {
  return language === "ko" ? korean : english
}

function hasStorageSignal(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

function dashboardConnectionAdapterLabel(adapter: string, language: UiLanguage): string {
  if (!adapter.trim()) return language === "ko" ? "확인 필요" : "Needs check"
  if (adapter === "local") return language === "ko" ? "로컬 연결" : "Local connection"
  return language === "ko" ? "사용자 지정 연결" : "Custom connection"
}

function dashboardSetupStepLabel(step: SetupStepId, language: UiLanguage): string {
  const labels: Record<SetupStepId, { ko: string; en: string }> = {
    welcome: { ko: "환영", en: "Welcome" },
    personal: { ko: "개인 정보", en: "Personal information" },
    ai_backends: { ko: "AI 연결", en: "AI connection" },
    ai_routing: { ko: "AI 실행 순서", en: "AI execution order" },
    mcp: { ko: "외부 기능 연결", en: "External feature connections" },
    skills: { ko: "작업 능력 확장", en: "Work ability extensions" },
    security: { ko: "안전 규칙", en: "Security rules" },
    channels: { ko: "대화 채널", en: "Conversation channels" },
    remote_access: { ko: "원격 접근", en: "Remote access" },
    review: { ko: "최종 확인", en: "Review" },
    done: { ko: "완료", en: "Done" },
  }
  const label = labels[step]
  return language === "ko" ? label.ko : label.en
}

function dashboardAiConnectionKindLabel(kind: AIBackendKind, language: UiLanguage): string {
  switch (kind) {
    case "provider":
      return language === "ko" ? "AI 공급자 연결" : "AI provider connection"
  }
}

function dashboardAiConnectionAddressLabel(endpoint: string | undefined, language: UiLanguage): string {
  return endpoint?.trim()
    ? language === "ko" ? "연결 주소 입력됨" : "Connection address saved"
    : language === "ko" ? "연결 주소 미입력" : "Connection address missing"
}

function dashboardAiModelConfiguredLabel(model: string | undefined, language: UiLanguage): string {
  return model?.trim()
    ? language === "ko" ? "AI 모델 설정됨" : "AI model configured"
    : language === "ko" ? "AI 모델 확인 필요" : "AI model needs check"
}

function dashboardAiProviderConfiguredLabel(provider: string | undefined, language: UiLanguage): string {
  return provider?.trim()
    ? language === "ko" ? "AI 공급자 설정됨" : "AI provider configured"
    : language === "ko" ? "AI 공급자 확인 필요" : "AI provider needs check"
}

function dashboardConnectionHostConfiguredLabel(host: string | undefined, language: UiLanguage): string {
  return host?.trim()
    ? language === "ko" ? "접속 주소 입력됨" : "Connection host saved"
    : language === "ko" ? "접속 주소 확인 필요" : "Connection host needs check"
}

function dashboardConnectionPortConfiguredLabel(port: number | undefined, language: UiLanguage): string {
  return Number.isFinite(port) && Number(port) > 0
    ? language === "ko" ? "접속 포트 설정됨" : "Connection port configured"
    : language === "ko" ? "접속 포트 확인 필요" : "Connection port needs check"
}

function dashboardOptionalConnectionLabel(configured: boolean | undefined, language: UiLanguage): string {
  return configured
    ? language === "ko" ? "설정됨" : "Configured"
    : language === "ko" ? "미설정" : "Not configured"
}

function dashboardHealthStatusLabel(status: string, language: UiLanguage): string {
  switch (status) {
    case "ok":
      return language === "ko" ? "정상" : "OK"
    case "warn":
    case "warning":
      return language === "ko" ? "주의" : "Warning"
    case "blocked":
    case "error":
      return language === "ko" ? "차단" : "Blocked"
    default:
      return language === "ko" ? "확인 필요" : "Needs check"
  }
}

export function buildDashboardStorageCardView(input: {
  language: UiLanguage
  setupCompleted?: boolean
  statusPaths?: StatusResponse["paths"]
  checks?: SetupChecksResponse
}): DashboardStorageCardView {
  const t = (korean: string, english: string) => pickDashboardStorageText(input.language, korean, english)
  const dataKnown = hasStorageSignal(input.statusPaths?.stateDir) || hasStorageSignal(input.checks?.stateDir)
  const configKnown = hasStorageSignal(input.statusPaths?.configFile) || hasStorageSignal(input.checks?.configFile)
  const setupCompleted = input.setupCompleted ?? input.checks?.setupCompleted ?? false
  return {
    title: t("로컬 저장소", "Local storage"),
    rows: [
      { label: t("상태", "Status"), value: setupCompleted ? t("사용 준비됨", "Ready") : t("설정 필요", "Needs setup") },
      { label: t("데이터", "Data"), value: dataKnown ? t("로컬에 보관됨", "Stored locally") : t("확인 필요", "Needs check") },
      { label: t("설정", "Configuration"), value: configKnown ? t("저장됨", "Saved") : t("확인 필요", "Needs check") },
      { label: t("보호", "Protection"), value: t("내부 세부 정보 숨김", "Internal details hidden") },
    ],
  }
}

export function DashboardPage() {
  const { text, displayText, language } = useUiI18n()
  const connected = useConnectionStore((state) => state.connected)
  const adapter = useConnectionStore((state) => state.adapter)
  const status = useConnectionStore((state) => state.status)
  const lastError = useConnectionStore((state) => state.lastError)
  const refreshConnection = useConnectionStore((state) => state.refresh)
  const { items, counts } = useCapabilitiesStore()
  const setupState = useSetupStore((state) => state.state)
  const draft = useSetupStore((state) => state.draft)
  const checks = useSetupStore((state) => state.checks)
  const [doctorReport, setDoctorReport] = useState<DoctorReport | null>(null)
  const [doctorError, setDoctorError] = useState<string | null>(null)
  const [doctorLoading, setDoctorLoading] = useState(false)
  const [advancedSources, setAdvancedSources] = useState<AdvancedDashboardSources>({})
  const [advancedLoadErrors, setAdvancedLoadErrors] = useState<AdvancedDashboardLoadErrors>({})
  const [advancedCardsLoading, setAdvancedCardsLoading] = useState(false)

  const capabilityCounts = status?.capabilityCounts ?? counts
  const fastResponse = status?.fast_response_health
  const ingressAckMetric = fastResponse?.metrics.find((metric) => metric.name === "ingress_ack_latency_ms")
  const contractComparisonMetric = fastResponse?.metrics.find((metric) => metric.name === "contract_ai_comparison_latency_ms")
  const enabledBackends = draft.aiBackends.filter((backend) => backend.enabled)
  const configuredBackends = draft.aiBackends.filter(
    (backend) =>
      backend.endpoint?.trim() ||
      backend.defaultModel.trim() ||
      backend.credentials.apiKey?.trim() ||
      backend.credentials.username?.trim(),
  )
  const visibleBackends = draft.aiBackends.filter(
    (backend) => backend.enabled || backend.endpoint?.trim() || backend.defaultModel.trim(),
  )
  const advancedDashboardCards = useMemo(() => buildAdvancedDashboardCards({
    draft,
    checks,
    status: advancedSources.status ?? status,
    runs: advancedSources.runs,
    operations: advancedSources.operations,
    doctor: advancedSources.doctor ?? doctorReport,
    errors: advancedLoadErrors,
    loading: advancedCardsLoading,
    language,
  }), [advancedCardsLoading, advancedLoadErrors, advancedSources, checks, doctorReport, draft, language, status])

  const primaryTargetLabel = useMemo(() => {
    const target = status?.primaryAiTarget
    if (!target) return ""
    const backend = draft.aiBackends.find((item) => item.id === target)
    return getBackendDisplayLabel(backend?.id ?? target, backend?.label, language)
  }, [draft.aiBackends, status?.primaryAiTarget])
  const storageCard = useMemo(() => buildDashboardStorageCardView({
    language,
    setupCompleted: status?.setupCompleted ?? checks?.setupCompleted,
    statusPaths: status?.paths,
    checks,
  }), [checks, language, status?.paths, status?.setupCompleted])

  useEffect(() => {
    void loadAdvancedDashboard()
  }, [])

  async function loadAdvancedDashboard() {
    setAdvancedCardsLoading(true)
    setDoctorLoading(true)
    setDoctorError(null)
    const result = await loadAdvancedDashboardSources({
      status: api.status,
      runs: async () => (await api.runs()).runs,
      operations: async () => (await api.runOperationsSummary()).summary,
      doctor: async () => (await api.doctor("quick")).report,
    }, language)
    setAdvancedSources(result.sources)
    setAdvancedLoadErrors(result.errors)
    setDoctorReport(result.sources.doctor ?? null)
    setDoctorError(result.errors.doctor ?? null)
    setDoctorLoading(false)
    setAdvancedCardsLoading(false)
  }

  async function runDoctorQuick() {
    setDoctorLoading(true)
    setDoctorError(null)
    try {
      const result = await loadAdvancedDashboardSources({
        doctor: async () => (await api.doctor("quick")).report,
      }, language)
      if (result.sources.doctor) {
        setDoctorReport(result.sources.doctor)
        setAdvancedSources((current) => ({ ...current, doctor: result.sources.doctor }))
        setAdvancedLoadErrors((current) => {
          const { doctor: _doctor, ...rest } = current
          return rest
        })
      } else if (result.errors.doctor) {
        setDoctorError(result.errors.doctor)
        setAdvancedLoadErrors((current) => ({ ...current, doctor: result.errors.doctor }))
      }
    } finally {
      setDoctorLoading(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-stone-100 p-6">
      <section className="rounded-[2rem] bg-[#171717] px-8 py-8 text-white">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">{text("대시보드", "Dashboard")}</h1>
            <div className="mt-4 grid gap-2 text-sm text-stone-300">
              <InlineStat label={text("앱 연결", "App connection")} value={connected ? text("연결됨", "Connected") : text("연결 안 됨", "Disconnected")} />
              <InlineStat label={text("연결 방식", "Connection type")} value={dashboardConnectionAdapterLabel(adapter, language)} />
              <InlineStat label={text("초기 설정", "Initial setup")} value={setupState.completed ? text("완료", "Completed") : text("미완료", "Not completed")} />
              <InlineStat label={text("현재 단계", "Current step")} value={dashboardSetupStepLabel(setupState.currentStep, language)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to={setupState.completed ? "/chat" : "/setup"}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-stone-900"
            >
              {setupState.completed ? text("채팅 열기", "Open chat") : text("초기 설정 열기", "Open initial setup")}
            </Link>
            <Link
              to="/advanced/ai"
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white"
            >
              {text("설정", "Settings")}
            </Link>
            <button
              onClick={() => { void refreshConnection(); void loadAdvancedDashboard() }}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white"
            >
              {text("새로고침", "Refresh")}
            </button>
          </div>
        </div>
        {lastError ? (
          <div className="mt-5 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{displayText(lastError)}</div>
        ) : null}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {advancedDashboardCards.map((card) => (
          <AdvancedDashboardCard key={card.id} card={card} />
        ))}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={text("준비됨", "Ready")} value={String(capabilityCounts.ready)} />
        <MetricCard label={text("비활성", "Disabled")} value={String(capabilityCounts.disabled)} />
        <MetricCard label={text("활성 AI 연결", "Active AI connections")} value={String(enabledBackends.length)} />
        <MetricCard label={text("설정된 AI 연결", "Configured AI connections")} value={String(configuredBackends.length)} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="text-sm font-semibold text-stone-900">{text("기능 상태", "Capabilities")}</div>
            <div className="mt-5 grid gap-3">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-stone-900">{item.label}</div>
                    <div className="mt-1 text-xs text-stone-500">{text("상태 신호 연결됨", "Status signal linked")}</div>
                    {item.reason ? <div className="mt-2 text-xs leading-5 text-stone-600">{displayText(item.reason)}</div> : null}
                  </div>
                  <CapabilityBadge status={item.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="text-sm font-semibold text-stone-900">{text("AI 연결", "AI connection")}</div>
            <div className="mt-5 space-y-3">
              {visibleBackends.map((backend) => (
                <div key={backend.id} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-900">{getBackendDisplayLabel(backend.id, backend.label, language)}</div>
                      <div className="mt-1 text-xs text-stone-500">{dashboardAiConnectionKindLabel(backend.kind, language)}</div>
                    </div>
                    <CapabilityBadge status={backend.status} />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-stone-600">
                    {backend.providerType ? <StatusRow label={text("AI 종류", "AI type")} value={getAIProviderDisplayLabel(backend.providerType, language)} /> : null}
                    <StatusRow label={text("연결 주소", "Connection address")} value={dashboardAiConnectionAddressLabel(backend.endpoint, language)} />
                    <StatusRow label={text("AI 모델", "AI model")} value={dashboardAiModelConfiguredLabel(backend.defaultModel, language)} />
                    <StatusRow label={text("활성화", "Enabled")} value={backend.enabled ? text("예", "Yes") : text("아니오", "No")} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <DoctorPanel
            report={doctorReport}
            loading={doctorLoading}
            error={doctorError}
            onRefresh={() => void runDoctorQuick()}
          />

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="text-sm font-semibold text-stone-900">{text("앱 상태", "App status")}</div>
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              <StatusRow label={text("버전", "Version")} value={status?.version ?? ""} />
              <StatusRow label={text("AI 공급자", "AI provider")} value={dashboardAiProviderConfiguredLabel(status?.provider, language)} />
              <StatusRow label={text("AI 모델", "AI model")} value={dashboardAiModelConfiguredLabel(status?.model, language)} />
              <StatusRow label={text("실행 시간", "Running time")} value={status ? `${status.uptime}s` : ""} />
              <StatusRow label={text("사용 가능한 외부 도구", "Available external tools")} value={status ? String(status.toolCount) : ""} />
              <StatusRow label={text("기본 대상", "Primary target")} value={primaryTargetLabel} />
              {fastResponse ? <StatusRow label={text("빠른 응답", "Fast response")} value={`${dashboardHealthStatusLabel(fastResponse.status, language)} · ${displayText(fastResponse.reason)}`} /> : null}
              {ingressAckMetric?.p95Ms != null ? <StatusRow label={text("접수 응답 시간", "Request response time")} value={`${ingressAckMetric.p95Ms}ms / ${ingressAckMetric.budgetMs}ms`} /> : null}
              {contractComparisonMetric?.p95Ms != null ? <StatusRow label={text("AI 비교 응답 시간", "AI comparison response time")} value={`${contractComparisonMetric.p95Ms}ms / ${contractComparisonMetric.budgetMs}ms`} /> : null}
              {status?.startupRecovery ? <StatusRow label={text("재시작 복구", "Startup recovery")} value={displayText(status.startupRecovery.userFacingSummary)} /> : null}
              {status?.startupRecovery?.recoveredRunCount ? <StatusRow label={text("복구된 실행", "Recovered runs")} value={String(status.startupRecovery.recoveredRunCount)} /> : null}
              {status?.startupRecovery?.interruptedScheduleRunCount ? <StatusRow label={text("중단된 예약", "Interrupted schedules")} value={String(status.startupRecovery.interruptedScheduleRunCount)} /> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="text-sm font-semibold text-stone-900">{text("초기 설정 상태", "Initial setup status")}</div>
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              <StatusRow label={text("초기 설정 완료", "Initial setup complete")} value={checks?.setupCompleted ? text("예", "Yes") : text("아니오", "No")} />
              <StatusRow label={text("텔레그램 연결 정보", "Telegram connection")} value={dashboardOptionalConnectionLabel(checks?.telegramConfigured, language)} />
              <StatusRow label={text("텔레그램 대화", "Telegram conversations")} value={draft.channels.telegramEnabled ? text("예", "Yes") : text("아니오", "No")} />
              <StatusRow label={text("기기 메시지 연결", "Device message connection")} value={draft.mqtt.enabled ? text("예", "Yes") : text("아니오", "No")} />
              <StatusRow label={text("기기 메시지 주소", "Device message host")} value={dashboardConnectionHostConfiguredLabel(draft.mqtt.host, language)} />
              <StatusRow label={text("기기 메시지 포트", "Device message port")} value={dashboardConnectionPortConfiguredLabel(draft.mqtt.port, language)} />
              <StatusRow label={text("화면 접속 주소", "Web app host")} value={dashboardConnectionHostConfiguredLabel(draft.remoteAccess.host, language)} />
              <StatusRow label={text("화면 접속 포트", "Web app port")} value={dashboardConnectionPortConfiguredLabel(draft.remoteAccess.port, language)} />
              <StatusRow label={text("화면 접속 보호", "Web app protection")} value={draft.remoteAccess.authEnabled ? text("예", "Yes") : text("아니오", "No")} />
              <StatusRow label={text("예약 실행", "Scheduled execution")} value={checks?.schedulerEnabled ? text("예", "Yes") : text("아니오", "No")} />
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="text-sm font-semibold text-stone-900">{storageCard.title}</div>
            <div className="mt-4 space-y-3 text-sm text-stone-600">
              {storageCard.rows.map((row) => (
                <StatusRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function doctorTone(status: DoctorStatus): string {
  switch (status) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700"
    case "blocked":
      return "border-red-200 bg-red-50 text-red-700"
    case "unknown":
    default:
      return "border-stone-200 bg-stone-100 text-stone-600"
  }
}

function doctorStatusLabel(status: DoctorStatus, text: (korean: string, english: string) => string): string {
  switch (status) {
    case "ok":
      return text("정상", "OK")
    case "warning":
      return text("주의", "Warning")
    case "blocked":
      return text("차단", "Blocked")
    case "unknown":
    default:
      return text("확인 필요", "Needs check")
  }
}

function doctorModeLabel(mode: DoctorMode, text: (korean: string, english: string) => string): string {
  switch (mode) {
    case "quick":
      return text("빠른 진단", "Quick check")
    case "full":
      return text("전체 진단", "Full check")
  }
}

function doctorReportRunLabel(report: DoctorReport, text: (korean: string, english: string) => string): string {
  return `${doctorModeLabel(report.mode, text)} · ${new Date(report.createdAt).toLocaleString()}`
}

function advancedCardTone(status: AdvancedDashboardCardStatus): string {
  switch (status) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "loading":
      return "border-blue-200 bg-blue-50 text-blue-700"
    case "error":
      return "border-red-200 bg-red-50 text-red-700"
    case "idle":
      return "border-stone-200 bg-stone-100 text-stone-700"
  }
}

function AdvancedDashboardCard({ card }: { card: ReturnType<typeof buildAdvancedDashboardCards>[number] }) {
  const { text, displayText } = useUiI18n()
  return (
    <Link to={card.href} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-stone-900">{card.title}</div>
          <div className="mt-2 text-3xl font-semibold text-stone-900">{card.value}</div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${advancedCardTone(card.status)}`}>
          {card.status === "loading" ? text("로딩", "Loading") : card.status === "error" ? text("오류", "Error") : card.status === "idle" ? text("대기", "Idle") : text("정상", "Ready")}
        </span>
      </div>
      <div className="mt-3 line-clamp-2 text-sm leading-6 text-stone-600">{displayText(card.summary)}</div>
      {card.items.length ? (
        <div className="mt-4 space-y-2">
          {card.items.slice(0, 3).map((item) => (
            <div key={item} className="truncate rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600" title={displayText(item)}>
              {displayText(item)}
            </div>
          ))}
        </div>
      ) : null}
    </Link>
  )
}

function DoctorPanel({ report, loading, error, onRefresh }: {
  report: DoctorReport | null
  loading: boolean
  error: string | null
  onRefresh: () => void
}) {
  const { text, displayText } = useUiI18n()
  const visibleChecks = report?.checks.filter((check) => check.status !== "ok").slice(0, 6) ?? []
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-stone-900">{text("운영 진단", "Doctor")}</div>
          <div className="mt-1 text-xs text-stone-500">
            {report ? doctorReportRunLabel(report, text) : text("아직 실행 전", "Not run yet")}
          </div>
        </div>
        <button onClick={onRefresh} disabled={loading} className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 disabled:opacity-50">
          {loading ? text("확인 중", "Checking") : text("다시 확인", "Run")}
        </button>
      </div>
      {error ? <div className="mt-4 rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700">{displayText(error)}</div> : null}
      {report ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 text-sm text-stone-600">
            <StatusRow label={text("전체 상태", "Overall")} value={doctorStatusLabel(report.overallStatus, text)} />
            <StatusRow label={text("진단 기준", "Diagnostic baseline")} value={report.runtimeManifestId ? text("연결됨", "Linked") : text("확인 필요", "Needs check")} />
            <StatusRow
              label={text("검사 결과", "Check results")}
              value={text(
                `정상 ${report.summary.ok}, 주의 ${report.summary.warning}, 차단 ${report.summary.blocked}, 확인 필요 ${report.summary.unknown}`,
                `OK ${report.summary.ok}, warning ${report.summary.warning}, blocked ${report.summary.blocked}, needs check ${report.summary.unknown}`,
              )}
            />
          </div>
          <div className="space-y-2">
            {(visibleChecks.length > 0 ? visibleChecks : report.checks.slice(0, 3)).map((check) => (
              <div key={check.name} className={`rounded-xl border px-3 py-2 text-xs leading-5 ${doctorTone(check.status)}`}>
                <div className="font-semibold">{doctorStatusLabel(check.status, text)}</div>
                <div className="mt-1">{displayText(check.message)}</div>
                {check.guide ? <div className="mt-1 text-[11px] opacity-80">{displayText(check.guide)}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-stone-900">{value}</div>
    </div>
  )
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-stone-500">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  )
}

function StatusRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
      <span className="text-stone-500">{label}</span>
      <span className={`break-all text-right font-medium text-stone-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  )
}
