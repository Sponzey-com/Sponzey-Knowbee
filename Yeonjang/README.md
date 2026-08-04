# Yeonjang

`Yeonjang` is a Rust-based extension node for Knowbee.

The node is intended to handle local-device and operating-system level work that is better separated from the main Knowbee gateway process, including:

- camera management
- system control
- shell / command execution
- screen control
- keyboard control
- mouse control

The Rust library, runtime, and test provider are standalone and do not import Agent, Skill,
Gateway, channel, or TypeScript database code. Knowbee integrates them at an external consumer
boundary: agents enable one canonical `skill:yeonjang` catalog entry, while each computer remains
an independent `capability_kind: "yeonjang"` instance binding. Adding computers does not clone
the Skill or create feature-specific Skills.

## Current State

This initial scaffold provides:

- a native `iced` desktop settings window
- a newline-delimited JSON stdio protocol
- a request dispatcher
- implemented methods for:
  - `node.ping`
  - `node.capabilities`
  - `system.info`
  - `system.exec`
  - `application.launch` on macOS
  - `application.launch` on Windows
  - `application.launch` on Linux
  - `camera.list` on macOS
  - `camera.capture` on macOS
  - `camera.list` on Windows
  - `camera.capture` on Windows
  - `camera.list` on Linux
  - `camera.capture` on Linux
  - `screen.capture` on macOS
  - `screen.capture` on Windows
  - `screen.capture` on Linux
  - `mouse.move` on macOS
  - `mouse.click` on macOS
  - `mouse.action` move / click / double_click / button_down / button_up / scroll on macOS
  - `mouse.move` on Windows
  - `mouse.click` on Windows
  - `mouse.action` move / click / double_click / button_down / button_up / scroll on Windows
  - `mouse.move` on Linux
  - `mouse.click` on Linux
  - `mouse.action` move / click / double_click / button_down / button_up / scroll on Linux
  - `keyboard.type` on macOS
  - `keyboard.action` shortcut / key_press / key_down / key_up on macOS
  - `keyboard.type` on Windows
  - `keyboard.action` shortcut / key_press / key_down / key_up on Windows
  - `keyboard.type` on Linux
  - `keyboard.action` shortcut / key_press / key_down / key_up on Linux
  - `system.control` on macOS
  - `system.control` on Windows
  - `system.control` on Linux

## Priority

The current implementation priority is:

1. `camera.list`
2. `camera.capture`
3. `application.launch`
4. `screen.capture`
5. `mouse.move` / `mouse.click`
6. `keyboard.type`
7. `system.control`

## Run

```bash
cargo run --manifest-path Yeonjang/Cargo.toml
```

Release tooling can inspect the exact loaded executable without starting MQTT, opening a UI, or
reading settings:

```bash
knowbee-yeonjang --release-identity
```

The command returns path-free `yeonjang.release-identity.v1` JSON containing the Cargo package
version, compiled OS/architecture, byte size, and SHA-256 of the current executable. Platform
packaging writes `release-identity.json`, rejects a Mach-O/ELF/PE target mismatch before staging,
and verifies source/copy digest parity. Consumers call
`verifyYeonjangPackageIdentity()` from the platform npm package before launch; a missing,
malformed, or changed binary is a closed rejection. A matching digest proves binary identity
only, not MQTT connectivity, OS permission, device effect, or user-goal completion.

GUI 기본 실행 시 설정 화면이 열립니다.

GUI, `--managed`, `--headless-managed`와 `--managed-tls`는 시작 시 MQTT password를
ephemeral HMAC key로 사용해 common side-effect admission을 구성합니다. Knowbee가
발급하는 receipt와 같은 issuer `knowbee-core`, key ID
`mqtt-connection-password-v1`, 현재 node ID audience를 사용합니다. Password가
없거나 16 bytes 미만이면 MQTT runtime과 device backend를 만들기 전에 fail-closed
합니다. Caller가 request metadata에 넣은 receipt는 신뢰하지 않으며, Knowbee runtime이
승인된 exact operation에 대해 command/operation/session/target/idempotency/expiry를
결속해 새로 서명한 receipt만 검증합니다. Authorization ID는 single-use이고 동일
command redelivery는 durable/idempotency 결과만 재생해 effect를 반복하지 않습니다.
Production constructor에 binding-only 또는 optional admission fallback은 없습니다.
기본 TCP transport는 `localhost` 또는 loopback IP만 허용합니다. 다른 host는
DNS 조회나 socket 연결 전에 `non-loopback MQTT requires an explicit TLS identity`로
닫힙니다. 원격 broker는 CA와 client identity를 bootstrap에서 검증하는 별도 TLS
profile이 연결되기 전까지 활성화되지 않습니다.

Packaged `--managed`, `--headless-managed`와 `--managed-tls` entry는 시작할 때 settings,
credential, transport와 authorization을 한 번 검증한 뒤 하나의 `ManagedRuntime`을
구성합니다. Bootstrap에서 설정 디렉터리와 현재 executable identity로 고정한
filesystem lease provider를 한 번 만들고, runtime composition은 immutable instance
ID의 exclusive OS file lock을 MQTT 연결과 device executor 진입 전에 획득합니다. 같은
설치 executable/instance의 두 번째 runtime은 typed `InstanceLease` build failure로
닫히며 정상 shutdown이나 비정상 process 종료는 lock을 반환합니다. Lock 파일에는 PID,
secret 또는 raw instance ID를 쓰지 않아 stale 파일과 PID 재사용을 실행 성공으로
오판하지 않습니다. 이 root가 process-owned Tokio host, 최대 8개 in-flight request, 32개
pending dispatch와 1,024개 completed-response slot을 소유합니다. MQTT connection
polling, reconnect와 heartbeat도 같은 Tokio host의 owned async task이며 request별 OS
thread나 blocking connection poll을 사용하지 않습니다. Rust runtime은 30초마다
presence를 갱신하고 Gateway는 transport와 event-loop jitter를 허용하는 90초 공통
liveness 계약이 지난 뒤에만 session을 stale로 판정합니다.
MQTT-to-UI runtime events use a 256-slot non-blocking channel, and native tray actions use a
32-slot non-blocking channel. A stalled UI therefore cannot grow an unbounded queue or block the
connection task. Request execution success and response delivery success remain separate typed
outcomes; a publish failure does not rewrite the completed effect result.
Resource admission comes from the canonical method descriptor. Camera devices and screen
displays retain independent keys, while mouse, keyboard, and browser-focus side effects share
`desktop_control` for the same exact target so local input cannot interleave unexpectedly.
종료 시 ingress와 connection을 닫고 accepted response delivery를 drain한 다음 Tokio
host lease를 반환합니다. GUI는 Iced가 이미 소유한 Tokio handle에 같은 bounded work
config를 연결하므로 두 번째 runtime을 만들지 않습니다. GUI의 `Idle -> Running ->
Stopping -> Idle` 상태 전이가 connect/disconnect/reconnect/quit의 단일 writer이며,
종료가 완료되기 전 새 연결을 시작하지 않고 connect 클릭 시점의 settings snapshot만
사용합니다.

Managed launcher와 독립 acceptance harness는 필요할 때
`--config-root <absolute-path>`로 settings, permission policy, MQTT durable state와
instance lease의 공통 bootstrap root를 명시할 수 있습니다. 상대 경로, symlink와
디렉터리가 아닌 경로는 runtime 생성 전에 거부합니다. `--broker-secret-stdin`은
Keychain 대신 broker/HMAC secret lease를 표준 입력 EOF까지 최대 4,096 bytes로 한 번
받습니다. 값은 trim하지 않으므로 launcher는 trailing newline 없는 pipe를 사용해야
하며, 빈 값·초과 크기·UTF-8이 아닌 값은 fail-closed합니다. Secret은 argument,
environment, settings file 또는 진단에 넣지 않습니다. 이 두 옵션은 composition-root
입력만 바꾸며 MQTT command, policy, approval 또는 effect 계약을 우회하지 않습니다.

MQTT client ID는 mutable node ID나 alias를 사용하지 않고 immutable instance ID와
runtime session ID의 versioned SHA-256 digest에서 최대 50자의 ASCII 값으로 파생합니다.
같은 runtime의 reconnect는 같은 client ID를 유지하고, 새 session이나 다른 instance는
다른 client ID를 사용합니다. Node ID는 MQTT topic routing이라는 기존 역할만 유지합니다.

### Command rejection contract

직접 MQTT command가 exact operation으로 결속되기 전에 거부되면 Yeonjang은 더 이상
typed failure를 내부에서 폐기하지 않습니다. Exact requester response topic에
QoS 1/non-retained `yeonjang.command-rejection.v2`를 발행하고
`stage`, `reason_code`, `effect_state`, `retry_safety`, `recovery_action`을
`response.publish` scope로 서명합니다. v1 입력은
`protocol_upgrade_required`와 `not_started`로 회신됩니다.

파싱 전 입력의 request/command/operation/idempotency 값은 신뢰하지 않으므로 이
응답에는 복원하지 않습니다. 대신 configured instance/session/requester topic identity와
raw input의 path-free SHA-256 correlation만 서명합니다. 이는 effect terminal이 아니며
durable terminal delivery receipt나 `response.ack`을 만들지 않습니다. Retained command는
기존처럼 publish 없이 거부됩니다.

### Terminal receipt query binding

새 production terminal content는 schema version 3이며 `target_scope_digest`를
명시합니다. Requester는 signed `receipt.get`의 `target_scope_digest`에 이 값을 그대로
사용해야 합니다. `terminal.binding_digest`는 플랫폼 effect binding 용도이므로
repository 조회 digest로 대체할 수 없습니다. Receipt response의 immutable terminal
revision을 확인한 뒤, 원래 terminal envelope의 `receipt_id`, `response_digest`와
revision을 exact `response.ack`에 결속해야만 consumer acknowledgement가 됩니다.
MQTT PUBACK이나 artifact ACK는 이 결정을 대신하지 않습니다.

Durable reader는 기존 terminal content schema 1/2를 계속 읽지만 새 runtime만 schema 3을
기록합니다. Schema 3을 모르는 이전 binary는 새 record를 fail-closed하므로 release는
먼저 schema 3 read compatibility가 포함된 rollback package를 배포·rehearsal해야 합니다.
그 준비 없이 binary만 이전 버전으로 되돌리거나 scope digest를 추측해서는 안 됩니다.

동일 native host에서 rollback을 rehearsal할 때는 현재 live gate에 이전 package의
absolute binary/manifest 경로를 명시합니다.

```bash
YEONJANG_LIVE_DEVICE_GATE=1 \
YEONJANG_ROLLBACK_GATE=1 \
YEONJANG_ROLLBACK_BINARY='/absolute/previous/package/binary' \
YEONJANG_ROLLBACK_PACKAGE_MANIFEST='/absolute/previous/release-identity.json' \
  bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
```

Gate는 current package가 실제 schema-3 terminal을 기록하고 정상 종료한 다음에만
previous package를 같은 config/state root로 시작합니다. Previous loaded identity는
manifest와 OS/architecture가 일치하고 current digest와 달라야 합니다. 이후 같은 signed
camera command가 기존 payload, receipt ID와 response digest로 replay되고 새 artifact가
생기지 않아야 통과합니다. Stage-timing 옵션은 current package에만 전달되므로 이를
모르는 호환 previous package의 CLI 계약을 불필요하게 확장하지 않습니다. 입력 누락,
부분·symlink 입력, 동일 binary 또는 호환되지 않는 state reader는 release를 차단합니다.
2026-07-31 실제 rehearsal에서는 current signed macOS arm64 package와 SHA-256이 다른
06:25 previous signed package를 사용했습니다. Previous package는 같은 state root의
terminal payload, receipt ID와 response digest를 그대로 replay했고 새 camera effect는
0건이었습니다. Durable schema는 platform-neutral 공통 계약으로 이 reference host에서
검증하며, 각 선택 OS의 package/loaded identity와 device effect는 native gate에서
별도로 검증합니다.

### Capture permission read contract

직접 MQTT v2의 권한 조회는 기존 `yeonjang.capabilities.v2`나 executable command
schema를 확장하지 않습니다. Requester는 exact control topic에
`yeonjang.control.v2` envelope를 보내며 payload는
`{"control":"capture.permission.get","params":{}}`만 허용됩니다. Authorization은
exact requester/instance/session/fingerprint/idempotency/expiry와
`permission.read` scope를 HMAC으로 결속합니다. Retained, selector가 추가된 params,
wrong target/scope, expired 또는 잘못 서명된 입력은 OS 관측 전에 거부됩니다.

응답 schema는 `yeonjang.capture-permission-response.v2`이고
`response.publish`로 서명됩니다. `available`일 때만 camera/screen의
`platformAvailable`, canonical `policyRevision`/`localPolicy`/constraint 종류와
`osPermission`을 별도 필드로 반환합니다. `binding_mismatch`,
`policy_unavailable`, `observation_unavailable`은 성공처럼 보이는 permission row를
반환하지 않습니다. 이 read는 camera/screen capture, policy write 또는 OS consent
request API를 호출하지 않습니다.

이 control은 additive 계약입니다. 기존 v2 command, capability와 artifact consumer는
변경 없이 동작하지만 구버전 Yeonjang은 새 discriminator를 pre-effect
unroutable로 거부하고 응답을 만들지 않습니다. Requester는 pairing/package release
identity에서 이 계약 지원을 확인한 경우에만 query를 보내야 합니다. 구버전으로
rollback하면 permission query를 비활성화하고 기존 capability와 effect 전 preflight를
사용하며, 새 query를 legacy method나 capture command로 변환하지 않습니다.

원격 broker의 explicit profile은 `--managed-tls`입니다. 시작할 때
`YEONJANG_MQTT_CA_CERT_PATH`, `YEONJANG_MQTT_CLIENT_CERT_PATH`,
`YEONJANG_MQTT_CLIENT_KEY_PATH`가 가리키는 PEM을 각각 최대 1 MiB까지만 한 번 읽고
typed mutual-TLS dependency로 변환합니다. CA로 broker hostname identity를 검증하고
client certificate/private key로 client identity를 제시합니다. 누락, 빈 값, malformed
PEM 또는 초과 크기는 MQTT runtime/thread/DNS 생성 전에 닫힙니다. Path와 material은
response 또는 log에 출력하지 않으며 실행 중 변경은 restart 전까지 반영하지 않습니다.

Gateway 없이 실제 Mosquitto와 이 transport/ACL 경계만 검증하려면 Docker, OpenSSL과
Cargo가 준비된 개발 환경에서 다음 self gate를 실행합니다.

```bash
bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
```

이 gate는 하루보다 짧게 유효한 독립 CA/server/Yeonjang/requester/probe 인증서를
임시 디렉터리에 만들고, TLS 1.2+, 필수 client certificate와 certificate-CN 기반 exact
topic ACL을 적용한 Mosquitto 2.0.22를 loopback Docker port에 띄웁니다. Production
`MqttTransportSecurity::MutualTls` factory의 QoS1 command/response 왕복, broker가
수신한 cross-target probe의 비전달, 인증서 누락·비신뢰와 hostname mismatch 거부,
DISCONNECT와 container/key-material cleanup을 검증합니다. 실패 시 bounded broker
진단만 출력하고 private key bytes와 full payload는 출력하지 않습니다. 이 결과는
transport identity와 ACL 증거이며 package identity, OS permission, camera/screen
effect 또는 artifact 완료 증거를 대신하지 않습니다.

Managed runtime의 단계별 성능 관측은 release gate가
`--stage-timing-jsonl`을 명시했을 때만 stderr에 활성화됩니다. 각 Product JSONL은
queue, authorization, handler, post-check, publish, transfer, ack 중 하나와
SHA-256 correlation, wall-clock 시작/완료, monotonic duration만 포함합니다. 최대
4,096행 이후에는 관측만 중단하며 요청 결과, retry, timeout, artifact lifecycle은
변경하지 않습니다. 일반 managed/GUI 실행에는 이 옵션을 사용하지 않습니다.

macOS arm64의 signed package와 실제 camera/screen까지 같은 Gateway-free 경로에서
검증하는 opt-in gate는 다음과 같습니다.

```bash
bash scripts/build-yeonjang-macos.sh
YEONJANG_LIVE_DEVICE_GATE=1 bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
```

Ubuntu LTS x86_64에서는 camera/display가 연결된 실제 desktop session에서 같은
공통 gate를 실행합니다. Script가 current release binary를 package한 뒤 direct MQTT
계약을 실행하며 Wayland와 X11 결과는 서로 대체하지 않습니다.

```bash
XDG_SESSION_TYPE=wayland YEONJANG_LIVE_DEVICE_GATE=1 \
  bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
XDG_SESSION_TYPE=x11 YEONJANG_LIVE_DEVICE_GATE=1 \
  bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
```

Linux gate는 `/dev/video*`와 `ffmpeg|fswebcam`, 그리고 session에 맞는
`grim|gnome-screenshot` 또는 `gnome-screenshot|scrot|import`가 없으면 package effect
전에 실패합니다. macOS와 Linux는 동일한 shared requester/assertion source를 쓰지만,
각 host의 package identity·OS permission·실제 artifact가 별도 evidence입니다.
현재 사용자가 선택한 Linux release cell은 Ubuntu `192.168.20.123`의 active X11
session이며 실제 `/dev/video0` camera와 screen gate가 통과했습니다. Wayland는
지원 가능한 별도 compatibility profile이고 X11 결과로 통과했다고 표현하지 않습니다.

Windows 11 native x64 또는 ARM64는 카메라와 화면이 연결된 interactive Git Bash에서
실행합니다. Gate는 .NET native architecture와 package PE architecture를 일치시키며
다른 architecture의 결과를 서로 대체하지 않습니다. 지원하지 않는 architecture,
session 0, target override와 명시적 camera device ID 누락은 effect 전에 거부됩니다.
Gate는 호출 위치와 무관한 absolute Windows build-script 경로를 사용하고, package
process에만 exact Ctrl+Break를 보내 shutdown을 검증합니다.
현재 사용자가 선택한 Windows release cell은 Parallels `Windows 11 - 개발` ARM64이며
실제 camera/screen, artifact, cancellation, reconnect와 restart gate가 통과했습니다.
Windows x64는 별도 compatibility profile이며 ARM64 결과를 복사하지 않습니다.

```bash
YEONJANG_LIVE_WINDOWS_CAMERA_DEVICE_ID='<exact-device-id>' \
  YEONJANG_LIVE_DEVICE_GATE=1 \
  bash scripts/self/run-yeonjang-independent-mqtt-gate.sh
```

실행 전에 현재 signed `Yeonjang.app`에 Camera와 Screen Recording 권한이 이미
허용되어 있어야 합니다. 일반 command는 권한 prompt를 열지 않으며 미허용 상태에서는
typed pre-effect/terminal failure로 gate가 실패합니다. Gate는 package manifest와
loaded binary digest를 먼저 비교한 뒤, ephemeral mTLS broker에 직접 연결합니다.
Capture 전에 signed permission read로 camera/screen availability, local policy와
실제 OS `granted`를 분리 확인하고 artifact가 없음을 검증합니다. 이어 signed admin
revision-CAS로 camera/screen을 모두 deny하고, capability와 permission read가 같은
새 revision과 `localPolicy=denied`를 내는지 확인합니다. 이때 `advertisedMethods`는
구현 가능성을 계속 나타내며 정책 상태로 위장되지 않습니다. Deny 상태의 두 capture가
`local_policy_denied`와 effect/artifact 0건으로 닫힌 뒤 signed rollback으로 원래 allow
snapshot을 복구합니다. 이어 camera JPEG와
screen PNG를 각각 1회 요청해 terminal, path-free artifact descriptor, chunk/full
SHA-256, 크기와 image dimensions를 검증합니다. Camera transfer는 exact ACK와 즉시
cleanup, screen transfer는 exact cancel, late ACK 불변식, cancel replay와 restart
cleanup을 확인합니다. 별도 camera helper 실행 중 exact `command.cancel`은 cancel
ACK와 대상 command terminal을 각각 검증하고 artifact 0건으로 수렴해야 합니다. MQTT
worker scheduling 때문에 선행 command 등록이 잠깐 늦는 경우 canonical registry를
최대 500ms 관측하지만, 이 coordination grace로 effect 결과를 추정하지 않습니다.
Exact signed camera payload를 연속 두 번 발행하는 actual QoS duplicate 검증은 하나의
성공 terminal/artifact만 허용합니다. 경쟁 전달은 terminal claim 시점에 따라
`authorization_replayed` 또는 `idempotency_in_progress`의 `not_started` rejection,
아니면 같은 immutable terminal replay로만 수렴해야 합니다. Artifact ACK는 terminal
revision을 계산하지 않고 fetch 뒤 canonical lifecycle의 exact awaiting-ACK revision에
결속합니다.
이후 gate 소유 container의 host port와 인증서는 유지한 채 Mosquitto process를
재시작해 실제 TLS 연결을 끊습니다. Signed app은 외부 신호 없이 같은 identity로
재연결하고 exact ingress를 재구독하며 fresh online/capability를 발행해야 합니다.
같은 mTLS/client identity로 다시 연결한 requester가 이 projection과 후속 실제
camera/screen artifact를 모두 검증해야 broker reconnect가 성공입니다. TLS socket
I/O만 재시도하고 인증서·키·DNS·handshake 오류는 terminal로 유지합니다.
마지막으로 graceful offline과 same-instance reacquire를
검증하고, 재시작 전에 완료된 exact camera command를 다시 보냅니다. 이때 publication
message/nonce와 무관하게 같은 terminal payload, opaque receipt ID와 response digest가
재생되어야 하며 새 artifact가 생성되면 실패합니다. 성공 문구는 그 명령을 실행한
exact macOS, Windows 또는 Linux session의 관측 증거이며 다른 OS/session,
Gateway/Telegram 전달 완료를 대신하지 않습니다.
Rollback opt-in에서는 이 마지막 reacquire 주체를 distinct previous package로 교체하며,
그 실행 결과 없이는 previous-package rollback 완료로 기록하지 않습니다.
Live gate는 첫 package 실행 종료 전에 위 JSONL을 읽어 일곱 단계가 모두 존재하는지,
correlation이 path-free SHA-256인지, secret/config/artifact 경로가 노출되지 않는지
검증하고 OS/architecture별 `duration_us` baseline을 출력합니다. 이 수치는 회귀
비교를 위한 관측값이며 단독 성공·실패 기준이나 고정 timeout으로 사용하지 않습니다.

stdio 노드 모드:

```bash
cargo run --manifest-path Yeonjang/Cargo.toml -- --stdio
```

서명된 side effect를 검증하는 통제된 로컬 provider 테스트에서는
`--stdio-authenticated`를 사용합니다. 이 profile은 시작할 때
`YEONJANG_STDIO_AUTH_ISSUER`, `YEONJANG_STDIO_AUTH_KEY_ID`,
`YEONJANG_STDIO_AUTH_AUDIENCE`, `YEONJANG_STDIO_AUTH_SECRET`을 한 번 읽어 typed
authorization dependency를 만듭니다. Secret은 최소 16 bytes여야 하며 명령 인자,
settings, response 또는 log에 넣지 않습니다. 값이 없거나 유효하지 않으면 runtime과
backend를 만들기 전에 종료합니다. 이 profile은 secure credential provider의
ephemeral secret lease가 연결되기 전까지 production activation 용도가 아닙니다.

기존 `--exec`와 `--exec-bin`은 authorization, exact target binding, idempotency와
post-check를 우회하므로 실행하지 않고 typed error로 종료합니다. 로컬 명령도 strict
canonical request를 `--stdio-authenticated`에 전달해야 합니다.

## Request Format

Each request is a single JSON object per line.

```json
{
  "protocolVersion": 1,
  "id": "req-1",
  "method": "system.info",
  "params": {},
  "metadata": {}
}
```

`--stdio` accepts only this strict versioned JSONL envelope. Unknown top-level fields,
unversioned or malformed input, and lines larger than 512 KiB return a bounded
`invalid_request` response without exposing parser details. The stdio composition uses the same
managed admission and lifecycle pipeline as other transports, has bounded pending/in-flight
work, may return independent responses in completion order, and drains accepted work before
stopping at EOF. Its default authorization verifier rejects side effects; read-only requests
remain available.

`--stdio-authenticated`도 같은 parser, bounded scheduler, managed admission, writer와
shutdown pipeline을 사용하며 authorization verifier만 bootstrap에서 명시적으로
교체합니다.

Each response is emitted as a single JSON object per line.

```json
{
  "id": "req-1",
  "ok": true,
  "result": {
    "node": "knowbee-yeonjang"
  }
}
```

MQTT response가 여러 chunk로 나뉘면 모든 envelope는 exact request ID, zero-based
index/count, 전체 decoded byte size와 `sha256:` payload digest를 공유합니다. Consumer는
최대 4 MiB/1024 chunks의 bounded assembler에서 out-of-order chunk를 모으고, envelope
불일치, conflicting duplicate, size 또는 digest mismatch를 terminal response로
해석하지 않습니다.

### Cancellation Contract

The protocol client owns cancellation before Yeonjang admission. If cancellation wins while an
approval or durable continuation is waiting, the client records that continuation as terminal
`cancelled` and sends no Yeonjang command. A request-group cancellation is expanded by the
client over its recorded child dispatches; every dispatched child receives a separate exact
cancel envelope. Yeonjang does not accept a request-group identifier as a broadcast cancel
target.

Dispatched side effects are cancelled with the versioned `command.cancel` envelope. Its target
contains the original request ID, command ID, operation ID, target session, target fingerprint,
idempotency key, cancel token, reason kind, and requested time. Every field must match the active
or terminal command; a partial match returns `cancellation_binding_mismatch` and does not signal
the target.
Completed commands also leave a bounded digest-only terminal index, so the same exact late
cancellation returns `command_already_terminal` after a process restart without replaying the
effect. Older terminal-index entries are evicted oldest-first within the configured cancellation
capacity; cancellation control receipts are kept in a separate namespace.

The older `command_id` plus `cancel_token` payload remains available only for mixed-version
clients cancelling a command that is active in the current process. It cannot inspect terminal
commands or durable receipts after restart. Cancellation acknowledgement means that the signal
was accepted; the original request still emits its own terminal response after cleanup and
post-check.
The canonical lifecycle preserves `user_requested`, `deadline_exceeded`, and `runtime_shutdown`
as distinct immutable cancellation reasons. Runtime shutdown stops new admission, signals every
active side effect with `runtime_shutdown`, and waits for its cleanup and terminal response;
already-running read-only work is still drained normally.
When a command terminates as cancelled, its bounded `attempt` evidence carries the same typed
`cancellation_reason`. The field is additive and optional so older stored responses remain
readable. A cancellation acknowledgement never carries or replaces that terminal evidence.

## Notes

- `desktop_interactive` support profile now runs as a tray-first app: startup hides the main window, the tray icon becomes the primary entry point, and the close button hides back to tray instead of exiting.
- Support profile baseline:
  - `desktop_interactive`: tray-first desktop app
  - `desktop_limited`: desktop app with reduced tray/window guarantees
  - `headless_managed`: managed MQTT runtime with no tray/window expectation
- The tray menu exposes window open/hide, connection status, permission summary, version, and explicit quit.
- Native tray callbacks enqueue into a bounded non-blocking action channel; repeated clicks cannot
  block the native event handler or create an unbounded backlog.
- Windows supports tray double-click reopen. Linux should be treated as tray-menu-first because portable tray click events are limited there.
- Linux desktop launch requires `DISPLAY` or `WAYLAND_DISPLAY`. Without either, use `scripts/start-yeonjang-linux-headless.sh` or run `knowbee-yeonjang --managed` with `YEONJANG_SUPPORT_PROFILE=headless_managed`.
- `Launch on Startup` writes an OS-specific autostart entry that relaunches Yeonjang in the same tray-first mode.
- 설정 화면에는 broker 접속 정보, 자동 접속, 시스템 시작 시 실행, node id, MQTT topic, 권한 토글이 포함됩니다.
- 새 설정과 legacy JSON에서 생략된 카메라, 화면, 명령 실행, 애플리케이션 실행,
  시스템 제어, 키보드와 마우스 권한은 모두 꺼진 상태로 시작합니다. 필요한 기능은
  사용자가 명시적으로 켜야 하며, 이 설정은 별도의 OS 권한이나 실행 승인을 대신하지
  않습니다.
- Version 없는 legacy settings에 true인 장치 부작용 권한이 있으면 원래 선택은 UI
  검토용으로 보존하지만 `permission_review_required` 상태가 됩니다. MQTT/stdio runtime
  snapshot은 이 상태에서 file mutation, camera, screen, input, process/browser/system
  control 권한을 모두 false로 투영합니다. 사용자가 GUI에서 권한을 검토하고 Save가
  성공한 경우에만 review 상태가 해제되며, 저장 실패나 단순 startup/read는 권한을
  활성화하지 않습니다. 실행 중 Save가 성공하면 GUI가 소유한 기존 runtime lifecycle로
  현재 runtime을 정지하고 저장된 단일 immutable settings snapshot으로 다시 시작합니다.
  이미 restart가 대기 중이면 이전 pending snapshot을 새 저장값으로 교체하며 별도 runtime
  writer를 만들지 않습니다. 이 절차는 OS permission이나 요청별 approval을 대신하지
  않습니다.
- 설정을 읽는 동작은 settings 파일을 생성하거나 보정값을 다시 저장하지 않습니다.
  Current settings는 `schema_version: 1`을 포함하며 oversized, malformed, unsupported
  version, invalid identity/port와 current-schema secret field를 typed error로
  fail-closed합니다. Version이 없는 legacy settings는 메모리에서만 additive default를
  적용하고, 사용자가 명시적으로 저장하거나 secure credential migration이 성공할 때만
  versioned atomic save로 전환됩니다. Existing current-version 파일은 explicit
  `create_settings_backup`으로만 backup하며, rollback은 backup을 먼저 검증한 뒤 primary를
  atomic replace합니다. Invalid save/backup은 마지막 정상 파일을 덮지 않습니다.
  단, legacy secret migration은 Keychain bundle 저장이 성공한 뒤 secret이 제거된
  settings를 원자 교체하는 명시적 startup migration use case로 수행됩니다.
- broker password와 pairing secret은 normal settings JSON에 저장되지 않습니다.
  macOS에서는 두 값을 instance ID에 결속된 단일 Keychain bundle로 저장하고 시작할
  때 한 번 immutable process snapshot으로 읽습니다. Keychain write/load가 실패하면
  기존 settings를 지우지 않고 managed 연결을 차단합니다. Windows/Linux secure
  provider는 아직 unavailable로 fail-closed합니다.
- macOS 자동 시작은 Keychain UI를 허용하지 않습니다. 현재 서명 주체가 기존 항목을
  바로 읽을 수 없으면 `credential_interaction_required`로 즉시 종료해 앱 시작과
  트레이/UI를 막지 않으며, 비밀값이 제거된 정상 settings도 기본값으로 대체하지
  않습니다. 이때만 설정 창을 전면에 표시하고 `Authorize credentials`를 제공합니다.
  사용자가 이 명시적 복구 동작을 선택한 경우에만 Keychain 확인 UI를 허용하며,
  확인이 끝난 동일 process snapshot으로 MQTT 연결을 시작합니다. Camera/screen 요청
  처리 중에는 Keychain UI를 열거나 이 복구 동작을 반복하지 않습니다.
- Hydrated settings, credential bundle, authorization bootstrap/receipt Debug output redacts
  secrets. MQTT runtime events expose only bounded public classifications and canonical method
  names; raw configuration errors, request methods, receipt proofs, and credential values are
  not normal log or response content.
- `system.exec` supports direct command execution and shell-based execution only through the
  canonical authorized request path. Command, args, cwd, environment and timeout use typed byte,
  count and duration bounds before the backend. stdout/stderr are drained without blocking the
  child but each retain at most 1 MiB and report truncation. Timeout, request cancellation and
  runtime shutdown terminate the child process tree; cancellation returns the typed
  `command_cancelled` terminal instead of generic success/failure. Command text is not classified
  by locale or substring heuristics. If `명령 실행 / Command Execution` is off, execution stops
  before the backend.
- `node.capabilities` projects permission, approval, cancellation, timeout, input/output schema,
  post-check, and executor availability from the canonical Rust method descriptor inventory.
  Advertisement and tool-health keys are regression-checked against that inventory. Unknown
  methods return `unknown_method`; a known contract without an executor returns
  `method_unavailable`.
- `application.launch` now respects its own Yeonjang permission toggle.
- camera support is the first platform feature to implement on top of the abstraction layer.
- macOS camera capture uses a bundled AVFoundation helper executable placed next to `Yeonjang.app/Contents/MacOS/Yeonjang`.
- 그래서 macOS 카메라 캡처는 임시 `xcrun swift` 스크립트가 아니라 앱 번들 실행 경로를 기준으로 동작합니다. 일반 `scripts/start-yeonjang-macos.sh --restart`는 검증된 번들을 재사용하고, 소스 변경 뒤에는 `--build`를 명시합니다.
- macOS build는 helper와 앱을 순서대로 서명하고 strict verification을 통과해야 완료됩니다.
  `YEONJANG_CODESIGN_IDENTITY`가 없으면 설치된
  `Sponzey RemoCom Local Code Signing` identity를 우선 사용하고, 해당 identity도
  없을 때만 ad-hoc으로 닫힌 fallback을 사용합니다. 고정 identity는 rebuild 사이의
  카메라 권한 주체를 유지합니다. 기존 Keychain 항목의 ACL이 현재 서명 주체를
  허용하지 않는 경우에는 위의 명시적 1회 복구 경계를 사용하며 자동 시작에서
  보안 확인을 추측하거나 무한 대기하지 않습니다.
- macOS permission manifests live under `Yeonjang/manifests/macos/`.
- `camera.permission_status` reads the current macOS AVFoundation authorization state without requesting access or capturing an image.
- `camera.capture` and `screen.capture` reject caller-provided `output_path` values. At startup,
  MQTT, authenticated stdio, and the managed Tokio composition create one filesystem
  `CaptureArtifactSink` from the persisted `capture_artifact_root` and the current instance ID.
  Each admitted operation receives one collision-resistant directory under that root; a symlink
  root, relative root, duplicate live operation, missing operation binding, or storage failure
  stops before the platform helper writes a result.
- Inline captures are removed from the sink immediately after the bounded binary handoff.
  Non-inline captures return a bounded provider-local artifact reference and omit the private
  output path and binary bytes. The sink resolves that reference for an explicit delivery and
  removes it only through the delivery cleanup operation. Knowbee's current camera tool requests
  inline bytes, writes them into its own configured artifact storage, and registers the separate
  channel-scoped `artifact:<UUID>` used by WebUI and Telegram delivery.
- macOS screen capture uses a Swift helper backed by `screencapture`.
- macOS mouse actions use a CoreGraphics Swift helper and require Accessibility permission.
- macOS keyboard input uses `System Events` for text typing and CoreGraphics events for key press / down / up actions.
- macOS system control supports local lock, sleep, logout, restart, and shutdown requests.
- Windows screen capture currently uses PowerShell with `System.Windows.Forms` and `System.Drawing`.
- Windows camera capture now uses the fixed `Yeonjang --camera-capture-helper` path.
- When `device_id` is provided on Windows, Yeonjang uses WinRT `MediaCapture` for explicit device capture.
- When `device_id` is omitted on Windows, Yeonjang falls back to the built-in Windows camera UI.
- Rust가 canonicalize한 Windows `\\?\` path는 WinRT/PowerShell native boundary에서만
  일반 Win32 path로 변환됩니다. 변환 뒤 259 UTF-16 unit을 넘는 capture output은
  helper를 시작하지 않고 typed pre-effect failure로 닫힙니다.
- Windows artifact manifest는 manifest file 자체의 durable flush와 atomic rename을
  보장합니다. Unix directory file descriptor에 의존하는 metadata sync는 Windows
  성공 조건으로 가장하지 않습니다.
- Windows and Linux camera subprocesses apply the request's normalized capture
  budget and cancellation signal, reap the owned process tree, and return
  bounded typed helper failures without native stdout/stderr.
- Windows mouse and keyboard actions currently use PowerShell with `user32.dll` calls.
- Windows system control supports local lock, sleep, hibernate, sign-out, restart, and shutdown requests.
- Windows runtime management is split between `scripts/build-yeonjang-windows.bat` for build output preparation and `scripts/start-yeonjang-windows.bat` / `scripts/stop-yeonjang-windows.bat` for process control.
- Linux camera list uses `v4l2-ctl --list-devices` when available and also scans `/dev/video*`.
- Linux camera capture requires either `ffmpeg` or `fswebcam` in `PATH` and an
  observed `/dev/video*` device before the capability is advertised.
- Linux screen capture selects only a session-compatible backend:
  `grim`/`gnome-screenshot` for Wayland or
  `gnome-screenshot`/`scrot`/ImageMagick `import` for X11. An unknown session
  or a tool for the wrong session is not advertised as ready. Display index
  selection is a typed pre-effect limitation on Linux.
- Linux mouse and keyboard automation require `xdotool` in `PATH`.
- Linux system control supports local lock, sleep, hibernate, logout, restart, and shutdown through `loginctl`, `systemctl`, `xdg-screensaver`, `gnome-session-quit`, or `shutdown` depending on the installed desktop/systemd tooling.
- Linux runtime management uses `scripts/build-yeonjang-linux.sh`, `scripts/start-yeonjang-linux.sh`, and `scripts/stop-yeonjang-linux.sh`, with `start-* --restart` as the restart entry point.
- Linux headless managed runtime uses `scripts/start-yeonjang-linux-headless.sh` and `scripts/stop-yeonjang-linux-headless.sh`.
