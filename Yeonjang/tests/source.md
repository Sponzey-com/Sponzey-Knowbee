# Integration test source index

## Responsibility

This directory owns public-contract, composition, recovery, and opt-in native
acceptance tests for Yeonjang. Deterministic fixtures remain under `support/`;
only an explicitly enabled packaged live test can claim a real device result.

## Desktop direct-MQTT entries

- `packaged_macos_live_mqtt.rs`: signed macOS arm64 package/device gate.
- `packaged_windows_live_mqtt.rs`: native Windows 11 x64 package/device gate.
- `packaged_windows_arm64_live_mqtt.rs`: native Windows 11 ARM64
  package/device gate. Its result is architecture-specific and does not fill
  the x64 cell.
- `packaged_linux_live_mqtt.rs`: native Linux x64 gate, executed separately
  from Wayland and X11 sessions.
- `support/packaged_desktop_live_mqtt.rs`: 세 desktop live gate가 공유하는 direct-MQTT
  requester입니다. 실행 중 cancel은 effect가 아직 active이면 `accepted`와 cancelled terminal을,
  이미 끝났으면 `already_terminal`과 성공 terminal의 실제 image artifact·digest·ACK·cleanup을
  요구해 빠른 장치 effect를 취소 실패나 미검증 성공으로 오인하지 않습니다.
- `managed_shutdown.rs`: platform signal inventory contract.
- `windows_managed_shutdown.rs`: native targeted Ctrl+Break lifecycle test.
- `stage_timing.rs`: closed, exact-correlated direct-MQTT stage evidence contract.
- `stage_timing_jsonl.rs`: bounded Product JSONL timing sink/redaction contract.
- `controlled_mqtt_v2.rs`: camera/screen 병렬성, 같은 resource 직렬화, cancel/reconnect/cleanup과
  admitted artifact fetch failure의 signed response-route 발행을 loopback MQTT로 검증합니다.
- `controlled_mqtt_provider.rs`: legacy managed MQTT compatibility가 콜드 시작 중 관측되는
  중간 `Reconnecting`을 성공으로 오인하지 않으면서 finite budget 안의 실제 `Connected`까지
  기다리고, 다른 terminal/auth/runtime event는 즉시 실패하는지 검증합니다.
- `support/controlled_mqtt_broker.rs`: listener가 최초 TCP socket 자체를 readiness로 오인하지
  않고 완전한 MQTT CONNECT를 받은 connection만 fixture session owner로 채택합니다. 이는
  test-only cold-start 수렴이며 production timeout 또는 reconnect 정책을 변경하지 않습니다.
- `mqtt_v2_artifact_adapter.rs`: exact chunk/ack/cancel 및 admitted fetch rejection DTO의
  owner·transfer·revision 결속과 raw-byte/path 부재를 검증합니다.

## Packaged entry grammar

- `packaged_stdio_provider.rs`: packaged binary의 strict stdio/managed bootstrap과 closed
  top-level startup mode grammar를 device와 production broker 없이 검증합니다.
- `runtime_process_lease.rs`: fixed product-key OS-runtime filesystem lease의 contention,
  stale artifact/drop recovery와 unsafe symlink rejection을 isolated fixture로 검증합니다.
- `packaged_runtime_singleton.rs`: child 전용 user-data root에서 first claimant가 실제 fixed
  runtime lease를 보유한 뒤 packaged stdio와 authenticated-stdio의 cross-mode duplicate
  rejection, EOF 및 exact child 강제 종료 뒤 외부 lock 삭제 없는 lease reacquire를 검증합니다.
  Managed claimant도 malformed explicit
  config root보다 먼저 fixed lease에서 닫히는지 검증합니다. 준비 상태는 test-only lease
  획득이 아니라 실제 duplicate claimant로 확인합니다. 최초 claimant와 readiness contender의
  OS scheduling 순서는 test-owned deadline 안에서 수렴시키고, 둘 다 외부 owner에 막힌 경우만
  실패합니다. Process-lifecycle 사례는 직렬화하며 user runtime state를 사용하거나 삭제하지 않습니다.
- `mqtt_v2_direct_handler.rs`: exact duplicate가 effect를 반복하지 않고, in-progress rejection도
  원본 ingress SHA-256 correlation으로 requester에게 식별 가능하게 발행되는지 검증합니다.

## Common platform execution entries

- `platform_execute_use_case.rs`: exact/fresh preflight, permission admission, cancellation,
  one-shot execution과 receipt binding contract. Requestable `not_determined`는 exact camera
  operation에서만 실행되고 일반 receipt와 screen operation은 effect 전에 닫힘을 검증합니다.
- `legacy_capture_platform_adapter.rs`: 기존 camera/screen backend와 common use case 사이의
  compatibility contract. Typed requestable camera permission evidence가 기존 backend에
  정확히 한 번 전달되고 artifact receipt가 유지됨을 검증합니다.
- `system_screen_permission.rs`: macOS 화면 권한의 read-only MQTT probe와 capture policy가
  허용된 첫 GUI 시작의 one-time local request가 분리되어, remote capture가 OS permission
  prompt를 만들지 않는지 검증합니다.
- `support/system_info_test_backend.rs`: 실제 장치 effect 없이 capability와 typed camera
  permission status를 주입하는 deterministic adapter fixture입니다.

## Synchronization rule

Update this index when a test entry changes platform identity, live-evidence
meaning, shutdown ownership, or protocol scope. Cross-compile and fixture
results never replace the named live matrix cell.
