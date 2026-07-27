export type RegressionFailureReason =
  | "db_runtime_not_initialized"
  | "db_runtime_instance_conflict"
  | "runtime_dependency_missing"
  | "test_tool_missing"
  | "removed_task_document_dependency"
  | "stale_static_contract"
  | "ui_projection_contract"
  | "unclassified"

export interface RegressionFailureInput {
  testFile: string
  message: string
}

export function classifyRegressionFailure(input: RegressionFailureInput): RegressionFailureReason {
  if (input.message.includes("Primary database runtime is not initialized")) {
    return "db_runtime_not_initialized"
  }
  if (input.message.includes("Primary database runtime is already initialized for another instance")) {
    return "db_runtime_instance_conflict"
  }
  if (/Cannot read properties of undefined|is not a function|runtime dependency/i.test(input.message)) {
    return "runtime_dependency_missing"
  }
  if (/spawnSync rg ENOENT|command not found: rg/.test(input.message)) {
    return "test_tool_missing"
  }
  if (/ENOENT.*\.tasks\/task\d+\.md/.test(input.message)) {
    return "removed_task_document_dependency"
  }
  if (/\.tsx$/.test(input.testFile) && !/static|source/i.test(input.testFile)) {
    return "ui_projection_contract"
  }
  if (/expected .* to (?:contain|deeply equal)|expected .* not to contain/is.test(input.message)) {
    return "stale_static_contract"
  }
  return "unclassified"
}
