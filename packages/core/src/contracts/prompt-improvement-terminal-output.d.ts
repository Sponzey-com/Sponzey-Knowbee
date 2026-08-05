export declare const PROMPT_IMPROVEMENT_TERMINAL_OUTPUT_FIELDS: readonly ["state", "inspectedPromptSources", "changedPromptSources", "changeReason", "invariantsChecked", "testsPassed", "testsFailed", "activeNow", "reloadOrRestartRequired", "rollbackPath", "promptChanged", "noChangeStatement"];
export interface PromptImprovementTerminalOutputFacts {
    state: "completed" | "blocked" | "rolled_back";
    inspectedPromptSources: string[];
    changedPromptSources: string[];
    changeReason: string;
    invariantsChecked: string[];
    testsPassed: string[];
    testsFailed: string[];
    activeNow: boolean;
    reloadOrRestartRequired: boolean;
    rollbackPath: string;
    promptChanged: boolean;
    noChangeStatement: string;
}
export type PromptImprovementTerminalOutputDecision = {
    status: "authorized";
    facts: PromptImprovementTerminalOutputFacts;
} | {
    status: "blocked";
    reasonCode: "terminal_output_incomplete" | "terminal_output_source_mismatch" | "terminal_output_state_mismatch" | "no_change_statement_missing";
};
export declare function authorizePromptImprovementTerminalOutput(facts: PromptImprovementTerminalOutputFacts): PromptImprovementTerminalOutputDecision;
export declare function renderAuthorizedPromptImprovementTerminalOutput<T>(input: {
    decision: PromptImprovementTerminalOutputDecision;
    userLanguage: string;
    renderWithLlm: (facts: PromptImprovementTerminalOutputFacts, userLanguage: string) => Promise<T>;
}): Promise<{
    status: "rendered";
    text: T;
} | Extract<PromptImprovementTerminalOutputDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-improvement-terminal-output.d.ts.map