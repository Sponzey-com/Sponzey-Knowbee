import type { AgentNameSnapshot } from "../contracts/sub-agent-orchestration.js"

export interface FinalAnswerNotice {
  kind: "final_answer"
  deliveryMode: "final"
  textSource: "final_answer_notice"
  finalAnswer: true
  assistantIdentityClaim: false
  speakerAgentName: string
  attributionCount: number
}

export function buildFinalAnswerNotice(params: {
  speaker: AgentNameSnapshot
  attributionCount: number
}): FinalAnswerNotice {
  return {
    kind: "final_answer",
    deliveryMode: "final",
    textSource: "final_answer_notice",
    finalAnswer: true,
    assistantIdentityClaim: false,
    speakerAgentName: params.speaker.agentNameSnapshot,
    attributionCount: Math.max(0, Math.trunc(params.attributionCount)),
  }
}
