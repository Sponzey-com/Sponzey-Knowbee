import { type StartedRootRun, type StartRootRunParams } from "../runs/start.js";
import type { ConversationProbeResult, ConversationRunBinding, ConversationVerificationInput } from "./conversation-process-verification.js";
export interface StartRootRunConversationProbeDependencies {
    buildStartParams(input: ConversationVerificationInput): StartRootRunParams;
    startRootRun?: ((params: StartRootRunParams) => StartedRootRun) | undefined;
}
export declare function createStartRootRunConversationProbe(dependencies: Readonly<StartRootRunConversationProbeDependencies>): (input: ConversationVerificationInput, signal?: AbortSignal) => Promise<ConversationProbeResult<ConversationRunBinding>>;
//# sourceMappingURL=start-root-run-conversation-probe.d.ts.map