import type { AIProvider, ChatParams } from "../ai/types.js"
import type { LlmDiagnosisProvider } from "../contracts/llm-diagnosis-provider.js"
import type { LlmDiagnosisSchemaRepairProvider } from "../contracts/llm-diagnosis-schema-repair-provider.js"
import { redactLogText } from "../logger/index.js"
import { createFileBackedDiagnosisProvider } from "../orchestration/prompt-policy-adapter.js"

export interface RuntimeDiagnosisProviderPair {
  diagnosisProvider: LlmDiagnosisProvider
  diagnosisRepairProvider: LlmDiagnosisSchemaRepairProvider
}

export interface RuntimeDiagnosisProviderFactoryInput {
  provider: AIProvider
  model: string
  workDir: string
  observabilityContext?: Pick<
    NonNullable<ChatParams["observability"]>,
    "runId" | "requestGroupId" | "sessionId"
  >
}

export type RuntimeDiagnosisProviderFactory = (
  input: RuntimeDiagnosisProviderFactoryInput,
) => RuntimeDiagnosisProviderPair

export type RuntimeDiagnosisProviderReasonCode =
  | "provider_missing"
  | "model_missing"
  | "diagnosis_provider_factory_failed"

export type RuntimeDiagnosisProviderResolution =
  | {
      status: "ready"
      diagnosisProvider: LlmDiagnosisProvider
      diagnosisRepairProvider: LlmDiagnosisSchemaRepairProvider
      fieldDebugEvent: string
    }
  | {
      status: "skipped"
      reasonCode: Exclude<RuntimeDiagnosisProviderReasonCode, "diagnosis_provider_factory_failed">
      fieldDebugEvent: string
    }
  | {
      status: "unavailable"
      reasonCode: "diagnosis_provider_factory_failed"
      fieldDebugEvent: string
    }

export interface CreateRuntimeDiagnosisProviderPairInput {
  provider?: AIProvider | undefined
  model?: string | undefined
  workDir: string
  factory?: RuntimeDiagnosisProviderFactory | undefined
  observabilityContext?: RuntimeDiagnosisProviderFactoryInput["observabilityContext"]
}

function defaultRuntimeDiagnosisProviderFactory(
  input: RuntimeDiagnosisProviderFactoryInput,
): RuntimeDiagnosisProviderPair {
  const adapter = createFileBackedDiagnosisProvider(input)
  return {
    diagnosisProvider: adapter,
    diagnosisRepairProvider: adapter,
  }
}

function safeReasonDetail(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : String(error ?? "unknown_error")
  return redactLogText(message).replace(/\s+/g, "_").slice(0, 120)
}

function fieldDebugEvent(
  status: RuntimeDiagnosisProviderResolution["status"],
  reasonCode?: RuntimeDiagnosisProviderReasonCode,
  detail?: string,
): string {
  return ["runtime_diagnosis_provider", status, reasonCode, detail].filter(Boolean).join(":")
}

export function createRuntimeDiagnosisProviderPair(
  input: CreateRuntimeDiagnosisProviderPairInput,
): RuntimeDiagnosisProviderResolution {
  if (!input.provider) {
    return {
      status: "skipped",
      reasonCode: "provider_missing",
      fieldDebugEvent: fieldDebugEvent("skipped", "provider_missing"),
    }
  }

  const model = input.model?.trim()
  if (!model) {
    return {
      status: "skipped",
      reasonCode: "model_missing",
      fieldDebugEvent: fieldDebugEvent("skipped", "model_missing"),
    }
  }

  try {
    const factory = input.factory ?? defaultRuntimeDiagnosisProviderFactory
    const pair = factory({
      provider: input.provider,
      model,
      workDir: input.workDir,
      ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
    })
    return {
      status: "ready",
      diagnosisProvider: pair.diagnosisProvider,
      diagnosisRepairProvider: pair.diagnosisRepairProvider,
      fieldDebugEvent: fieldDebugEvent("ready"),
    }
  } catch (error) {
    return {
      status: "unavailable",
      reasonCode: "diagnosis_provider_factory_failed",
      fieldDebugEvent: fieldDebugEvent(
        "unavailable",
        "diagnosis_provider_factory_failed",
        safeReasonDetail(error),
      ),
    }
  }
}
