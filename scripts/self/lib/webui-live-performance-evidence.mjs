export const WEBUI_LIVE_PERFORMANCE_SCHEMA_VERSION = "knowbee.webui.live-performance:v1"

export const REQUIRED_WEBUI_LIVE_PROFILE_IDS = Object.freeze([
  "mobile_cold",
  "mobile_warm",
  "desktop_cold",
  "desktop_warm",
])

const SENSITIVE_QUERY_KEY = /(token|secret|password|credential|auth|api[_-]?key)/i
const NUMERIC_QUERY_KEYS = new Set(["limit", "page", "offset"])

function compareStableText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

export function sanitizeBrowserRequest(input) {
  const request = new URL(input.requestUrl)
  const application = new URL(input.applicationOrigin)
  if (request.origin !== application.origin) return null
  const method = input.method.trim().toUpperCase() || "GET"
  const entries = [...request.searchParams.entries()].sort(([left], [right]) =>
    compareStableText(left, right),
  )
  const safeEntries = entries.map(([key, value]) => {
    if (SENSITIVE_QUERY_KEY.test(key)) return [key, "<redacted>"]
    if (NUMERIC_QUERY_KEYS.has(key) && /^\d+$/.test(value)) return [key, value]
    return [key, "<present>"]
  })
  const safeParams = new URLSearchParams()
  for (const [key, value] of safeEntries) safeParams.append(key, value)
  const safeQuery = safeParams.toString()
  const queryKeySuffix =
    safeEntries.length > 0
      ? `?${safeEntries.map(([key, value]) => `${key}=${value}`).join("&")}`
      : ""
  return {
    method,
    safePath: `${request.pathname}${safeQuery ? `?${safeQuery}` : ""}`,
    queryKey: `${method} ${request.pathname}${queryKeySuffix}`,
    startMs: Math.round(input.startMs * 1_000) / 1_000,
  }
}

function validMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") return false
  return [
    metrics.domContentLoadedMs,
    metrics.firstContentfulPaintMs,
    metrics.lcpMs,
    metrics.cls,
  ].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
}

export function buildWebUiLivePerformanceEvidence(input) {
  const diagnostics = []
  const profileCounts = new Map()
  for (const sample of input.samples) {
    profileCounts.set(sample.profileId, (profileCounts.get(sample.profileId) ?? 0) + 1)
  }
  for (const [profileId, count] of profileCounts) {
    if (count > 1) diagnostics.push({ profileId, reasonCode: "profile_duplicated" })
  }
  for (const profileId of REQUIRED_WEBUI_LIVE_PROFILE_IDS) {
    if (!profileCounts.has(profileId))
      diagnostics.push({ profileId, reasonCode: "required_profile_missing" })
  }
  for (const sample of input.samples) {
    if (sample.kind === "collected" && !validMetrics(sample.metrics)) {
      diagnostics.push({ profileId: sample.profileId, reasonCode: "profile_metrics_invalid" })
    }
  }
  diagnostics.sort(
    (left, right) =>
      compareStableText(left.profileId, right.profileId) ||
      compareStableText(left.reasonCode, right.reasonCode),
  )

  const unavailable = input.samples.some((sample) => sample.kind === "unavailable")
  return {
    schemaVersion: WEBUI_LIVE_PERFORMANCE_SCHEMA_VERSION,
    buildIdentity: input.buildIdentity,
    status: diagnostics.length > 0 ? "invalid" : unavailable ? "partial" : "collected",
    diagnostics,
    samples: [...input.samples],
  }
}

export function compareLiveRequestsToStaticBaseline(input) {
  const diagnostics = []
  const expected = new Set(input.expectedQueryKeys)
  const observedCounts = new Map()
  for (const request of input.observedRequests) {
    observedCounts.set(request.queryKey, (observedCounts.get(request.queryKey) ?? 0) + 1)
  }
  for (const [queryKey, count] of [...observedCounts].sort(([left], [right]) =>
    compareStableText(left, right),
  )) {
    if (count > 1) diagnostics.push({ queryKey, reasonCode: "live_query_duplicated" })
  }
  for (const queryKey of [...observedCounts.keys()]
    .filter((key) => !expected.has(key))
    .sort(compareStableText)) {
    diagnostics.push({ queryKey, reasonCode: "live_query_observed_only" })
  }
  for (const queryKey of [...expected]
    .filter((key) => !observedCounts.has(key))
    .sort(compareStableText)) {
    diagnostics.push({ queryKey, reasonCode: "static_query_expected_only" })
  }
  return { ok: diagnostics.length === 0, diagnostics }
}

export function evaluateCanonicalRoutePerformance(input) {
  const issues = []
  const { budget, sample } = input
  if (sample.metrics.lcpMs > 2_500) issues.push({ code: "lcp_budget_exceeded" })
  if (sample.metrics.cls > 0.1) issues.push({ code: "cls_budget_exceeded" })
  if (sample.metrics.usableMs > 800) issues.push({ code: "usable_budget_exceeded" })
  if (sample.metrics.maxLongTaskMs > 50) issues.push({ code: "long_task_budget_exceeded" })
  if (sample.horizontalOverflow) issues.push({ code: "horizontal_overflow" })

  const criticalRequests = sample.requests.filter((request) =>
    budget.criticalApiAllowlist.some(
      (allowed) => request.safePath === allowed || request.safePath.startsWith(`${allowed}?`),
    ),
  )
  if (criticalRequests.length > budget.maxCriticalRequests) {
    issues.push({ code: "critical_request_budget_exceeded" })
  }
  for (const request of sample.requests) {
    if (budget.forbiddenOwnerPatterns.some((pattern) => request.safePath.startsWith(pattern))) {
      issues.push({ code: "forbidden_owner_requested" })
      break
    }
  }
  return { ok: issues.length === 0, issues }
}
