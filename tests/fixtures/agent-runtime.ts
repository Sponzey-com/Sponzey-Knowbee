import { join } from "node:path"
import type { ArtifactStorageContext } from "../../packages/core/src/artifacts/lifecycle.ts"
import type { LlmDiagnosisProvider } from "../../packages/core/src/contracts/llm-diagnosis-provider.ts"
import type { LlmDiagnosisSchemaRepairProvider } from "../../packages/core/src/contracts/llm-diagnosis-schema-repair-provider.ts"
import type { MemoryJournalRepository } from "../../packages/core/src/memory/journal.ts"

export interface TestAgentRuntimeDependencies {
  readonly artifactStorage: ArtifactStorageContext
  readonly memoryJournal: MemoryJournalRepository
}

export interface TestResultDiagnosisDependencies {
  readonly diagnosisProvider: LlmDiagnosisProvider
  readonly diagnosisRepairProvider: LlmDiagnosisSchemaRepairProvider
}

export function createTestAgentRuntimeDependencies(rootDir: string): TestAgentRuntimeDependencies {
  const memoryJournal: MemoryJournalRepository = {
    memoryDbFile: join(rootDir, "memory.db3"),
    insert: () => "test-memory-record",
    search: () => [],
    buildContext: () => "",
    close: () => undefined,
  }
  const artifactStorage: ArtifactStorageContext = {
    rootDir: join(rootDir, "artifacts"),
    fileSystem: {
      exists: () => false,
      realpath: (path) => path,
      remove: () => undefined,
      stat: () => ({ isFile: () => false, size: 0 }),
    },
  }
  return Object.freeze({
    artifactStorage: Object.freeze(artifactStorage),
    memoryJournal: Object.freeze(memoryJournal),
  })
}

export function createTestResultDiagnosisDependencies(): TestResultDiagnosisDependencies {
  const resultDiagnosis = Object.freeze({
    diagnosis_summary: "The result is sufficient for parent aggregation.",
    sufficiency: "sufficient",
    missing_information: [],
    conflicts: [],
    risk: "none",
    risks: [],
    confidence: "high",
    recommended_action: "final_report",
    reason: "The result satisfies the expected output.",
  })
  const provider: LlmDiagnosisProvider & LlmDiagnosisSchemaRepairProvider = {
    diagnoseRequest: async () => { throw new Error("request diagnosis is not used") },
    diagnoseResult: async () => resultDiagnosis,
    repairDiagnosis: async () => resultDiagnosis,
  }
  return Object.freeze({
    diagnosisProvider: provider,
    diagnosisRepairProvider: provider,
  })
}
