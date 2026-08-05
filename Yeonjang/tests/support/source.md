# Test support source index

## Responsibility and boundary

This directory owns deterministic test-only adapters and fixtures used by
Yeonjang integration tests. It may open loopback listeners, create bounded
local fixtures, and simulate external protocol peers. No file here is a
production runtime entrypoint or evidence of a real OS/device effect.

## Handwritten source

- `controlled_mqtt_broker.rs`: bounded MQTT 3.1.1 reference broker. Its
  production-v2 modes wait for command, control, admin, and artifact-ACK
  subscriptions before publishing work; smaller contract fixtures retain
  their explicitly narrower readiness counts. Initial and reconnect fixtures
  share one finite complete-CONNECT convergence boundary so a cold macOS test
  process cannot turn an accepted but incomplete handshake into false product
  failure. This is test-only readiness and does not change production retry
  or effect deadlines.
- `protocol_fixture.rs`: strict request/response fixture construction.
- `system_info_test_backend.rs`: deterministic `AutomationBackend` test double
  with observable effect counters.
- `terminal_assertions.rs`: shared typed terminal outcome assertions.
- `packaged_desktop_live_mqtt.rs`: macOS, Windows와 Linux native package가 공유하는
  direct-mTLS device acceptance. Windows child는 exact process group을 만들고
  Ctrl+Break로 production drain/offline/lease 반환을 검증합니다. Optional rollback
  rehearsal은 current package가 schema-3 terminal을 쓴 뒤 distinct previous package를
  같은 state root로 시작해 exact replay와 effect 비반복을 확인합니다. 이
  platform-neutral durable schema rehearsal은 한 native reference host에서 실행하고,
  OS별 package/loaded identity와 device effect는 각 native gate가 별도로 증명합니다.
- `mod.rs`: support module exports.

## Synchronization rule

Update this index whenever a support file is added, moved, deleted, or changes
its external protocol/readiness responsibility. Keep test-support behavior
explicitly separate from production adapters and live acceptance claims.
