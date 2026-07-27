import { loadPromptTemplate, type PromptTemplateVariables } from "./knowbee-md.js"

export function loadPromptValue(
  sourceId: string,
  variables: PromptTemplateVariables = {},
  options: { required?: boolean; workDir?: string; locale?: "ko" | "en" } = {},
): string {
  const template = loadPromptTemplate({
    sourceId,
    variables,
    ...(options.workDir === undefined ? {} : { workDir: options.workDir }),
    ...(options.locale === undefined ? {} : { locale: options.locale }),
  })
  const value = template.match(/(?:^|\n)## Value\s*\n([\s\S]*?)(?=\n## |$)/iu)?.[1]?.trim()
  if (value) return value
  if (options.required) throw new Error(`prompt value section missing: ${sourceId}`)
  return template.trim()
}
