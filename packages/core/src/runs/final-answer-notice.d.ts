import type { AgentNameSnapshot } from "../contracts/sub-agent-orchestration.js";
export interface FinalAnswerNotice {
    kind: "final_answer";
    deliveryMode: "final";
    textSource: "final_answer_notice";
    finalAnswer: true;
    assistantIdentityClaim: false;
    speakerAgentName: string;
    attributionCount: number;
}
export declare function buildFinalAnswerNotice(params: {
    speaker: AgentNameSnapshot;
    attributionCount: number;
}): FinalAnswerNotice;
//# sourceMappingURL=final-answer-notice.d.ts.map