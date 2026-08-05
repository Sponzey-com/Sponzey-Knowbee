import { type AgentInstructionSourceInput, type InstructionChain } from "./discovery.js";
export interface MergedInstructionBundle {
    chain: InstructionChain;
    mergedText: string;
}
export interface MergedInstructionOptions {
    globalStateDir: string;
    fallbackBoundaryDir: string;
    agentSources?: AgentInstructionSourceInput[];
}
export type InstructionRuntimeContext = Pick<MergedInstructionOptions, "globalStateDir" | "fallbackBoundaryDir">;
export declare function createInstructionRuntimeContext(stateDir: string): InstructionRuntimeContext;
export declare function loadMergedInstructions(workDir: string, options: MergedInstructionOptions): MergedInstructionBundle;
//# sourceMappingURL=merge.d.ts.map