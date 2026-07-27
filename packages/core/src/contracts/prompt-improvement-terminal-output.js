export const PROMPT_IMPROVEMENT_TERMINAL_OUTPUT_FIELDS = [
    "state", "inspectedPromptSources", "changedPromptSources", "changeReason", "invariantsChecked",
    "testsPassed", "testsFailed", "activeNow", "reloadOrRestartRequired", "rollbackPath", "promptChanged", "noChangeStatement",
];
const clean = (values) => values.map((v) => v.trim()).filter(Boolean);
export function authorizePromptImprovementTerminalOutput(facts) {
    const inspected = clean(facts.inspectedPromptSources);
    const changed = clean(facts.changedPromptSources);
    const invariants = clean(facts.invariantsChecked);
    const passed = clean(facts.testsPassed);
    const failed = clean(facts.testsFailed);
    if (!inspected.length || !facts.changeReason.trim() || !invariants.length || (!passed.length && !failed.length) || !facts.rollbackPath.trim()) {
        return { status: "blocked", reasonCode: "terminal_output_incomplete" };
    }
    if (changed.some((source) => !inspected.includes(source)))
        return { status: "blocked", reasonCode: "terminal_output_source_mismatch" };
    if ((facts.activeNow && facts.reloadOrRestartRequired) || (facts.state === "rolled_back" && facts.activeNow)) {
        return { status: "blocked", reasonCode: "terminal_output_state_mismatch" };
    }
    if (facts.promptChanged !== (changed.length > 0) || (!facts.promptChanged && !facts.noChangeStatement.trim())) {
        return { status: "blocked", reasonCode: "no_change_statement_missing" };
    }
    return { status: "authorized", facts: { ...facts, inspectedPromptSources: inspected, changedPromptSources: changed, invariantsChecked: invariants, testsPassed: passed, testsFailed: failed } };
}
export async function renderAuthorizedPromptImprovementTerminalOutput(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    if (!input.userLanguage.trim())
        return { status: "blocked", reasonCode: "terminal_output_incomplete" };
    return { status: "rendered", text: await input.renderWithLlm(input.decision.facts, input.userLanguage) };
}
//# sourceMappingURL=prompt-improvement-terminal-output.js.map