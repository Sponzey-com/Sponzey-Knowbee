import { AiChatWebResearchMethodProviderAdapter } from "./web-research-method-adapter.js";
import { loadPromptSourceRegistry } from "../memory/knowbee-md.js";
export function createFileBackedWebResearchMethodProvider(input) {
    const sources = loadPromptSourceRegistry(input.workDir);
    const source = sources.find((candidate) => candidate.sourceId === "web_research_method" &&
        candidate.locale === "en" &&
        candidate.enabled);
    const instruction = sources.find((candidate) => candidate.sourceId === "web_research_method_json_instruction_user" &&
        candidate.locale === "en" &&
        candidate.enabled);
    if (!source || !instruction) {
        throw new Error("web research method prompt sources missing: " +
            [
                ...(!source ? ["web_research_method"] : []),
                ...(!instruction ? ["web_research_method_json_instruction_user"] : []),
            ].join(", "));
    }
    return new AiChatWebResearchMethodProviderAdapter({
        provider: input.provider,
        model: input.model,
        webResearchMethodPromptSourceBlock: [
            "[Web Research Method Prompt Source]",
            "",
            `sourceId: ${source.sourceId}`,
            `locale: ${source.locale}`,
            `usageScope: ${source.usageScope}`,
            `path: ${source.path}`,
            `checksum: ${source.checksum}`,
            "",
            source.content.trim(),
        ].join("\n"),
        workDir: input.workDir,
        ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
        ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
    });
}
//# sourceMappingURL=web-research-method-factory.js.map