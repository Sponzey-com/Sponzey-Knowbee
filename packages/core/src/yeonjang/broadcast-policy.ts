import type { YeonjangBroadcastToolName } from "../contracts/yeonjang-broadcast.js"

export type YeonjangBroadcastCommandClass =
  | "observation"
  | "interaction"
  | "side_effect"

export type YeonjangBroadcastTargetRequirement =
  | "trusted_only"
  | "approval_required"

export interface YeonjangBroadcastPolicy {
  toolName: YeonjangBroadcastToolName
  transportMethod: string
  commandClass: YeonjangBroadcastCommandClass
  broadcastSafe: boolean
  targetRequirement: YeonjangBroadcastTargetRequirement
  approvalRequired: boolean
  defaultDecision: "allow" | "deny"
  reasonCode: string
  userMessage: string
}

const POLICIES: Record<YeonjangBroadcastToolName, YeonjangBroadcastPolicy> = {
  screen_capture: {
    toolName: "screen_capture",
    transportMethod: "screen.capture",
    commandClass: "observation",
    broadcastSafe: true,
    targetRequirement: "trusted_only",
    approvalRequired: false,
    defaultDecision: "allow",
    reasonCode: "broadcast_safe_observation",
    userMessage: "trusted Yeonjang 인스턴스에 한해 broadcast 가능한 관찰형 명령입니다.",
  },
  screen_find_text: {
    toolName: "screen_find_text",
    transportMethod: "screen.capture",
    commandClass: "observation",
    broadcastSafe: true,
    targetRequirement: "trusted_only",
    approvalRequired: false,
    defaultDecision: "allow",
    reasonCode: "broadcast_safe_observation",
    userMessage: "trusted Yeonjang 인스턴스에 한해 broadcast 가능한 관찰형 명령입니다.",
  },
  mouse_action: {
    toolName: "mouse_action",
    transportMethod: "mouse.action",
    commandClass: "interaction",
    broadcastSafe: false,
    targetRequirement: "approval_required",
    approvalRequired: true,
    defaultDecision: "deny",
    reasonCode: "broadcast_interaction_requires_approval",
    userMessage: "mouse.action broadcast는 기본 차단됩니다. 별도 승인 흐름이 준비되기 전까지 fan-out 실행하지 않습니다.",
  },
  keyboard_action: {
    toolName: "keyboard_action",
    transportMethod: "keyboard.action",
    commandClass: "interaction",
    broadcastSafe: false,
    targetRequirement: "approval_required",
    approvalRequired: true,
    defaultDecision: "deny",
    reasonCode: "broadcast_interaction_requires_approval",
    userMessage: "keyboard.action broadcast는 기본 차단됩니다. 별도 승인 흐름이 준비되기 전까지 fan-out 실행하지 않습니다.",
  },
  shell_exec: {
    toolName: "shell_exec",
    transportMethod: "system.exec",
    commandClass: "side_effect",
    broadcastSafe: false,
    targetRequirement: "approval_required",
    approvalRequired: true,
    defaultDecision: "deny",
    reasonCode: "broadcast_side_effect_requires_approval",
    userMessage: "system.exec broadcast는 기본 차단됩니다. 명시적 승인 없이 여러 인스턴스에 실행하지 않습니다.",
  },
}

export function getYeonjangBroadcastPolicy(toolName: YeonjangBroadcastToolName): YeonjangBroadcastPolicy {
  return POLICIES[toolName]
}

export function listYeonjangBroadcastPolicies(): YeonjangBroadcastPolicy[] {
  return Object.values(POLICIES)
}

export function buildYeonjangBroadcastPolicyProjection(): {
  tools: YeonjangBroadcastPolicy[]
  summary: {
    totalTools: number
    broadcastSafeTools: number
    blockedTools: number
    approvalRequiredTools: number
  }
} {
  const tools = listYeonjangBroadcastPolicies()
  return {
    tools,
    summary: {
      totalTools: tools.length,
      broadcastSafeTools: tools.filter((tool) => tool.broadcastSafe).length,
      blockedTools: tools.filter((tool) => tool.defaultDecision === "deny").length,
      approvalRequiredTools: tools.filter((tool) => tool.approvalRequired).length,
    },
  }
}
