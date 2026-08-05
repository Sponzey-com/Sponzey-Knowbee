export function buildFinalAnswerNotice(params) {
    return {
        kind: "final_answer",
        deliveryMode: "final",
        textSource: "final_answer_notice",
        finalAnswer: true,
        assistantIdentityClaim: false,
        speakerAgentName: params.speaker.agentNameSnapshot,
        attributionCount: Math.max(0, Math.trunc(params.attributionCount)),
    };
}
//# sourceMappingURL=final-answer-notice.js.map