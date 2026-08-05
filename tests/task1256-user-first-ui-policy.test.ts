import { describe, expect, it } from "vitest"
import {
  evaluateUiInformationPriority,
  evaluateUserFirstUiChange,
  evaluateUserWorkflow,
  type UserFirstUiChangeProposal,
  type UserWorkflowContract,
} from "../packages/webui/src/lib/user-first-ui-policy.ts"

const proposal: UserFirstUiChangeProposal = {
  changeId: "sub-agent-empty-state",
  userGoal: "Create the first sub-agent",
  targetUser: "New Knowbee operator",
  currentStepCount: 3,
  proposedStepCount: 1,
  successCriteria: ["Editor opens from one visible primary action"],
  currentErrorRisk: 2,
  proposedErrorRisk: 1,
  benefits: ["user_success", "error_reduction"],
}

const workflow: UserWorkflowContract = {
  workflowId: "sub-agent-create",
  userGoal: "Create and save a sub-agent",
  frequency: "frequent",
  frequencyEvidence: "product-workflow-catalog:v1",
  entryPoint: "/topology",
  terminalSuccess: "saved",
  recoverableFailure: "validation_failed",
  steps: [
    {
      stepId: "add",
      state: "empty",
      action: "add_sub_agent",
      nextState: "editing",
      visibleStateChange: "editor drawer opens",
      nextActions: ["save", "cancel"],
      required: true,
    },
    {
      stepId: "save",
      state: "editing",
      action: "save",
      nextState: "saved",
      visibleStateChange: "saved status appears",
      nextActions: ["add_sub_agent", "run"],
      required: true,
    },
  ],
}

describe("task1256 user-first UI policy", () => {
  it("approves a measured change that reduces steps and error risk", () => {
    expect(evaluateUserFirstUiChange(proposal)).toEqual({
      decision: "approved",
      reasonCodes: ["user_outcome_evidence_complete"],
    })
  })

  it("rejects vague decoration and implementation benefits without user outcomes", () => {
    expect(evaluateUserFirstUiChange({
      ...proposal,
      currentStepCount: 1,
      proposedStepCount: 1,
      currentErrorRisk: 1,
      proposedErrorRisk: 1,
      benefits: ["decoration", "implementation_convenience", "feature_exposure"],
    })).toEqual({
      decision: "rejected",
      reasonCodes: expect.arrayContaining([
        "decoration_or_internal_benefit_only",
        "user_outcome_not_improved",
      ]),
    })
  })

  it("requires a visible safety reason when a change adds a step", () => {
    expect(evaluateUserFirstUiChange({
      ...proposal,
      proposedStepCount: 4,
      stepIncreaseJustification: undefined,
      visibleStepIncreaseReason: undefined,
    })).toEqual({
      decision: "rejected",
      reasonCodes: expect.arrayContaining([
        "step_increase_unjustified",
        "step_increase_reason_hidden",
      ]),
    })
  })

  it("validates a frequent workflow with one deterministic outcome per action", () => {
    expect(evaluateUserWorkflow(workflow)).toEqual({
      decision: "valid",
      reasonCodes: ["workflow_evidence_complete"],
      requiredStepCount: 2,
    })
  })

  it("rejects hidden state, missing next action, and ambiguous transitions", () => {
    expect(evaluateUserWorkflow({
      ...workflow,
      steps: [
        { ...workflow.steps[0]!, visibleStateChange: "", nextActions: [] },
        { ...workflow.steps[0]!, stepId: "ambiguous", nextState: "failed" },
      ],
    })).toEqual({
      decision: "invalid",
      reasonCodes: expect.arrayContaining([
        "visible_state_change_missing",
        "next_action_missing",
        "unpredictable_state_action",
      ]),
      requiredStepCount: 2,
    })
  })

  it("keeps primary actions and status visible while secondary detail is contextual", () => {
    expect(evaluateUiInformationPriority([
      { itemId: "add", priority: "primary_action", visualRank: 1, firstViewport: true, contextualReveal: false },
      { itemId: "saved", priority: "status", visualRank: 2, firstViewport: true, contextualReveal: false },
      { itemId: "advanced", priority: "secondary_detail", visualRank: 3, firstViewport: false, contextualReveal: true },
    ])).toEqual({ decision: "valid", reasonCodes: ["information_priority_valid"] })
  })

  it("rejects internal detail that outranks or permanently crowds the primary action", () => {
    expect(evaluateUiInformationPriority([
      { itemId: "add", priority: "primary_action", visualRank: 2, firstViewport: true, contextualReveal: false },
      { itemId: "internal", priority: "internal_detail", visualRank: 1, firstViewport: true, contextualReveal: false },
    ])).toEqual({
      decision: "invalid",
      reasonCodes: expect.arrayContaining([
        "secondary_information_always_exposed",
        "internal_detail_outranks_primary_action",
      ]),
    })
  })
})
