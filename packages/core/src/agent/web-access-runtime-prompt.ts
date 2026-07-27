import { loadBundledPromptTemplate, loadPromptTemplate } from "../memory/knowbee-md.js"

export function buildWebAccessRuntimePrompt(workDir: string): string {
  return [
    loadPromptTemplate({ sourceId: "web_access_policy_runtime", workDir }),
    loadBundledPromptTemplate({ sourceId: "web_access_policy_contract_v2" }),
  ].join("\n\n")
}
