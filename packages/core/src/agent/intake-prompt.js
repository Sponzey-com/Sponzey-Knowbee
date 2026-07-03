import { loadPromptTemplate } from "../memory/knowbee-md.js";
export function buildTaskIntakeSystemPrompt(options = {}) {
    const maxDelegationTurns = options.maxDelegationTurns ?? 0;
    return loadPromptTemplate({
        sourceId: "task_intake",
        workDir: options.workDir,
        locale: options.locale ?? "en",
        variables: { maxDelegationTurns },
    });
}
//# sourceMappingURL=intake-prompt.js.map