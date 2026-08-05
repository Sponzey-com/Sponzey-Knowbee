export const TELEGRAM_CAMERA_1838_INCIDENT = Object.freeze({
  approvals: Object.freeze([
    Object.freeze({ registryStatus: "consumed", policyDecision: "allow" }),
    Object.freeze({ registryStatus: "consumed", policyDecision: "allow" }),
    Object.freeze({ registryStatus: "consumed", policyDecision: "allow" }),
  ]),
  operation: Object.freeze({
    count: 1,
    state: "MANUAL_INTERVENTION",
    receiptEvents: Object.freeze([
      "START_EFFECT",
      "RECORD_EFFECT",
      "BEGIN_VERIFICATION",
      "VERIFICATION_FAILED",
      "MARK_MANUAL",
    ]),
  }),
  attempts: Object.freeze([
    Object.freeze({ error: "SIDE_EFFECT_MANUAL_INTERVENTION" }),
    Object.freeze({ error: "SIDE_EFFECT_OPERATION_BLOCKED" }),
    Object.freeze({ error: "SIDE_EFFECT_OPERATION_BLOCKED" }),
  ]),
  command: Object.freeze({
    method: "camera.capture",
    sent: true,
    responseReceived: false,
    onlineHeartbeatAfterSend: true,
    reasonCode: "camera_capture_timeout",
  }),
  terminalProjection: Object.freeze({
    state: "USER_INPUT_REQUIRED",
    inputRequirement: undefined,
  }),
})
