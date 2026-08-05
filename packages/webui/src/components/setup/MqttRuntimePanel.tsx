import React from "react"
import type { MqttRuntimeResponse } from "../../api/client"
import { useUiI18n } from "../../lib/ui-i18n"

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString()
}

function toneClassForState(state: string | null) {
  const normalized = (state ?? "").toLowerCase()
  if (normalized === "ready" || normalized === "online" || normalized === "connected") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (normalized === "error" || normalized === "auth_failed" || normalized === "disconnected") {
    return "border-red-200 bg-red-50 text-red-700"
  }
  return "border-stone-200 bg-stone-100 text-stone-600"
}

function stateLabel(state: string | null, text: (ko: string, en: string) => string): string {
  const normalized = (state ?? "").toLowerCase()
  if (normalized === "ready" || normalized === "online" || normalized === "connected") return text("연결됨", "Connected")
  if (normalized === "error" || normalized === "auth_failed") return text("확인 필요", "Needs check")
  if (normalized === "disconnected") return text("연결 끊김", "Disconnected")
  return text("상태 확인 필요", "Status needs check")
}

function countSupportedCapabilities(matrix: Record<string, unknown> | undefined): { supported: number; total: number } | null {
  if (!matrix) return null
  const entries = Object.values(matrix)
  if (entries.length === 0) return { supported: 0, total: 0 }
  return {
    supported: entries.filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false
      return (entry as Record<string, unknown>).supported !== false
    }).length,
    total: entries.length,
  }
}

function summarizePayload(payload: unknown, text: (ko: string, en: string) => string): string {
  if (!payload || typeof payload !== "object") return text("데이터 기록됨", "Data recorded")
  if (Array.isArray(payload)) return text(`데이터 ${payload.length}개 기록됨`, `${payload.length} data items recorded`)
  const fieldCount = Object.keys(payload as Record<string, unknown>).length
  return fieldCount > 0
    ? text(`데이터 필드 ${fieldCount}개 기록됨`, `${fieldCount} data fields recorded`)
    : text("빈 데이터 기록됨", "Empty data recorded")
}

export function MqttRuntimePanel({
  runtime,
  loading,
  error,
  disconnectingExtensionId,
  onRefresh,
  onDisconnect,
}: {
  runtime: MqttRuntimeResponse | null
  loading: boolean
  error: string
  disconnectingExtensionId: string | null
  onRefresh: () => void
  onDisconnect: (extensionId: string) => void
}) {
  const { text, displayText } = useUiI18n()
  const extensions = runtime?.extensions ?? []
  const logs = runtime?.logs ?? []

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">{text("연결된 연장", "Connected Extensions")}</h3>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {text("브로커에 현재 연결되어 있는 연장과 상태를 확인합니다.", "Check extensions currently connected to the broker and their status.")}
            </p>
          </div>
          <button
            onClick={onRefresh}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
          >
            {text("새로고침", "Refresh")}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {displayText(error)}
          </div>
        ) : null}

        {loading && !runtime ? (
          <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
            {text("MQTT 연결 상태를 불러오는 중입니다.", "Loading MQTT runtime status.")}
          </div>
        ) : null}

        {!loading && extensions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
            {text("현재 브로커에 연결된 연장이 없습니다.", "No extensions are currently connected to the broker.")}
          </div>
        ) : null}

        {extensions.length > 0 ? (
          <div className="mt-4 space-y-3">
            {extensions.map((extension) => {
              const methods = Array.isArray(extension.methods) ? extension.methods : []
              const methodCount = methods.length > 0
                ? methods.length
                : typeof (extension as { methodCount?: unknown }).methodCount === "number"
                  ? (extension as { methodCount: number }).methodCount
                  : 0
              return (
                <div key={extension.extensionId} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-stone-900">
                          {extension.displayName?.trim() || text("이름 없는 연장", "Unnamed extension")}
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${toneClassForState(extension.state)}`}>
                          {stateLabel(extension.state, text)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        {extension.clientId ? text("연동 기준 확인됨", "Connection baseline verified") : text("연동 기준 확인 필요", "Connection baseline needs check")}
                        {extension.version ? ` · ${text("앱 버전 기록됨", "App version recorded")}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">
                        {extension.platform || extension.os || extension.arch
                          ? `${text("운영체제", "Operating system")}: ${displayText([extension.platform, extension.os].filter(Boolean).join("/") || extension.arch || "")}`
                          : text("운영체제 정보 없음", "No operating system info")}
                        {extension.capabilityHash ? ` · ${text("기능 기준 연결됨", "Capability baseline linked")}` : ""}
                      </div>
                      {extension.message ? (
                        <div className="mt-2 text-sm text-stone-700">{displayText(extension.message)}</div>
                      ) : null}
                      <div className="mt-2 text-xs text-stone-500">
                        {text("마지막 수신", "Last seen")}: {formatTimestamp(extension.lastSeenAt)}
                        {extension.lastCapabilityRefreshAt ? ` · ${text("기능 갱신", "Capabilities")}: ${formatTimestamp(extension.lastCapabilityRefreshAt)}` : ""}
                      </div>
                      {(() => {
                        const counts = countSupportedCapabilities(extension.capabilityMatrix)
                        return counts ? (
                          <div className="mt-2 text-xs text-stone-500">
                            {text("지원 기능", "Supported capabilities")}: {counts.supported}/{counts.total}
                          </div>
                        ) : null
                      })()}
                      {methodCount > 0 ? (
                        <div className="mt-2 text-xs text-stone-500">
                          {text("실행 기능", "Runnable features")}: {methodCount}
                        </div>
                      ) : null}
                      {methods.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-full bg-stone-200 px-2 py-1 text-[11px] font-medium text-stone-700">
                            {text("기능 목록 기록됨", "Feature list recorded")}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <button
                      onClick={() => onDisconnect(extension.extensionId)}
                      disabled={disconnectingExtensionId === extension.extensionId}
                      className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {disconnectingExtensionId === extension.extensionId
                        ? text("해지 중...", "Disconnecting...")
                        : text("연동 해지", "Disconnect")}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">{text("연장 연동 기록", "Extension exchange history")}</h3>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {text("브로커를 통해 오간 최근 요청과 응답을 요약해서 보여줍니다.", "Shows a summary of recent requests and responses exchanged through the broker.")}
          </p>
        </div>

        {logs.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
            {text("아직 기록된 연장 연동 기록이 없습니다.", "There is no recorded extension exchange history yet.")}
          </div>
        ) : (
          <div className="mt-4 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
            {logs.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-stone-200 px-2 py-1 font-semibold text-stone-700">
                      {entry.direction === "knowbee_to_extension"
                        ? text("Knowbee → 연장", "Knowbee → Extension")
                        : text("연장 → Knowbee", "Extension → Knowbee")}
                    </span>
                    <span>{formatTimestamp(entry.timestamp)}</span>
                    <span>{entry.topic ? text("전송 경로 기록됨", "Route recorded") : text("전송 경로 없음", "No route recorded")}</span>
                  </div>
                  {entry.extensionId ? <span>{text("연장 기준 연결됨", "Extension baseline linked")}</span> : null}
                </div>
                <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-stone-600">
                  {summarizePayload(entry.payload, text)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
