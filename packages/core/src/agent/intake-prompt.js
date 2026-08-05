import { createHash } from "node:crypto";
import { loadPromptTemplate } from "../memory/knowbee-md.js";
function promptSha256(value) {
    return createHash("sha256").update(value).digest("hex");
}
export function buildTaskIntakeSystemPrompt(options = {}) {
    const maxDelegationTurns = options.maxDelegationTurns ?? 0;
    return loadPromptTemplate({
        sourceId: "task_intake",
        workDir: options.workDir,
        locale: options.locale ?? "en",
        variables: { maxDelegationTurns },
    });
}
export function buildTaskIntakeFirstResponseSystemPrompt(options) {
    return buildTaskIntakeFirstResponsePromptAssembly(options).systemPrompt;
}
export function buildTaskIntakeFirstResponsePromptAssembly(options) {
    const variables = {
        maxDelegationTurns: options.maxDelegationTurns ?? 0,
        mainAgentName: options.mainAgentName,
        productName: options.productName,
        productNameKo: options.productNameKo,
    };
    const load = (sourceId) => loadPromptTemplate({
        sourceId,
        workDir: options.workDir,
        locale: options.locale ?? "en",
        variables,
    });
    const taskIntakePrompt = load("task_intake");
    const finalResponsePrompt = load("final_response");
    const systemPrompt = [
        load("system"),
        load("identity"),
        options.identityContext?.trim(),
        taskIntakePrompt,
        finalResponsePrompt,
    ]
        .filter((part) => Boolean(part))
        .join("\n\n---\n\n");
    return {
        systemPrompt,
        taskIntakePromptSha256: promptSha256(taskIntakePrompt),
        finalResponsePromptSha256: promptSha256(finalResponsePrompt),
    };
}
//# sourceMappingURL=intake-prompt.js.map