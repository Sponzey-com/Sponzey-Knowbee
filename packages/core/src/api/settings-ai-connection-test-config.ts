import type {
  AIConnectionConfig,
  AIConnectionProvider,
  KnowbeeConfig,
} from "../config/types.js"

export interface SettingsAiConnectionTestInput {
  readonly providerType?: string
  readonly authMode?: string
  readonly endpoint?: string
  readonly defaultModel?: string
  readonly credentials?: {
    readonly apiKey?: string
    readonly username?: string
    readonly password?: string
    readonly oauthAuthFilePath?: string
  }
}

const PROVIDERS = new Set<AIConnectionProvider>([
  "openai",
  "anthropic",
  "gemini",
  "ollama",
  "llama",
  "custom",
])

export function buildSettingsAiConnectionTestConfig(
  base: KnowbeeConfig,
  input: SettingsAiConnectionTestInput,
): KnowbeeConfig {
  const provider = input.providerType?.trim() as AIConnectionProvider
  const model = input.defaultModel?.trim() ?? ""
  if (!PROVIDERS.has(provider) || !provider) throw new Error("ai_test_provider_required")
  if (!model) throw new Error("ai_test_model_required")

  const authMode = input.authMode === "chatgpt_oauth" ? "chatgpt_oauth" : "api_key"
  const saved = base.ai.connection
  const inheritSavedAuth =
    saved.provider === provider && (saved.auth?.mode ?? "api_key") === authMode
  const credentials = input.credentials ?? {}
  const auth: NonNullable<AIConnectionConfig["auth"]> = {
    ...(inheritSavedAuth ? saved.auth : {}),
    mode: authMode,
    ...(credentials.apiKey?.trim() ? { apiKey: credentials.apiKey.trim() } : {}),
    ...(credentials.username?.trim() ? { username: credentials.username.trim() } : {}),
    ...(credentials.password?.trim() ? { password: credentials.password.trim() } : {}),
    ...(credentials.oauthAuthFilePath?.trim()
      ? { oauthAuthFilePath: credentials.oauthAuthFilePath.trim() }
      : {}),
  }
  const endpoint = input.endpoint?.trim()
  return {
    ...base,
    ai: {
      connection: {
        provider,
        model,
        ...(endpoint ? { endpoint } : {}),
        auth,
      },
    },
  }
}
