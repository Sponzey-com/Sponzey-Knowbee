# source.md

## 역할

이 디렉터리는 Knowbee 저장소가 자체 감사, 수집, smoke, rehearsal, verify 작업에 사용하는 스크립트를 담습니다.

## 경계

- 제품 시작, 중지, 상태 확인, 플랫폼 빌드와 패키징 진입점은 상위 `scripts/`에 둡니다.
- 이 디렉터리의 스크립트는 제품 런타임 진입점으로 사용하지 않습니다.
- 전용 보조 모듈은 `lib/`에 둡니다.
- `run-yeonjang-independent-mqtt-gate.sh`는 제품 시작 스크립트가 아니라
  Gateway-free release pre-gate입니다. Ephemeral PKI와 owned Mosquitto container를
  구성해 production Rust mTLS factory, exact topic ACL과 cleanup을 검증하며 private
  key나 full MQTT payload를 evidence로 남기지 않습니다. Docker port 노출이 아닌 실제
  authenticated TLS handshake를 readiness로 사용합니다. 명시적
  `YEONJANG_LIVE_DEVICE_GATE=1`에서는 native macOS arm64, Windows 11 x64/ARM64 또는
  Linux x64 package를 exact config root와 stdin secret lease로 시작해 camera/screen image,
  artifact ACK/cleanup, graceful shutdown과 same-instance restart를 추가로 검증합니다.
  Windows Git Bash 경로는 .NET native architecture와 interactive session을 먼저
  검증하고 x64/ARM64 외 architecture, architecture 불일치와 target override를
  거부합니다. 각 architecture 결과는 다른 Windows release cell을 대신하지 않습니다.
- `YEONJANG_ROLLBACK_GATE=1`은 live gate에 absolute previous binary와 package
  manifest를 추가로 요구합니다. Current package와 동일 digest, 부분·symlink 입력,
  target 불일치와 schema-3 state exact replay 실패를 장치 재실행 없이 차단합니다.
  Durable schema는 platform-neutral contract이므로 한 signed native reference
  package pair로 rehearsal하고, 각 OS package/device identity는 live matrix가 별도로
  검증합니다.
