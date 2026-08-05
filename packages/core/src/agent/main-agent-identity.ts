import type { KnowbeeConfig } from "../config/types.js"
import { detectPrimaryMessageLanguage } from "../channels/language.js"
import { loadPromptTemplate, type PromptTemplateVariables } from "../memory/knowbee-md.js"
import {
  DEFAULT_MAIN_AGENT_NAME_EN,
  DEFAULT_MAIN_AGENT_NAME_KO,
  KNOWBEE_PRODUCT_NAME,
  KNOWBEE_PRODUCT_NAME_KO,
} from "../contracts/product-identity.js"

export {
  DEFAULT_MAIN_AGENT_NAME_EN,
  DEFAULT_MAIN_AGENT_NAME_KO,
  KNOWBEE_PRODUCT_NAME,
  KNOWBEE_PRODUCT_NAME_KO,
} from "../contracts/product-identity.js"
function normalize(value: string | undefined): string {
  return value?.trim() ?? ""
}

function resolveConfiguredMainAgentSelfName(config: KnowbeeConfig): string {
  return normalize(config.orchestration.knowbee?.agentName)
}

export function resolvePromptLocale(language: string | undefined): "ko" | "en" {
  return normalize(language).toLowerCase().startsWith("ko") ? "ko" : "en"
}

export function resolvePromptLocaleForRequest(language: string | undefined, userMessage: string | undefined): "ko" | "en" {
  const message = normalize(userMessage)
  const requestLanguage = detectPrimaryMessageLanguage(message)
  if (requestLanguage === "ko" || requestLanguage === "en") return requestLanguage
  return resolvePromptLocale(language)
}

export function defaultMainAgentNameForLanguage(language: string | undefined): string {
  return resolvePromptLocale(language) === "ko" ? DEFAULT_MAIN_AGENT_NAME_KO : DEFAULT_MAIN_AGENT_NAME_EN
}

export function resolveMainAgentSelfName(config: KnowbeeConfig, languageOverride?: string): string {
  return resolveConfiguredMainAgentSelfName(config)
    || defaultMainAgentNameForLanguage(languageOverride ?? config.profile.language)
}

export function buildMainAgentPromptVariables(config: KnowbeeConfig, languageOverride?: string): PromptTemplateVariables {
  const mainAgentName = resolveMainAgentSelfName(config, languageOverride)
  return {
    mainAgentName,
    productName: KNOWBEE_PRODUCT_NAME,
    productNameKo: KNOWBEE_PRODUCT_NAME_KO,
    profileLanguage: normalize(config.profile.language),
  }
}

export function buildMainAgentIdentityPromptContext(
  config: KnowbeeConfig,
  languageOverride: string | undefined,
  workDir: string,
): string {
  return loadPromptTemplate({
    sourceId: "runtime_identity_context",
    workDir,
    variables: buildMainAgentPromptVariables(config, languageOverride),
  })
}
