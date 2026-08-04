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
- `managed_shutdown.rs`: platform signal inventory contract.
- `windows_managed_shutdown.rs`: native targeted Ctrl+Break lifecycle test.
- `stage_timing.rs`: closed, exact-correlated direct-MQTT stage evidence contract.
- `stage_timing_jsonl.rs`: bounded Product JSONL timing sink/redaction contract.
- `controlled_mqtt_v2.rs`: camera/screen 병렬성, 같은 resource 직렬화, cancel/reconnect/cleanup과
  admitted artifact fetch failure의 signed response-route 발행을 loopback MQTT로 검증합니다.
- `mqtt_v2_artifact_adapter.rs`: exact chunk/ack/cancel 및 admitted fetch rejection DTO의
  owner·transfer·revision 결속과 raw-byte/path 부재를 검증합니다.

## Common platform execution entries

- `platform_execute_use_case.rs`: exact/fresh preflight, permission admission, cancellation,
  one-shot execution과 receipt binding contract. Requestable `not_determined`는 exact camera
  operation에서만 실행되고 일반 receipt와 screen operation은 effect 전에 닫힘을 검증합니다.
- `legacy_capture_platform_adapter.rs`: 기존 camera/screen backend와 common use case 사이의
  compatibility contract. Typed requestable camera permission evidence가 기존 backend에
  정확히 한 번 전달되고 artifact receipt가 유지됨을 검증합니다.
- `support/system_info_test_backend.rs`: 실제 장치 effect 없이 capability와 typed camera
  permission status를 주입하는 deterministic adapter fixture입니다.

## Synchronization rule

Update this index when a test entry changes platform identity, live-evidence
meaning, shutdown ownership, or protocol scope. Cross-compile and fixture
results never replace the named live matrix cell.
