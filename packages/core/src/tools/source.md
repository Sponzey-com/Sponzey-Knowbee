# source.md

## 역할

- `tools`는 LLM과 runs 계층이 사용할 실행 가능 능력 표면을 정의합니다.

## 주요 파일

- `index.ts`: 내장 도구 등록
- `dispatcher.ts`: 도구 조회, 승인 강제, 실행 dispatch, audit 연동
- `types.ts`: 도구 계약
- `builtin/*`: 파일, shell, 검색, 앱, 프로세스, 메모리, UI, Telegram 전송, Yeonjang 브리지 도구

## 메모

- 이 폴더는 승인, 위험도, fallback 정책이 시작되는 곳이라 정책 민감도가 높습니다.
- 승인 거부는 `user`, `timeout`, `system` 사유를 분리해서 처리하고, 타임아웃을 사용자 취소로 오인하지 않도록 `runs` 취소 요약에도 그 사유를 전달합니다.
- 전달형 도구는 성공 여부를 출력 문자열에 숨기지 않고, 가능한 한 구조화된 `details`를 함께 반환해서 채널/실행 루프가 액션 결과를 직접 해석할 수 있어야 합니다.
- `telegram_send_file`은 이제 `.txt/.md/.json/.csv/.pdf` 같은 문서형 결과를 무조건 허용하지 않고, 사용자가 파일/문서 첨부를 명시적으로 요청한 경우에만 허용합니다. 단순 확인/요약/상태 결과는 일반 메시지 전달이 기본입니다.
- `telegram_send_file`은 기존 허용 경로와 함께 같은 run/request-group에서 생성된 opaque `artifactRef`를 받을 수 있습니다. ref는 delivery adapter와 artifact metadata 경계에서만 실제 경로로 해석하며, 다른 실행 범위의 ref를 전송 대상으로 사용할 수 없습니다.
- Yeonjang capability admission은 exact target의 method 존재 여부뿐 아니라 같은 runtime
  snapshot의 typed `toolHealth`를 함께 확인합니다. 모든 matching method가
  `permission_disabled`이면 해당 Tool을 실행 가능 후보로 광고하거나 승인 요청을
  만들지 않고 `yeonjang_method_permission_disabled`로 닫습니다. ready/ok/healthy와
  기존 health 정보가 없는 호환 snapshot만 실행 후보로 유지하며 사용자 문구를
  파싱해서 권한 상태를 추측하지 않습니다.
- `yeonjang_camera_capture`는 기본 60초의 validated operation budget을 Yeonjang에 전달하고 Core transport는 같은 budget에 10초 grace를 파생합니다. Yeonjang/MQTT adapter의 명시적 typed error code만 closed mapping으로 받아 `camera_response_timeout`, `camera_handler_timeout`, `camera_helper_timeout`, legacy `camera_capture_timeout`, `camera_busy`, `camera_capture_cancelled`, `camera_permission_denied`, `camera_permission_restricted`, `camera_permission_not_determined`를 서로 다른 구조화 사유로 보존합니다. command receipt 전 응답 미수신은 `response_timeout`, handler-start receipt 뒤 미수신은 `handler_timeout`, Rust helper watchdog 응답은 `helper_timeout`으로 구분합니다. 사용자 문구나 오류 메시지 의미를 파싱하지 않으며 LLM이 같은 전략을 그대로 반복하지 않게 합니다.
- side-effect Tool은 필요할 때 typed `canonicalOperation` projector를 제공할 수 있습니다. dispatcher 승인 hash와 message-ledger idempotency, side-effect operation identity는 같은 projector 결과를 사용하고, projector가 없는 Tool은 기존 raw params 계약을 그대로 유지합니다. optional exact execution target이 있으면 `buildToolAuthorizationBinding`이 canonical Tool params와 validated target fingerprint를 한 번만 결합하고 approval registry, policy receipt와 side-effect admission이 같은 binding hash를 검증합니다. approval registry metadata에는 raw target 대신 validated execution-target fingerprint만 보존해 read-only acceptance projection이 admission과 pending approval의 exact binding을 대조할 수 있습니다. effect identity의 params fingerprint는 target-bound authorization hash와 계속 분리합니다. projector 결과나 raw target/path/image data는 normal log나 사용자 응답에 기록하지 않습니다.
- target을 resolve해야 하는 side-effect Tool은 typed `prepareOperation` port로 exact execution params, target ref, effect params와 expected state를 한 번 생성합니다. dispatcher는 capability와 duplicate guard 뒤 이 immutable operation을 SQLite에 reserve/read하고, `reserved_new` 또는 안전한 existing reserve에만 approval을 요청합니다. verified/manual/active/conflict는 approval UI 전에 closed Tool result로 반환됩니다. approval callback 이후 policy와 side-effect runtime은 같은 prepared operation ID/binding 및 exact execution params를 재사용하며 selector를 다시 해석하지 않습니다.
- camera prepare는 `node_id`와 `local` selector가 같은 online instance를 가리키면 동일 extension/session target으로 정규화합니다. timeout은 transport-only라 effect fingerprint에서 제외하고, device/facing constraint는 effect fingerprint에 남깁니다. exact execution-target fingerprint가 별도로 주어진 Tool은 operation target identity에도 포함되어 다른 target 승인이 재사용되지 않습니다.
- dispatcher는 approval grant를 params-hash Map/Set에 복사하지 않습니다. `approval_registry`가 decision과 exact scope의 유일한 persistent source이며, consumed allow-run의 DB acquire는 dispatcher restart 뒤에도 같은 binding만 재사용합니다. consumed allow-once와 scope/agent/expiry mismatch는 acquire되지 않습니다. in-memory state는 현재 approval callback Promise를 깨우는 waiter에 한정됩니다.
- prepared side-effect approval은 registry row에 operation ID, binding hash와
  continuation schema version을 저장합니다. callback은 소비된 같은 row로 만든
  redacted resume command를 waiter에 전달하며, dispatcher는 command와 현재
  prepared operation이 정확히 일치하지 않으면 Tool effect 전에 닫습니다.
- canonical plan policy의 `approval_required` risk는 Tool을 LLM 실행 scope에서 숨기는
  pre-approval gate가 아닙니다. Tool은 risk metadata와 함께 계획·실행 후보로
  제공되고, dispatcher만 exact prepared operation에 대한 사용자 승인을 요청합니다.
  따라서 privileged Tool 실패 뒤 synthetic approval scope나 continuation prompt가
  새 params를 만들거나 같은 촬영 승인을 다시 요청할 수 없습니다.
- `yeonjang_camera_capture`의 canonical operation은 exact extension/session/selector와 requested device를 포함합니다. `requestedFacing`은 typed camera inventory에서 exact device가 선택된 경우에만 canonical operation과 실행으로 전달합니다. default-device capture에는 연장 terminal/artifact가 검증된 이미지와 exact extension/session만 보장하므로, 실행할 수 없는 facing hint를 승인·중복·성공 계약에 넣지 않습니다. adapter는 사용자 원문이나 device display name으로 facing/inventory/final-response 의미를 판정하지 않고 camera inventory의 typed `position` capability만 검증합니다. position capability가 없으면 capture 전에 `CAMERA_FACING_CAPABILITY_UNKNOWN`으로 닫습니다. adapter 소유 출력 경로와 base64 전송 방식은 LLM-facing schema에서 제거했고, timeout 표현은 같은 촬영 effect의 승인·중복 식별을 바꾸지 않습니다. target/session/device/facing 조건이 달라지면 별도 operation과 승인이 필요합니다.
- camera composition의 post-effect evidence는 같은 run/request-group에서 consumed approval 1개, `START_EFFECT`/remote capture/`VERIFICATION_PASSED` 각 1개와 검증된 opaque artifact ref만 공개 projection에 사용합니다. 실제 저장 경로와 image bytes는 artifact repository 내부에 남고, 동일 operation 재호출은 새 승인이나 effect 전에 기존 dispatcher/ledger dedupe로 닫습니다. Telegram source에서 검증된 capture는 같은 채팅의 chunk-delivery adapter에 `artifact_delivery` ref로 바로 전달되어 file receipt를 기록하므로 `telegram_send_file` Tool·별도 승인·두 번째 LLM 실행을 만들지 않습니다. `telegram_send_file`은 사용자가 기존 artifact의 별도 전송을 명시적으로 요청한 경우에만 독립 operation으로 사용합니다. cross-chat, scope가 다른 artifact와 duplicate delivery는 channel adapter와 ledger가 effect 전에 닫습니다.
- `yeonjang_camera_permission_status`는 승인이나 촬영을 시작하지 않는 read-only 진단 도구이며 Yeonjang OS adapter가 반환한 실제 권한 enum과 사용자 조치 필요 여부를 구조화 evidence로 유지합니다. legacy runtime은 direct diagnostic method를, v2 runtime은 signed `capture.permission.get` control query를 사용하므로 capability 광고의 method 목록만으로 이 read-only path를 제거하지 않습니다.
- camera binary post-check는 inline bytes 존재, base64 encoding, image MIME와 non-empty local file을 순서대로 검증합니다. 하나라도 실패하면 verified artifact와 channel delivery details를 만들지 않고 각각 `camera_artifact_bytes_missing`, `camera_artifact_encoding_invalid`, `camera_artifact_mime_invalid`, `camera_artifact_empty`를 유지합니다.
- `keyboard_shortcut`은 Yeonjang이 `keyboard.action`을 지원하면 그 경로를 먼저 사용하고, 전달 계약은 `action=shortcut`, `key`, `modifiers`로 정리합니다.
- `mouse_action`, `keyboard_action`은 Yeonjang의 action 기반 capability를 직접 노출하는 공통 진입점입니다.
- `shell_exec`, `app_launch`, `process_kill`, `screen_capture`, `mouse_*`, `keyboard_*`, `window_focus`는 이제 Yeonjang 전용 실행 경계입니다. 연결된 연장이나 capability가 없으면 코어 로컬 fallback 대신 명시적 실패로 끝납니다.
- AI가 어떤 능력을 “알고는 있는데” 실제 실행이 잘 안 되면 보통 `agent` 다음으로 이 폴더를 봐야 합니다.
