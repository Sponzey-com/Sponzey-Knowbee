import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { mkdirSync } from "node:fs"

const OPENAI_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token"
const DEFAULT_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const REFRESH_HEADROOM_SECONDS = 300
export interface OpenAICodexOAuthEnvironmentSnapshot {
  codexHome: string
  clientId: string
}

export function createOpenAICodexOAuthEnvironmentSnapshot(
  env: Readonly<Record<string, string | undefined>>,
): OpenAICodexOAuthEnvironmentSnapshot {
  return Object.freeze({
    codexHome: env["CODEX_HOME"]?.trim() || "",
    clientId: env["CODEX_CLIENT_ID"]?.trim() || "",
  })
}

const OPENAI_CODEX_OAUTH_ENV = createOpenAICodexOAuthEnvironmentSnapshot(process.env)
export const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
export const OPENAI_CODEX_RESPONSES_PATH = "/responses"
export const OPENAI_CODEX_MODELS_PATH = "/models"
export const OPENAI_CODEX_USER_AGENT = "Codex-Code/1.0.43"
export const OPENAI_CODEX_CLIENT_VERSION = OPENAI_CODEX_USER_AGENT.split("/")[1] ?? "1.0.43"
export const OPENAI_CODEX_KNOWN_MODELS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
] as const

export function buildOpenAICodexModelsUrl(
  baseUrl: string,
  clientVersion = OPENAI_CODEX_CLIENT_VERSION,
): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  const query = new URLSearchParams({ client_version: clientVersion })
  return `${normalized}${OPENAI_CODEX_MODELS_PATH}?${query.toString()}`
}

export function parseOpenAICodexModels(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return []
  const rows = Array.isArray((payload as { models?: unknown }).models)
    ? (payload as { models: unknown[] }).models
    : []
  const models = rows
    .map((row) => {
      if (typeof row === "string") return row.trim()
      if (!row || typeof row !== "object") return ""
      const value = (row as { slug?: unknown; id?: unknown; model?: unknown }).slug
        ?? (row as { id?: unknown }).id
        ?? (row as { model?: unknown }).model
      return typeof value === "string" ? value.trim() : ""
    })
    .filter((value) => value.length > 0)
  return [...new Set(models)]
}

interface DecodedJwtPayload {
  exp?: number
  client_id?: string
  aud?: string[] | string
}

interface CodexAuthFile {
  auth_mode?: string | null
  OPENAI_API_KEY?: string | null
  tokens?: {
    id_token?: string | null
    access_token?: string | null
    refresh_token?: string | null
    account_id?: string | null
  }
  last_refresh?: string | null
}

export interface OpenAICodexOAuthConfig {
  authFilePath?: string | undefined
  clientId?: string | undefined
  codexHome?: string | undefined
}

export interface OpenAICodexAccessToken {
  accessToken: string
  authFilePath: string
  expiresAt?: number | undefined
}

export function resolveOpenAICodexBaseUrl(baseUrl?: string | undefined): string {
  const normalized = baseUrl?.trim()
  if (!normalized) return OPENAI_CODEX_BASE_URL
  const trimmed = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
  const withoutResponses = trimmed.endsWith(OPENAI_CODEX_RESPONSES_PATH)
    ? trimmed.slice(0, -OPENAI_CODEX_RESPONSES_PATH.length)
    : trimmed
  try {
    const parsed = new URL(withoutResponses)
    if (parsed.hostname === "api.openai.com" || parsed.hostname.endsWith(".openai.com")) {
      return OPENAI_CODEX_BASE_URL
    }
  } catch {
    // Preserve custom non-URL values so the caller can report the configuration error.
  }
  return withoutResponses
}

function expandHome(value: string): string {
  if (value === "~") return homedir()
  if (value.startsWith("~/")) return join(homedir(), value.slice(2))
  return value
}

export function resolveOpenAICodexAuthFilePath(
  config?: OpenAICodexOAuthConfig,
  envSnapshot: OpenAICodexOAuthEnvironmentSnapshot = OPENAI_CODEX_OAUTH_ENV,
): string {
  const configured = config?.authFilePath?.trim()
  if (configured) return expandHome(configured)

  const codexHome = config?.codexHome?.trim() || envSnapshot.codexHome
  if (codexHome) return join(expandHome(codexHome), "auth.json")

  return join(homedir(), ".codex", "auth.json")
}

export function hasOpenAICodexAuthFile(config?: OpenAICodexOAuthConfig): boolean {
  return existsSync(resolveOpenAICodexAuthFilePath(config))
}

function decodeJwtPayload(token: string): DecodedJwtPayload {
  const [, payload] = token.split(".")
  if (!payload) return {}
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as DecodedJwtPayload
  } catch {
    return {}
  }
}

function tokenExpiresAt(token: string | undefined | null): number | undefined {
  if (!token) return undefined
  const payload = decodeJwtPayload(token)
  return typeof payload.exp === "number" ? payload.exp : undefined
}

function shouldRefreshToken(accessToken: string | undefined | null, forceRefresh = false): boolean {
  if (!accessToken) return true
  if (forceRefresh) return true
  const exp = tokenExpiresAt(accessToken)
  if (!exp) return false
  return exp - Math.floor(Date.now() / 1000) <= REFRESH_HEADROOM_SECONDS
}

function inferClientId(config: OpenAICodexOAuthConfig | undefined, authFile: CodexAuthFile): string {
  const configured = config?.clientId?.trim()
  if (configured) return configured

  const accessPayload = decodeJwtPayload(authFile.tokens?.access_token ?? "")
  if (typeof accessPayload.client_id === "string" && accessPayload.client_id.trim()) {
    return accessPayload.client_id.trim()
  }
  if (Array.isArray(accessPayload.aud) && typeof accessPayload.aud[0] === "string" && accessPayload.aud[0].trim()) {
    return accessPayload.aud[0].trim()
  }
  if (typeof accessPayload.aud === "string" && accessPayload.aud.trim()) {
    return accessPayload.aud.trim()
  }

  const idPayload = decodeJwtPayload(authFile.tokens?.id_token ?? "")
  if (Array.isArray(idPayload.aud) && typeof idPayload.aud[0] === "string" && idPayload.aud[0].trim()) {
    return idPayload.aud[0].trim()
  }
  if (typeof idPayload.aud === "string" && idPayload.aud.trim()) {
    return idPayload.aud.trim()
  }

  return OPENAI_CODEX_OAUTH_ENV.clientId || DEFAULT_CODEX_CLIENT_ID
}

function readCodexAuthFile(config?: OpenAICodexOAuthConfig): { authFilePath: string; authFile: CodexAuthFile } {
  const authFilePath = resolveOpenAICodexAuthFilePath(config)
  if (!existsSync(authFilePath)) {
    throw new Error(`ChatGPT OAuth 인증 파일을 찾지 못했습니다: ${authFilePath}`)
  }

  const raw = readFileSync(authFilePath, "utf-8")
  const authFile = JSON.parse(raw) as CodexAuthFile
  return { authFilePath, authFile }
}

async function refreshAccessToken(config: OpenAICodexOAuthConfig | undefined, authFilePath: string, authFile: CodexAuthFile): Promise<CodexAuthFile> {
  const refreshToken = authFile.tokens?.refresh_token?.trim()
  if (!refreshToken) {
    throw new Error("ChatGPT OAuth refresh token이 없습니다. 먼저 `codex login`을 다시 실행해 주세요.")
  }

  const clientId = inferClientId(config, authFile)
  const response = await fetch(OPENAI_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  })

  const payload = await response.json().catch(() => ({})) as {
    access_token?: string
    refresh_token?: string
    id_token?: string
    error?: string
    error_description?: string
  }

  if (!response.ok || !payload.access_token) {
    const description = payload.error_description?.trim() || payload.error?.trim() || `${response.status} ${response.statusText}`
    throw new Error(`ChatGPT OAuth 토큰 갱신에 실패했습니다: ${description}`)
  }

  const nextAuthFile: CodexAuthFile = {
    ...authFile,
    auth_mode: authFile.auth_mode ?? "chatgpt",
    tokens: {
      ...authFile.tokens,
      access_token: payload.access_token,
      refresh_token: payload.refresh_token ?? authFile.tokens?.refresh_token ?? null,
      id_token: payload.id_token ?? authFile.tokens?.id_token ?? null,
    },
    last_refresh: new Date().toISOString(),
  }

  mkdirSync(dirname(authFilePath), { recursive: true })
  writeFileSync(authFilePath, JSON.stringify(nextAuthFile, null, 2), "utf-8")
  return nextAuthFile
}

export async function readOpenAICodexAccessToken(
  config?: OpenAICodexOAuthConfig,
  options?: { forceRefresh?: boolean },
): Promise<OpenAICodexAccessToken> {
  const { authFilePath, authFile } = readCodexAuthFile(config)
  let working = authFile
  let accessToken = working.tokens?.access_token?.trim() ?? ""

  if (shouldRefreshToken(accessToken, options?.forceRefresh ?? false)) {
    working = await refreshAccessToken(config, authFilePath, working)
    accessToken = working.tokens?.access_token?.trim() ?? ""
  }

  if (!accessToken) {
    throw new Error("ChatGPT OAuth access token이 없습니다. 먼저 `codex login`을 다시 실행해 주세요.")
  }

  return {
    accessToken,
    authFilePath,
    expiresAt: tokenExpiresAt(accessToken),
  }
}
