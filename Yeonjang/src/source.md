# source.md

## 역할

- `Yeonjang/src`는 연장 런타임의 Rust 구현 루트입니다.

## 중요 단위

- `main.rs`: closed startup-mode value가 선택한 GUI, stdio, managed MQTT 또는 bounded
  utility entrypoint만 호출하는 packaged composition root. Explicit config root와 bounded
  stdin broker-secret lease는 managed branch에서만 읽습니다. Managed branch는 explicit config
  root를 검증하기 전 fixed OS-runtime guard를 acquire해 duplicate claimant를 먼저 닫고, 그 guard를
  managed, GUI 또는 stdio process lifetime까지 보유합니다. 그 뒤 non-secret bootstrap과 validated
  runtime dependency 구성을 진행합니다.
- `startup_mode.rs`: side-effect-free mutually-exclusive packaged mode grammar. Mixed
  runtime/helper/utility selector는 settings, secret, runtime host와 platform adapter 전에
  usage rejection으로 닫고 helper의 opaque child arguments는 exact helper branch에만 넘깁니다.
- `instance_process_lease.rs`: executable, config root와 instance ID에서 독립된 fixed
  product runtime lease를 secure file lock과 RAII guard로 제공합니다. Packaged와 standalone
  claimant은 이 guard를 먼저 acquire해 lifetime owner로 전달하며 child composition은 재획득하지 않습니다.
- `managed_shutdown.rs`: managed composition의 OS signal adapter. Windows GUI-subsystem
  process는 parent console을 한 번 결속하고 exact process-group Ctrl+Break를, Unix는
  Ctrl+C를 runtime의 단일 drain/shutdown owner로 전달합니다.
- `stdio.rs`: strict versioned JSONL parsing, bounded line/pending/in-flight admission,
  single writer와 EOF drain을 소유하고 managed Application service를 호출하는 packaged
  stdio composition
- `mqtt.rs`: MQTT 런타임 루프, 상태 발행, 요청 처리, exact ID/index/count/size와
  SHA-256 payload digest를 가진 청크 응답 전달
- `mqtt_transport.rs`: loopback plaintext 또는 bounded/redacted CA, client certificate와
  private key를 소유하는 mutual-TLS transport dependency
- `mqtt_v2_topics.rs`: canonical lowercase instance/session/requester/transfer ID,

  exact v2 namespace/router와 topic별 QoS 1·retain policy contract
- `mqtt_v2_direct_handler.rs`: Gateway 없이 strict parse, signature/replay admission,

  operation binding, common platform use case와 terminal content를 순서대로 조립하는
  transport-facing Application handler
- `mqtt_v2_response_adapter.rs`: retained command를 차단하고 exact terminal content
  또는 path-free command rejection을

  signed v2 bytes와 requester response topic/QoS 1/non-retain publish DTO로 투영
- `mqtt_v2_control_adapter.rs`: exact non-retained control topic을 strict parse/admit하고

  fresh cancel 또는 verified durable replay를 signed ack QoS 1 publish DTO로 투영
- `mqtt_v2_command_pump.rs`: caller-owned rumqttc EventLoop, bounded Tokio blocking jobs,

  response enqueue와 stop/drain/disconnect lifecycle을 소유하는 production v2 pump
- `protocol_v2.rs`: command topic의 protocol version을 먼저 판정하고 strict typed

  camera/screen payload, common identity, cancellation ID/token과 authorization binding을
  검증하는 v2 parser
- `protocol_v2_admission.rs`: parsed v2 command의 signature, current expiry와 atomic

  replay consume 순서를 소유하고 closed rejection을 반환하는 Application admission
- `protocol_v2_control.rs`: exact control request identity와 취소 대상 identity,

  cancellation ID/token, `effect.cancel` authorization을 strict parse하고 deterministic
  signing bytes로 결속하되 cancellation state는 변경하지 않는 v2 control contract
- `protocol_v2_control_admission.rs`: parsed control의 signature, current expiry와

  hashed replay identity 소비를 순서대로 수행하고 opaque admitted token만 반환하는
  Application admission
- `protocol_v2_cancel_response.rs`: cancel request ack를 대상 command terminal과

  분리해 exact identity, closed outcome와 `target_terminal=false`를 canonical bytes에
  결속하고 기존 response signer port로 서명하는 v2 response contract
- `protocol_v2_artifact_cancel_response.rs`: artifact cancel의 exact owner/transfer,

  observed/lifecycle revision과 `cancelled|already_cancelled|rejected` 결과를 command
  terminal과 분리해 서명하는 requester response contract
- `protocol_v2_artifact_fetch_response.rs`: 구조·서명 admission을 통과한 artifact fetch가

  exact transfer를 준비하지 못했을 때 owner/request/operation/revision과 closed reason을
  결속해 서명하는 requester response contract. Raw bytes와 local path는 포함하지 않습니다.
- `mqtt_v2_artifact_adapter.rs` / `mqtt_v2_control_router.rs`: valid fetch를 YAC2 chunk batch로,

  admitted Application rejection을 signed fetch-result response로 구분합니다. Parse·signature·scope
  admission 실패는 requester lifecycle 사실로 승격하지 않습니다.
- `v2_cancel_use_case.rs`: admitted control을 exact instance/session/fingerprint owner

  scope로 재검증한 뒤 기존 `ActiveCommandRegistry` 하나에만 전달하고 non-terminal
  typed acknowledgement를 만드는 cancellation Application use case
- `protocol_v2_operation.rs`: admission 성공 token과 runtime-owned platform/policy/

  cancellation/artifact snapshot만 받아 공통 `BoundPlatformOperation`을 만드는 mapper
- `protocol_v2_rejection.rs`: parser/admission의 closed error variant를 pre-effect

  stage/reason/effect/retry/recovery contract로 exhaustively 투영하는 boundary
- `protocol_v2_command_rejection.rs`: untrusted command identity를 복원하지 않고

  exact requester topic identity와 input digest에 결속하는 signed pre-effect response
- `protocol_v2_terminal.rs`: accepted response identity와 exact-bound TerminalReceipt를

  결합하고 mismatched receipt를 거절하며 schema-3에서 receipt query scope를 명시하는
  transport-independent response content. Schema-1/2 durable content는 read-only
  compatibility로 유지합니다.
- `node.rs`: 요청 dispatch, 권한 게이트, 액션 기반 메서드 진입점
- `runtime.rs`: validated global in-flight limit, Tokio semaphore와 owned blocking task를

  사용하는 standalone bounded supervisor
- `managed_request.rs`: transport-neutral execution/cancellation use case와 stable

  redacted public response projection
- `managed_composition.rs`: typed config와 consuming dependencies로 authorization,

  store, supervisor, single runtime host와 dispatcher를 조립하는 standalone root
- `instance_process_lease.rs`: executable/config/instance ID를 받지 않는 단일 fixed
  product-key OS-runtime filesystem lease adapter입니다. Secure open, symlink rejection과
  file-descriptor RAII release만 소유하며 process scan, PID 판정이나 lock-file deletion은
  하지 않습니다. 이전 instance-bound adapter와 재획득 경로는 제거되었습니다.
- `request_dispatcher.rs`: caller-owned Tokio handle과 bounded owned permits로 managed

  response task를 생성하는 infrastructure dispatch seam
- `completed_idempotency.rs`: authorization과 exact side-effect scope에 결속된 public

  terminal response store port와 bounded process-local adapter
- `durable_completed_store.rs`: injected revisioned raw storage port를 사용하는 bounded

  durable record adapter와 non-destructive bootstrap
- `durable_cancellation.rs`: cancellation request ID와 canonical target/token digest를

  exact binding한 versioned prepared/terminal control receipt repository. 같은 repository의
  분리된 namespace가 bounded terminal command index를 보관하며 capacity에서는 가장
  오래된 terminal index만 교체합니다.
- `durable_response_archive.rs`: receipt payload와 분리된 normalized public response를

  bounded opaque reference로 보관·복구하는 injected revision-CAS archive adapter
- `durable_retention.rs`: quiescent bootstrap에서 expired terminal receipt와 exact

  linked response만 bounded하게 정리하는 explicit retention use case
- `atomic_local_storage.rs`: caller가 지정한 exact data/lock path에 bounded,

  checksummed envelope를 atomic replace하는 공통 raw durable storage adapter
- `runtime_host.rs`: validated worker bounds와 process lease를 소유하는 단일 Tokio

  multi-thread runtime composition host
- `cancellation.rs`: transport와 무관한 canonical cancellation target, active command

  exact binding, bounded terminal tombstone, cancellation signal과 lifecycle removal registry.
  Runtime shutdown을 같은 registry state에 latch해 이후 등록되는 accepted command도
  별도 boolean 사본 없이 즉시 `runtime_shutdown` cancellation으로 전이
- `request_lifecycle.rs`: I/O 없는 request state/event reducer, interrupted cancellation

  stage, immutable cancellation reason과 terminal outcome의 canonical contract
- `authorization.rs`: issuer-neutral structured receipt, exact authorization context,

  injected verifier port와 fail-closed default verifier
- `authorization_bootstrap.rs`: raw environment/file read 없이 issuer, audience,

  ephemeral secret, replay capacity와 clock을 admission dependency로 조립
- `credential_store.rs`: broker/pairing secret bundle port, redacted/zeroizing lease,
  secure-write-first legacy migration과 macOS Keychain adapter
- `settings.rs`: versioned typed settings validation, read-without-write legacy projection,
  explicit atomic save, validated backup/rollback과 review-required runtime permission snapshot
  adapter. Composition root가 지정한 explicit settings path는 default path를 바꾸지
  않고 missing/default와 unsafe/invalid를 구분합니다. Hydrated runtime settings와
  broker connection의 Debug projection은 identity, path, broker password와 pairing
  secret을 redaction합니다.
- `artifact_sink.rs`: configured root와 instance scope에 결속된 capture artifact port,
  exact operation lease, opaque local reference resolve와 explicit delivery cleanup
- `request_schema.rs`: bounded bytes, top-level version과 unknown field를 검증하는 strict

  canonical parser; legacy `Request` parser와 activation은 분리
- `method_descriptor.rs`: 유일한 method inventory와 method별 typed input/output schema,
  risk, side effect, permission, resource, timeout, executor availability, approval,
  cancellation, retry safety와 post-check의 canonical registry
- `params_schema.rs`: descriptor가 선택하는 bounded executor/capture DTO와 strict
  pre-dispatch validator
- `side_effect_admission.rs`: method, params, exact binding과 authorization 검증 순서를

  소유하는 transport-independent Application use case
- `platform_execution.rs`: OS·transport·runtime에 의존하지 않는 closed execution stage,

  effect state, retry safety, recovery action, known failure reason과 public evidence
  reference 불변식을 소유하는 Domain contract
- `platform_operation.rs`: camera/screen typed command와 request, requester, authorization,

  policy revision, exact target, idempotency, deadline, cancellation, artifact lease를 하나의
  canonical SHA-256 binding으로 묶고 preflight receipt의 exact/fresh 검증을 소유하는
  Domain contract. OS 권한 요청 가능 표시는 available camera의 `not_determined` 관측에만
  생성할 수 있으며 다른 명령, 거부 또는 제한 상태에는 사용할 수 없습니다.
- `platform_port.rs`: Application이 소유하는 `preflight`/`execute` 두 메서드의

  `PlatformCapabilityPort`와 exact operation에 결속된 bounded native effect receipt
- `execute_capability.rs`: injected port, clock, cancellation과 optional typed resource

  admission만 사용해 preflight, exact/fresh 검증, capability·permission admission,
  단일 execute와 effect receipt 검증 순서를 소유하는 transport-neutral Application
  use case. 정확히 결속된 camera permission-requestable receipt만 OS 동의 단계까지
  실행하고 일반 `not_determined`, 화면 캡처, denied와 restricted는 effect 전에 닫습니다.
- `stage_timing.rs`: direct MQTT queue/authorization/handler/post-check/publish/transfer/ack의
  closed duration evidence와 optional observation port. SHA-256 correlation과 bounded
  time만 허용하며 execution/effect/retry/delivery outcome을 결정하지 않습니다.
- `stage_timing_jsonl.rs`: composition이 명시적으로 활성화할 때 최대 4,096개의
  path-free Product stage-duration JSONL만 쓰는 owned writer/system-clock adapter.
- `blocking_resource_admission.rs`: Tokio blocking worker 안에서 exact target과 typed

  camera device/screen display key별 scoped permit을 소유하는 Infrastructure adapter.
  Waiting cancellation/deadline, bounded slot과 permit drop notification을 처리
- `terminal_receipt.rs`: exact bound identity, closed execution outcome과 독립 delivery

  outcome, revision과 optional typed failure의 조합 불변식을 소유하는 Domain contract
- `v2_terminal_repository.rs`: v2 idempotency key와 exact command/effect scope digest를

  atomic claim하고 pending/completed terminal content를 구분하는 bounded repository
- `contract_only_platform.rs`: Android, iOS와 unknown target을 executable adapter로

  가장하지 않고 effect 없이 `capability_unavailable`로 닫는 typed Platform adapter
- `legacy_platform_failure.rs`: 기존 typed camera/helper/artifact error와 owning

  stage/effect context를 closed failure로 바꾸고 unknown `anyhow` text를 버리는
  compatibility boundary. 지원하지 않는 screen display 선택은 helper unknown
  failure가 아니라 ingress `InvalidRequest`, `NotStarted`, `CorrectRequest`로 mapping.
  Camera spawn/exit/protocol/timeout/cancel도 closed reason으로 exhaustively mapping
- `legacy_capture_platform.rs`: composition에서 주입받은 기존 `AutomationBackend`,

  `CaptureArtifactSink`, clock와 exact cancellation resolver를 camera/screen 명령에
  연결하는 common-port compatibility adapter. Camera의 typed permission status 전체를
  사용해 `not_determined + can_attempt_capture + requires_user_action`일 때만 권한 요청
  가능 receipt를 만들며, adapter 자체가 사용자 승인이나 OS 권한 결정을 소유하지 않습니다.
- `platform/shared.rs`의 Windows/Linux camera process owner는 1~60초로 정규화한
  operation budget, exact cancellation flag, bounded pipe drain과 process-tree reap을
  한 lifecycle로 소유합니다. Native stdout/stderr는 성공 protocol parsing에만
  사용하고 실패 evidence에는 포함하지 않습니다.
- `platform/windows.rs`는 camera와 screen native helper에 넘기기 직전에
  canonical `\\?\` local/UNC path를 Win32-compatible path로 바꾸며, 변환 뒤
  259 UTF-16 unit을 넘는 output은 effect 전 `*_output_path_unsupported`로 닫습니다.
  Application artifact identity나 caller path를 이 경계에서 다시 만들지 않습니다.
- `mqtt_admission.rs`: common admission outcome을 raw receipt 없이 stable MQTT

  rejection response로 투영하는 compatibility adapter seam
- `gui.rs`: 고정 크기 설정 다이얼로그. local screen capture policy가 허용된 첫 GUI
  시작은 durable one-time marker를 먼저 저장한 뒤 `system_screen_permission` adapter에
  macOS 권한 요청을 한 번만 전달하며 MQTT runtime에는 그 경로를 노출하지 않습니다.
  권한 탭은 read-only observation과 marker를 `허용됨` 또는 `요청 후 미허용`으로만
  투영하며, macOS가 제공하지 않는 거부/미결 구분을 추측하지 않습니다.
- `automation`, `features`, `platform`: 추상화 계층과 OS별 구현

## 메모

- 이 폴더는 전송 계층, UI, 실행 추상화를 비교적 명확히 분리하고 있습니다.
- Standalone managed composition은 authorization input과 clock, settings, backend,
  process-lifetime runtime lease guard를

  dependency로 소비하고 bounded host/runtime/dispatch/completed config만 받습니다.
  Composition은 backend capability를 시작 시 한 번 snapshot으로 만들고 managed
  runtime과 MQTT presence projection에 함께 전달합니다. MQTT reconnect, status와
  capability 발행은 이 immutable snapshot만 사용하며 platform backend를 다시
  선택하지 않습니다.
  Owned headless path는 single Tokio host를 획득하고, shared GUI path는 caller handle을
  사용합니다. 두 경로 모두 packaged/standalone bootstrap이 이미 획득한 fixed OS-runtime
  guard를 consuming dependency로 받아 재획득하지 않습니다. 후속 build failure와 async
  shutdown은 dispatcher delivery를 drain한 뒤 guard와 owned host를 반환합니다. 시작 때
  주입된 settings snapshot을 그대로 보유해 controlled MQTT를 연결하며, MQTT 시작 실패도
  owner drop으로 runtime guard를 반환합니다. Environment/file
  재읽기와 default MQTT activation은 이 root에 포함하지 않습니다.
- Packaged `--managed`, `--headless-managed`와 `--managed-tls` bootstrap은 settings,

  credential과 optional TLS material을 시작 시 한 번 typed dependency로 만든 뒤 위
  managed root를 활성화합니다. Headless request는 dispatcher permit을 획득하기 전에
  backend를 실행하지 않으며 request별 legacy OS thread를 만들지 않습니다. Sync process
  entry의 event loop가 닫히면 `ManagedMqttRuntime::shutdown_blocking`이 owned Tokio
  host에서 async connection/dispatcher drain을 완료하고 host lease를 반환합니다.
  `system_automation_backend`는 private platform adapter를 Application port로 투영하는
  bootstrap factory일 뿐 runtime 설정이나 외부 값을 다시 읽지 않습니다.
- Packaged stdio도 `main.rs`가 만든 같은 `AutomationBackend` port를 명시적으로
  주입받습니다. `stdio.rs`에는 concrete platform 선택이나 default backend wrapper가
  없으며 authenticated/non-authenticated entry가 동일한 bounded dispatcher
  composition을 사용합니다.
- GUI composition은 `build_managed_runtime_on_handle`로 Iced의 current Tokio handle을

  명시적으로 주입하며 별도 `TokioRuntimeHost` lease를 획득하지 않습니다. GUI state는
  runtime object 유무를 boolean처럼 추측하지 않고 `Idle`, `Running`,
  `Stopping(StopAfter)` 전이 하나로 connect/disconnect/reconnect/quit을 직렬화합니다.
  재연결은 이전 async drain 완료 뒤에만 시작하며 요청 당시 settings snapshot을
  보존합니다. 정상 quit은 connection/dispatcher drain 완료 메시지를 받은 뒤 window를
  닫고, 비정상 UI drop은 최소한 transport stop signal을 보냅니다.
- 공통 startup mode classifier 뒤 bootstrap은 settings/config/credential/runtime 활성화 전에
  stable per-user OS root의 fixed runtime lease를 한 번 획득합니다. Guard는 GUI, managed 또는
  stdio process owner로 이동하며 downstream composition은 provider를 재호출하지 않습니다.
  Existing stale file은 OS lock 획득으로 복구하고 active owner와 unsafe/symlink root는
  fail-closed합니다. 정상 owner drop과 process 종료만 lock을 반환합니다.
- Managed root의 기존 constructor는 process-local completed 경로를 그대로 유지합니다.

  Durable activation은 별도 `ManagedRuntimeDependencies::new_with_durable`과
  `ManagedDurableDependencies`로만 가능하며, caller가 bootstrap 검증을 끝낸 record
  store, response resolver/archive를 clock과 함께 supervisor에 주입합니다. 실제
  exact-path atomic local record/response/cancellation storage 조합의 first execution과
  새 managed runtime restart replay는 동일 side effect count 1을 보장합니다. Concrete
  path discovery는 여전히 이 composition root 밖의 bootstrap 책임입니다.
  Optional cancellation receipt store도 `ManagedDurableDependencies::with_cancellations`
  에서만 추가하며 legacy constructor의 process-local cancellation 동작은 유지합니다.
- `tests/support/ControlledTestProvider`는 production package에 포함되지 않으며 public

  canonical parser, dispatcher와 delivery port만 조합합니다. Agent/Skill/Gateway나
  LLM 응답을 모사하지 않고 구조화된 요청부터 correlation별 delivered response까지
  standalone scenario를 검증합니다. 같은 fixture가 pending overflow, permit recovery와
  shutdown 이후 rejection도 public dispatcher 계약으로 확인합니다. Authorized camera
  fixture에서는 exact cancel acknowledgement의 `terminal: false`와 원 camera 요청의
  별도 terminal cancelled response가 correlation별로 한 번씩 전달되는지도 검증합니다.
  Wrong-token/target은 active 작업을 유지하고, duplicate exact cancel은 non-terminal
  duplicate acknowledgement입니다. 원 요청 terminal 뒤 versioned exact late cancel은
  already-terminal이고 legacy command/token 요청은 active-only라 not-active입니다.
- Agent 쪽 integration은 `skill:yeonjang` catalog 하나와 컴퓨터별

  `capability_kind: "yeonjang"` binding N개를 외부 consumer에서 조합합니다. 기능별 또는
  instance별 Skill을 만들지 않으며 Rust library/provider는 이 catalog, binding DB와
  Agent enablement를 import하지 않습니다.
- 외부 protocol client의 승인 대기와 durable continuation은 하나의 저장 상태를
  사용합니다. 취소가 dispatch보다 먼저 확정되면 continuation을 terminal
  `cancelled`로 기록하고 Yeonjang command를 보내지 않습니다. request group 취소는
  client가 이미 기록한 child dispatch별 command ID, cancel token과 target session으로
  확장하며 Yeonjang에 group/broadcast cancellation을 보내지 않습니다.
- Versioned cancel DTO의 request/command/operation/session/fingerprint/idempotency target은

  active registry, terminal tombstone과 durable receipt에서 하나의 value contract로
  사용합니다. Durable 저장에는 raw target과 cancel token 대신 digest만 남기며 restart
  뒤 exact late cancel도 원 effect를 재실행하지 않고 already-terminal로 복원합니다.
- Exact cancel adapter는 external reason kind를 Domain cancellation reason으로 명시
  변환합니다. Duplicate cancel은 최초 reason을 덮어쓰지 않으며 supervisor shutdown은
  active side effect에 같은 signal을 runtime-shutdown reason으로 전달한 뒤 permits와
  cleanup을 drain합니다.
- Packaged stdio는 legacy `Request` parser와 request별 direct thread handler를 사용하지
  않습니다. 512 KiB를 넘는 line은 bounded reader에서 나머지를 폐기하고 redacted
  invalid-request로 닫으며, canonical request만 bounded dispatcher와 common admission을
  거쳐 completion order로 single writer에 전달됩니다. EOF에서는 outstanding response와
  supervisor를 차례로 drain합니다.
  Dispatcher pending capacity와 runtime in-flight capacity는 같은 8로 결속되어 reader가
  capacity에서 terminal을 기다리며, 이미 accepted된 read-only 요청이 내부 admission
  순서 경쟁으로 backpressure 실패하지 않습니다.
- Authenticated stdio는 통제된 local provider test를 위한 명시적 bootstrap profile입니다.
  issuer, key ID, audience와 secret을 시작할 때 한 번 typed input으로 검증하고 같은 stdio
  parser/scheduler/admission/writer를 사용합니다. 입력이 없거나 유효하지 않으면 runtime과
  backend 생성 전에 실패합니다. Secret은 command argument, settings, response와 log에
  넣지 않으며 production activation은 secure credential provider의 ephemeral lease
  adapter가 연결된 뒤에만 허용합니다.
- Legacy `--exec`와 `--exec-bin`은 unbound `Request`와 direct worker를 만들지 않습니다.
  settings/runtime/backend 생성 전에 stable typed error로 닫히며 command text도
  response나 diagnostic에 반사하지 않습니다. Local execution의 지원 경계는 strict
  canonical authenticated stdio 하나입니다.
- `features/system.rs`는 `system.exec` command/args/cwd/env/timeout을 typed bounded

  `CommandExecutionRequest`로 검증한 뒤에만 backend port를 호출합니다. 자연어 의미나
  command substring으로 intent를 추측하지 않습니다. `platform/shared.rs`는 stdout과
  stderr를 끝까지 drain하되 각각 1 MiB까지만 보존하고 truncation을 표시합니다.
  Cancellation/timeout은 Unix process group 또는 Windows process tree를 종료하며
  `command_cancelled`는 canonical cancelled terminal lifecycle로 투영됩니다.
- Production GUI와 managed MQTT composition은 시작 시 broker password를 consuming
  secret으로 받아 `knowbee-core` issuer, `mqtt-connection-password-v1` key ID와
  current node ID audience의 common `SideEffectAdmission`을 만듭니다. 누락되거나
  16 bytes 미만이면 runtime/backend 생성 전에 fail-closed합니다. Low-level default와
  dispatcher constructor의 RejectAll verifier는 read-only test/compatibility 경계로
  남고, production entry는 이를 사용하지 않습니다. Optional admission과 binding-only
  fallback은 없습니다.
- Normal settings JSON은 broker password와 pairing secret을 직렬화하지 않습니다.
  Legacy file migration은 instance ID에 결속된 단일 credential bundle을 provider에
  먼저 저장하고 성공한 경우에만 secret이 제거된 settings를 same-directory
  temporary file, file sync, atomic rename과 directory sync로 교체합니다. macOS
  production adapter는 Keychain generic-password entry를 사용하고 시작 시 한 번
  process snapshot을 복원합니다. provider/settings save 실패는 stable typed code로
  닫히며 원래 settings 입력과 파일을 성공으로 취급하지 않습니다. Windows/Linux는
  secure adapter가 추가되기 전까지 unavailable입니다.
- Capture artifact manifest commit은 temporary manifest file의 `sync_all`과 atomic
  rename을 공통 성공 경계로 사용합니다. Unix는 이어 directory metadata를
  `sync_all`하지만, Windows는 directory를 일반 file로 열 수 없으므로 이미 동기화된
  manifest와 atomic rename까지만 지원 계약으로 삼고 이를 실패로 가장하지 않습니다.
- Plain TCP MQTT transport는 `localhost`와 loopback IP만 허용합니다. Remote hostname/IP는
  DNS/socket 이전 bootstrap validation에서 닫히며 typed CA/client identity dependency가
  없는 constructor는 non-loopback broker를 활성화하지 않습니다.
- `--managed-tls` bootstrap은 세 PEM path를 environment에서 한 번 받고 각 파일을
  1 MiB로 제한해 읽은 뒤 syntax를 검증한 immutable mutual-TLS dependency만 MQTT
  composition에 전달합니다. MQTT reconnect는 이 startup snapshot을 재사용하며 raw
  path/material은 inward contract, Debug, response와 log에 없습니다.
- `tests/controlled_mqtt_provider.rs`의 loopback broker는 production managed MQTT entry와

  MQTT 3.1.1 CONNECT/SUBSCRIBE/PUBLISH/PUBACK/DISCONNECT 프레임을 사용합니다. Canonical
  request가 dispatcher와 injected backend를 거쳐 같은 correlation ID의 terminal
  response로 publish되고, managed shutdown 뒤 host lease가 반환됨을 확인합니다. 이
  harness는 첫 연결을 끊고 실제 retry backoff 뒤 재연결·재구독합니다. 같은
  authorization/exact side-effect scope의 signed camera request를 새 delivery ID로
  redeliver했을 때 terminal response는 delivery별로 반환되지만 backend effect는 한
  번만 실행됨을 확인합니다. Harness는 test support에만 있으며 TLS와 process restart는
  아직 검증하지 않습니다. Credential migration/restart는 injected fake provider와
  active macOS Keychain smoke로 별도 검증합니다.
- `tests/controlled_mqtt_v2.rs`는 Gateway/TypeScript/stdio 없이 rumqttc MQTT 3.1.1
  reference client를 exact v2 command/response topic에 연결합니다. Controlled broker가
  동일 QoS 1 command bytes를 같은 connection에서 두 번 보내고, client는 두 signed
  non-retained response를 QoS 1로 publish하며 broker PUBACK까지 polling합니다. 두
  response의 terminal payload는 같고 platform effect count는 1입니다. 기존 v1 broker
  mode는 계속 `id/ok` terminal만 수집하고 v2 redelivery mode만 strict v2 JSON을
  수집하므로 이전 harness 의미를 바꾸지 않습니다. 이 증거는 reference integration이며
  production reconnect pump와 TLS/mTLS는 아직 후속입니다.
- `tests/independent_mqtt_v2_broker.rs`와
  `scripts/self/run-yeonjang-independent-mqtt-gate.sh`는 ephemeral CA와 서로 다른
  server/Yeonjang/requester/probe identity를 만들어 독립 Mosquitto 2.0.22에서
  production mutual-TLS factory를 검증합니다. Exact requester command/response의
  QoS1 왕복과 PUBACK, broker-accepted cross-target probe의 비전달, client certificate
  누락·비신뢰와 hostname mismatch rejection, 세 client의 DISCONNECT 및
  container/key-material cleanup을 확인합니다. Script는 authenticated TLS handshake
  성공 뒤에만 test process를 시작합니다. Mosquitto가 ACL 구독을 승인한 뒤
  delivery에서 필터링할 수 있으므로 SUBACK 문구가 아니라 실제 non-delivery가
  authorization 증거입니다. 이 gate는 Gateway/channel/device effect를 사용하지 않으며
  기본 mode만으로 camera/screen artifact 완료를 증명하지 않습니다.
- `tests/support/packaged_desktop_live_mqtt.rs`는 package identity, signed request,
  policy rollback, camera/screen, artifact, duplicate, reconnect와 restart 검증을
  desktop 공통 계약으로 소유합니다. `packaged_macos_live_mqtt.rs`와
  `packaged_linux_live_mqtt.rs`는 target identity만 선택하는 얇은 opt-in 진입점입니다.
  Reference requester가 terminal, path-free descriptor, chunk/full digest와 dimensions를
  검증한 뒤 exact ack하며, capture 파일 제거와 durable cleanup receipt, graceful
  offline과 같은 instance restart를 확인합니다. Linux는 Wayland와 X11을 별도 host
  실행으로 기록합니다. Gateway/channel과 OS permission 변경은 수행하지 않습니다.
- Windows live entry는 .NET native architecture와 release target/PE/manifest/loaded
  identity를 함께 검증하며 x64와 ARM64만 허용합니다. Parallels ARM64와 Ubuntu X11의
  실제 성공은 각각 해당 cell만 채우고 Windows x64나 Ubuntu Wayland 결과로
  복제하지 않습니다.
- Packaged managed entry의 `--config-root`는 settings, permission policy와 MQTT durable
  state를 caller-validated absolute root 하나에 결속합니다. OS-runtime singleton guard는
  config root와 분리된 product root에서 packaged bootstrap이 먼저 acquire해 direct MQTT
  production composition으로 mandatory transfer하며, inner composition은 lease를 재획득하지 않습니다.
  `--broker-secret-stdin`은 최대 4,096 bytes secret을 EOF까지 한 번 읽으며 non-secret
  bootstrap이 끝난 뒤 production config가 즉시 소비합니다. 두 옵션은 독립 release
  harness가 default user data나 Keychain을 사용하지 않고 정식 composition을 실행하기
  위한 bootstrap boundary이며 authorization이나 policy를 우회하지 않습니다.
- Provider signed redelivery fixture는 같은 authorization/exact side-effect scope와 proof를

  서로 다른 delivery ID의 canonical payload로 보냅니다. 두 correlation response는
  각각 한 번 전달되지만 camera backend 호출은 한 번뿐임을 검증합니다.
- standalone runtime shutdown은 하나의 공유 admission 상태를 먼저 닫아 모든 clone의

  새 요청을 `ShuttingDown`으로 거부한 뒤, 이미 발급된 semaphore permit을 모두
  회수할 때까지 기다립니다. shutdown은 실행 중 요청을 중간에 성공으로 바꾸거나
  강제 취소하지 않습니다.
- Tokio runtime 생성은 `runtime_host.rs`만 소유합니다. 두 번째 host는

  `AlreadyOwned`로 거부되고, host drop은 runtime을 shutdown한 뒤 process lease를
  반환합니다. Worker와 blocking worker 수는 host 생성 전에 bounded typed config로
  검증하며 raw environment를 내부에서 읽지 않습니다.
- `TokioRequestDispatcher`는 runtime을 만들지 않고 composition root가 준 handle만

  사용합니다. Validated pending capacity의 owned permit을 spawn 전에 획득하며
  overflow는 `Backpressure`로 거부합니다. Delivery port를 사용하는 task는 request
  실행부터 response 전달 완료까지 같은 permit을 유지합니다. Permit은 정상 완료와
  task unwind에서 함께 회수되고 caller가 각 completion `JoinHandle`을 소유합니다.
  `DispatchCompletion`은 handler가 만든 execution response와 delivery 성공/실패를
  합치지 않으며, delivery 실패가 성공한 effect 결과를 다시 쓰지 않습니다.
  Shutdown은 모든 clone의 admission을 하나의 atomic state로 닫고 이미 발급된 permit
  전부가 반환될 때까지 기다리며, 이후 요청은 `ShuttingDown`으로 구분합니다.
- standalone side effect는 공통 `SideEffectBinding` 검증을 통과한 뒤에만 active

  command registry에 등록됩니다. `RuntimeSupervisor::cancel`의 `Accepted`는 exact
  command/token의 cancellation signal 접수만 뜻하며, 원 `execute`가 반환하는
  `camera_capture_cancelled` 같은 terminal response와 구분됩니다. cleanup guard는
  정상 종료와 worker panic 모두에서 active entry를 제거합니다.
- `ManagedRequestService`는 일반 요청을 supervisor에 위임하고 exact

  `command.cancel` control DTO만 별도로 처리합니다. Cancellation `Accepted`와
  `Duplicate` 응답은 `terminal: false`를 명시하며, 실제 terminal 결과는 원 요청의
  단일 response에서만 확정됩니다. Runtime rejection 상세는 bounded stable code로
  투영하고 raw worker/authorization detail을 노출하지 않습니다.
- exact binding 뒤에도 structured authorization receipt와 injected verifier의

  `Authorized` 결과가 없으면 standalone side effect는 실행되지 않습니다. 기본
  verifier는 항상 unavailable로 거부하며 receipt proof는 Debug에서 redacted됩니다.
- `HmacAuthorizationVerifier`는 injected clock과 immutable issuer/audience/secret을

  사용해 length-prefixed payload의 issuer key ID, method/resource/command/operation/
  target/idempotency/expiry scope를 constant-time HMAC으로 검증합니다. TypeScript
  Knowbee issuer는 같은 UTF-8 byte length canonical payload를 사용하고, caller-supplied
  camelCase/snake_case receipt를 제거한 뒤 승인된 exact side-effect operation에 대해서만
  MQTT dispatch가 생성한 command/idempotency/expiry에 결속해 서명합니다. Process-local
  replay guard는 proof 검증 뒤
  authorization ID를 atomic consume하며 bounded capacity, expiry eviction과
  fail-closed saturation을 적용합니다.
- Authorization bootstrap input은 secret을 consuming value로 받아 Debug/Clone 없이

  verifier에 전달합니다. Empty/short secret, issuer/audience와 zero replay capacity는
  admission dependency 생성 전에 typed error로 거부됩니다. Replay capacity는 0뿐
  아니라 `u32::MAX` 초과도 bootstrap과 adapter 양쪽에서 거부됩니다.
- Completed idempotency repository는 idempotency key만으로 hit를 판단하지 않고

  authorization ID, method/resource, command/operation, target, expiry 전체가 같을 때만
  public response 복사본을 반환합니다. 같은 key의 다른 scope는 `ScopeMismatch`, 새
  record의 bounded capacity 초과는 `Saturated`이며 기존 exact record를 덮어쓰지
  않습니다. Raw authorization proof/request/evidence는 저장하지 않습니다.
- Idempotency claim은 같은 repository mutex 안에서 capacity 확인과 pending insert를

  원자적으로 수행합니다. 첫 exact scope만 `Claimed`, 실행 중 exact duplicate는
  `InProgress`, terminal public response로 complete된 뒤에는 immutable cached response를
  반환합니다. Scope collision은 claim/complete 어느 단계에서도 상태를 바꾸지 않습니다.
- Exact pending claim은 worker가 terminal response를 만들지 못했을 때만 abandon할 수

  있고 즉시 capacity를 회수합니다. Missing/mismatched/completed record의 abandon은
  상태를 바꾸지 않으며 completed response는 계속 immutable합니다.
- active command entry는 cancellation flag와 별도 lifecycle 사본을 만들지 않고

  하나의 shared lifecycle handle을 함께 소유합니다. supervisor 실행, exact cancel,
  terminal completion과 panic cleanup은 모두 이 handle의 reducer를 통해서만
  상태를 바꿉니다. Handle의 `CancellationSignal`은 atomic flag와 단일 Future waker를
  함께 소유하므로 Tokio polling loop 없이 resource waiter를 즉시 깨웁니다.
- Active command cleanup은 완료 상태를 삭제만 하지 않고 같은 canonical registry

  lock 안에서 최대 512개의 terminal command tombstone으로 원자 전환합니다.
  Tombstone은 command ID, SHA-256 cancel-token digest와 terminal outcome만 보존하고
  raw token/response/evidence는 저장하지 않습니다. Exact late cancel은
  `command_already_terminal`, wrong token과 bounded eviction 뒤 요청은 `not_active`로
  구분되며 기존 command terminal은 다시 쓰지 않습니다. Cancel signal과 effect
  completion이 경쟁해 backend가 성공을 반환하면 non-terminal cancel control과 원
  success terminal을 모두 보존하고 이후 late cancel만 already-terminal로 닫습니다.
- 실행 전 또는 실행 중 cancellation terminal의 bounded `attempt` evidence에는 같은

  canonical lifecycle에서 읽은 `user_requested`, `deadline_exceeded` 또는
  `runtime_shutdown` 사유를 optional typed field로 보존합니다. Legacy response에는 이
  additive field가 없어도 decode되며 cancel acknowledgement는 terminal evidence를
  생성하거나 덮어쓰지 않습니다.
- request lifecycle은 boolean 조합 대신 closed state/event로 표현합니다. `Received`

  뒤 validation/admission을 분리하고, execution terminal outcome을 보존한 채
  `ResponseQueued -> Responded`만 한 번 진행합니다. cancel은 당시 active stage를
  보존하며 duplicate cancel, cancellation 없는 `Cancelled`, late execution과
  duplicate response transition은 명시적 rejection으로 남습니다.
- canonical request parser는 version 1, bounded request ID/method/params와 알려진

  top-level field만 허용합니다. 기존 additive parser는 mixed-version activation
  fixture가 준비될 때까지 그대로 유지하며 두 parser는 같은 `Request` DTO로 수렴합니다.
- test-only `TerminalResponseLedger`는 transport/dispatch acknowledgement를 완료로

  간주하지 않고 accepted request ID별 terminal response를 정확히 한 번만 받습니다.
  Side-effect response는 method, command, operation과 target fingerprint가 원 요청과
  모두 일치해야 하며, 같은 assertion 경계를 in-memory provider와 controlled MQTT
  black-box test가 공유합니다. 이 fixture는 `tests/support`에만 있어 production
  library와 package에는 포함되지 않습니다.
- Provider fixture의 bounded terminal order gate는 최대 256개 request ID와 timeout을

  명시적으로 받습니다. Library scenario는 10개 독립 요청의 실제 처리를 동시에
  시작하고 terminal delivery를 접수 역순으로 제어해, 완료 순서와 무관하게 exact
  terminal set을 ID별로 복원하는지 검증합니다. Empty/duplicate/unbounded order와
  terminal 누락은 typed assertion failure이며 production scheduling에는 관여하지
  않습니다.
- Slow camera가 blocking worker에서 실행 중이어도 별도 runtime permit이 있는

  read-only request는 camera 종료를 기다리지 않고 terminal response를 반환합니다.
  Provider scenario는 fast response 시점의 camera active state를 확인한 뒤 cancellation
  acknowledgement를 non-terminal control response로, 원 camera cancellation을 별도
  terminal response로 검증해 두 완료 의미가 합쳐지지 않게 합니다.
- `ExecutionResourceKey`는 descriptor resource와 명시적 camera device/screen display

  또는 exact target fingerprint에서 순수하게 파생됩니다. `TokioResourceAdmission`은
  최대 512개 weak keyed slot과 2초 FIFO semaphore wait를 소유하며, idempotency claim
  및 queued active lifecycle 뒤 global permit 전에 resource permit을 얻습니다. 따라서
  같은 camera는 backend에 겹쳐 들어가지 않고 순차 완료되며 camera와 screen은 global
  capacity 안에서 실제 병렬 실행됩니다. Waiting command의 exact cancellation은
  `CancellationRequested(Queued) -> Cancelling -> Cancelled`로 끝나 backend에 진입하지
  않고 pending idempotency claim, registry entry와 waiter를 회수합니다. Cancel control
  acknowledgement는 계속 non-terminal이고 원 command만
  `command_cancelled_before_execution` terminal을 반환합니다. Slot saturation/state
  failure와 wait timeout은 각각 typed
  `resource_state_unavailable` 또는 binding을 포함한 `resource_busy` terminal이고,
  permit drop 뒤 slot은 회수됩니다.
- Direct MQTT v2 common execute는 raw JSON이나 command ID가 아니라 이미 검증된

  `BoundPlatformOperation`의 instance/session/fingerprint와 typed device/display를
  length-delimited SHA-256 key로 변환합니다. Injected
  `BlockingExecutionResourceAdmission`은 같은 camera/display effect만 직렬화하며
  camera와 screen worker는 병렬로 유지합니다. Waiting operation은 exact
  cancellation이나 operation deadline에서 `not_started`로 닫히고 scoped permit은
  success/failure/cancel/unwind 모두에서 Drop으로 반환됩니다.
- Mouse, keyboard와 browser-focus side effect descriptor는 같은

  `desktop_control` resource를 사용합니다. 따라서 exact target fingerprint가 같은
  로컬 입력/포커스 작업은 하나의 keyed permit으로 순서가 보존되고, 다른 target은
  독립적으로 admission됩니다. 이 충돌 규칙은 scheduler의 method별 예외가 아니라
  canonical descriptor가 소유합니다.
- node capability projection, 광고 inventory와 side-effect binding 판단은
  `method_descriptor.rs`를 함께 사용합니다. Capability의 permission, approval,
  cancellation, timeout, input/output schema와 post-check 필드는 수동 복사본이 아니라
  descriptor에서 투영됩니다. unknown method는 `unknown_method`, 알려졌지만 executor가
  없는 method는 `method_unavailable`로 구분하며 둘 다 fail-closed합니다. Descriptor는 read-only
  operation을 `SafeNewAttempt`, side effect를 `ExactReceiptRequired`로 명시하므로
  restart retry safety를 method 문자열이나 오류 횟수로 추정하지 않습니다.
- standalone supervisor는 descriptor의 bounded executor/camera/screen params schema를 handler보다

  먼저 검증합니다. Unknown field, invalid type과 64 KiB 초과 params는 backend call
  없이 `InvalidParams`로 끝나며 legacy direct handler activation은 변경하지 않습니다.
- standalone supervisor는 개별 admission 규칙을 재구현하지 않고

  `SideEffectAdmission`의 `ReadOnly`/`SideEffect` 또는 typed rejection만 소비합니다.
  Bootstrap이 만든 동일 객체를 `RuntimeSupervisor::new_with_admission`에 직접 주입할
  수 있고, 기존 verifier constructor도 이 composition seam으로 수렴합니다. MQTT
  activation은 compatibility fixture 전까지 기존 경로와 분리합니다.
- Standalone supervisor side effect는 runtime permit 뒤 exact idempotency claim을

  executor보다 먼저 획득합니다. Active exact duplicate는 `IdempotencyInProgress`,
  scope collision과 repository unavailable은 별도 typed rejection입니다. Terminal
  response는 claim을 complete하고 redelivery는 backend 없이 cached response의 내용과
  현재 delivery request ID를 결합해 반환합니다. Worker panic cleanup은 pending claim을
  abandon합니다. Read-only와 기존 constructor는 같은 외부 계약을 유지합니다.
- Supervisor는 `CompletedResponseStore` port만 의존하며 process-local mutex repository는

  기본 composition adapter입니다. Claim/lookup/complete/abandon closed result는 port
  계약에 남습니다. Durable 경계는 별도 `DurableCompletedRecordStore` port와
  `DurableLoadResult`/`DurableSaveResult` closed result를 사용합니다. Version 1 durable
  record는 exact binding, succeeded/failed 또는 effect-state-unknown outcome,
  completed response의 SHA-256 digest와 bounded opaque reference, 관찰/finalize
  timestamp만 표현합니다. 8 KiB를 넘거나
  unknown/corrupt/version-mismatch인 record는 fail-closed이며 proof, raw request/response,
  evidence와 artifact bytes를 schema로 표현할 수 없습니다. 실제 response archive,
  storage adapter와 production startup activation은 후속 작업입니다.
- `DurableRecordRepository`는 path/environment를 탐색하지 않고

  `DurableRecordStorage`를 주입받습니다. Bootstrap은 record bytes를 한 번 읽어
  decode할 뿐 write하지 않으며 corruption, duplicate record, saturation과 unavailable을
  typed error로 닫습니다. Save는 bounded in-memory snapshot을 만든 뒤 revision
  compare-and-swap이 성공한 경우에만 canonical state를 교체합니다. Same exact key의
  terminal record는 immutable하고, same idempotency/different scope는 저장 전에
  거부됩니다. Filesystem/database adapter와 production composition activation은 아직
  활성화하지 않습니다.
- Durable side effect 실행은 exact record를 compare-and-swap으로

  `effect-state-unknown` 예약한 뒤에만 executor로 진입합니다. Executor 응답은 ID를
  제거한 public response를 별도 archive port에 보관하고 opaque reference와 SHA-256
  digest를 만든 후, 같은 예약을 succeeded/failed terminal record로 compare-and-swap
  finalize합니다. 순서는 `reserve -> effect -> archive -> finalize`이며 durable
  finalize 뒤에만 active lifecycle과 process-local completed claim을 완료합니다.
  Archive/finalize 실패, worker crash 또는 재시작으로 예약만 남으면 자동 재실행하지
  않고 `effect_state_unknown`으로 닫습니다. Terminal record는 다시 변경할 수
  없습니다.
- `ResponseArchiveRepository`는 caller가 주입한 `RawResponseArchiveStorage`만

  사용하며 path/environment를 탐색하지 않습니다. Bootstrap은 기존 entry를
  non-destructive하게 읽어 schema version, normalized response shape, per-entry/total
  byte limit과 content-addressed opaque reference를 검증합니다. Delivery request ID는
  저장하지 않으며 corruption, reference mismatch, capacity와 compare-and-swap
  conflict를 fail-closed 처리합니다. Default filesystem/database storage와 artifact
  blob retention은 활성화하지 않습니다.
- `AtomicLocalStorage`는 absolute data/lock path와 byte limit을 constructor input으로만

  받습니다. 같은 non-symlink parent의 exact path만 허용하고 read/bootstrap은 missing
  data file을 생성하지 않습니다. Write는 explicit lock 아래 revision을 다시 확인해
  stale writer를 conflict로 닫고, mode 0600 temporary file의 write/sync 뒤 same-directory
  atomic replace와 directory sync를 수행합니다. Versioned envelope의 SHA-256 digest,
  revision, file/raw byte bound와 corruption을 startup health에서 검증하며 record와
  response archive raw port가 같은 adapter 계약을 사용합니다. Environment/path
  discovery와 destructive automatic migration은 포함하지 않습니다.
- Local storage는 malformed/digest failure와 unsupported schema version을 서로 다른

  startup error로 반환합니다. Backup은 caller가 같은 안전한 parent의 exact backup
  path를 명시한 경우에만 validated primary snapshot을 mode 0600 temporary
  write/sync와 atomic no-overwrite link로 생성합니다. Rollback도 별도 explicit API가
  backup envelope를 먼저 검증한 뒤 storage lock 아래 primary를 atomic replace합니다.
  Backup/rollback은 자동 실행되지 않으며 invalid backup이나 write failure는 기존
  primary를 변경하지 않습니다.
- `LinkedDurableRetention`은 runtime에 공유되기 전 `&mut` record/archive repository를

  함께 받아 quiescent ownership을 강제합니다. Caller가 주입한 `now_ms`, 최소 terminal
  보존 수와 최대 removal 수만 사용하며 authorization expiry가 지난 completed terminal
  중 오래된 항목만 receipt-first 순서로 제거합니다. Exact response가 다른 receipt에서
  참조되지 않을 때만 뒤이어 제거하므로 중간 CAS 실패는 안전한 orphan만 남깁니다.
  Unknown-effect reservation은 절대 제거하지 않으며 하나라도 존재하면 연관 가능성이
  있는 일반 orphan response 정리도 건너뜁니다. Retention은 saturation이나 retry
  횟수로 암묵 실행되지 않고 completed/unavailable count result를 반환합니다.
- Durable cancellation은 validated cancellation request ID, command ID와 cancel token의

  SHA-256 digest만 저장하며 raw token은 schema에 없습니다. Active exact binding을
  확인한 뒤 `Prepared`를 CAS 저장하고 registry cancellation을 요청한 다음
  accepted/duplicate/already-terminal outcome으로 immutable finalize합니다. 같은
  cancellation ID의 restart redelivery는 exact receipt outcome을 재생하고, crash로
  prepared만 남은 경우 process 종료와 side-effect unknown/completed recovery를 전제로
  accepted로 finalize합니다. Same ID/different command 또는 token은 registry를
  변경하지 않고 거부합니다. Not-active와 invalid token 요청은 durable capacity를
  소비하지 않으며 persistence failure는 `cancellation_state_unavailable`로
  fail-closed 처리합니다.
- Supervisor의 optional `DurableRecoveryDependencies`는 exact record store와 response

  reference resolver를 주입받고, 첫 실행 persistence에는 response archive와 clock도
  명시적으로 주입받습니다. Fresh verifier가 authorization을 승인한 restart
  redelivery도 permit, local claim과 backend 전에 durable record를 조회합니다.
  Completed response는 ID를 제외한 public response SHA-256 digest와 succeeded/failed
  outcome/error code가 모두 맞을 때만 현재 delivery ID로 복구합니다. Unknown-effect
  record는 resolver나 backend를 호출하지 않고 `effect_state_unknown`, missing/corrupt
  reference 또는 digest mismatch는 `durable_recovery_unavailable`, same-key/different
  scope는 `idempotency_scope_conflict`로 끝납니다. Managed projection은 unknown을
  단순 handler failure로 축소하지 않고 `terminal_stage: effect_state_unknown`과
  `retry_safety: unknown_effect_state`의 bounded attempt evidence로 반환해 post-check
  대상으로 명시합니다.
- HMAC verifier의 `Replayed`는 exact scope와 expiry, proof 검증을 먼저 통과한 뒤에만

  발생합니다. Supervisor는 process-local completed repository를 먼저 조회하고 miss면
  optional durable recovery로 수렴합니다. Durable dependency가 없는 기존 constructor는
  replay miss를 계속 authorization rejection으로 유지합니다. Invalid proof나 expired
  receipt는 어떤 completed cache lookup으로도 우회하지 않습니다.
- MQTT common admission projection은 read-only/side-effect outcome을 보존하고

  unknown, params, binding, missing/rejected authorization을 bounded public code/message로
  변환합니다. Packaged headless entry의 common runtime activation은 production
  verifier bootstrap이 성공한 뒤에만 수행됩니다.
- MQTT runtime start는 crate-private
  `start_runtime_with_dispatcher_and_transport` 하나만 존재하며 caller-owned bounded Tokio
  dispatcher를 필수로 받습니다. Optional dispatcher, public legacy start API,
  MQTT-local admission/active-command registry, request별 OS worker와 key-only
  `processed_requests` cache는 supported use 0 확인 뒤 삭제했습니다. Managed response
  delivery는 같은 dispatcher permit 안에서 publish까지 완료하며 overflow는 backend
  실행 없이 request ID를 보존한 `runtime_backpressure`로 응답합니다. Redelivery는
  dispatcher 뒤 supervisor의 authorization/exact binding completed store만 판정합니다.
- Managed MQTT ingress는 `request_schema.rs`의 protocol version 1 strict parser만

  사용합니다. Unknown version/field, malformed envelope와 byte bound 위반은
  dispatcher 전에 bounded public 오류로 끝납니다. Legacy default entry의 additive
  parser는 mixed-version rollout 전까지 별도로 유지합니다.
- Managed `MqttRuntimeHandle::stop_async`는 async client에 disconnect를 enqueue하고 같은

  composition handle이 소유한 event-loop task를 await한 다음 dispatcher admission을
  닫아 이미 접수된 response delivery를 drain합니다. Connection polling은
  `EventLoop::poll`과 bounded timeout을 사용하고 reconnect backoff도 Tokio timer로
  취소를 확인하므로 MQTT source에는 OS thread와 blocking poll helper가 없습니다.
  MQTT `RuntimeEvent`는 256-slot `sync_channel`에 `try_send`하며 GUI/운영 consumer가
  늦어도 connection task를 block하거나 unbounded backlog를 만들지 않습니다. Native
  tray callback도 같은 원칙의 32-slot non-blocking action channel을 사용합니다.
- MQTT CONNECT client ID는 node ID/alias와 분리됩니다. Pure
  `build_mqtt_client_id`가 immutable instance ID와 runtime session ID의 versioned
  SHA-256 digest를 bounded ASCII ID로 만들며, 같은 runtime reconnect는 동일 ID를,
  다른 session/instance는 다른 ID를 사용합니다. Controlled broker가 실제 CONNECT
  client ID와 reconnect 안정성을 검증합니다.
- MQTT connection failure는 오류 문구의 locale/substring을 비교하지 않습니다.

  rumqttc의 typed `BadUserNamePassword`와 `NotAuthorized` CONNACK refusal만 bounded
  authentication failure로 투영하고, 다른 refusal과 I/O 실패는 raw transport detail을
  숨긴 closed connection failure로 투영합니다. Bootstrap enqueue 실패는 인증 실패로
  분류하지 않습니다.
- `mqtt_connection_lifecycle.rs`는 starting, connected, retry backoff,

  authentication-failed와 stopped를 하나의 closed state로 관리합니다. Connection
  accepted, retryable failure, authentication rejection, backoff elapsed와 stop request의
  allowed/rejected transition이 I/O 없이 검증됩니다. MQTT loop는 별도 connected/retry
  boolean 대신 이 transition이 반환한 reconnect/stop action만 실행하며, backoff 중
  stop 요청은 reconnect 없이 stopped로 끝납니다.
- `node.rs`는 transport와 feature 코드를 잇는 중심 계약 지점입니다.
- `browser.focus`는 signed execution admission과 replay nonce를 검증한 뒤 요청
  handler에 주입된 `AutomationBackend::focus_browser` port만 호출합니다. OS별
  focus 실행과 focused-target post-check는 같은 backend instance가 소유하며 node가
  platform module이나 현재 backend를 다시 선택하지 않습니다.
- `gui.rs`는 MQTT 연결 상태를 보고, 끊김 뒤 `다시 연결` 동작을 바로 제공해야 합니다.
- Windows 실행 파일은 콘솔 창이 뜨지 않도록 GUI 서브시스템으로 빌드합니다.
- MQTT 상태와 capability는 시작 시 1회, 그리고 각 요청 처리 전후에 다시 발행해 현재 도구 상태를 갱신합니다.
- MQTT Product Log event는 canonical descriptor method 또는 bounded
  `invalid_request`/`unknown_method` 분류만 사용합니다. Raw request method와 runtime
  configuration/transport error 문자열은 event와 stderr로 전달하지 않습니다.
- 마우스와 키보드는 세부 메서드와 함께 `mouse.action`, `keyboard.action`을 공통 진입점으로 받습니다.
- macOS backend는 `screen.capture`, `mouse.move`, `mouse.click`, `mouse.action`, `keyboard.type`, `keyboard.action`, `system.control`을 platform helper로 처리합니다.
- macOS `camera.capture`는 앱 번들 내부의 고정 helper executable을 사용하고, helper 소스는 `Yeonjang/helpers/macos/` 아래에 둡니다.
- 일반 macOS start/restart는 서명 검증을 통과한 기존 앱 번들을 재사용합니다. 앱 번들이 없거나 `--build`를 명시한 경우에만 build하고 helper와 app의 서명 검증 실패를 숨기지 않습니다.
- macOS `camera.permission_status`는 bundled AVFoundation helper의 read-only 진입점으로 실제 `authorized`, `not_determined`, `denied`, `restricted` 상태를 조회하며 권한 요청이나 촬영을 실행하지 않습니다.
- `camera.capture`는 Core가 전달한 validated operation budget을 helper completion deadline까지 유지합니다. macOS process watchdog은 같은 budget에 cleanup grace만 파생하고 초과를 `camera_helper_timeout`으로 투영합니다.
- MQTT request metadata는 선택적 version 1 command-attempt binding

  (`commandId`, `operationId`, `targetFingerprint`)을 받습니다. 새 응답은 이 binding과
  bounded terminal stage/reason/retry safety를 선택적 `attempt`로 되돌리고, 구버전
  요청·응답은 해당 필드 없이도 계속 처리합니다.
- MQTT adapter는 결속된 요청을 파싱하면 `received`, 실제 handler를 시작하면

  `handler_started` stage receipt를 같은 response 경계에 발행합니다. Core는 이
  receipt가 없는 응답 미수신과 handler 시작 뒤의 미수신을 각각 transport와 handler
  timeout으로 구분하며, receipt 자체를 effect 성공으로 간주하지 않습니다.
- node는 helper timeout을 handler/transport timeout으로 바꾸지 않습니다. typed

  camera permission failure는 rejected stage로, 정상 handler 결과는 response-ready
  stage로 응답하며 raw helper 출력·경로·MQTT payload는 attempt에 넣지 않습니다.
- MQTT runtime은 `cancellation.rs`의 active command와 cancel token을 process-local

  canonical 실행 registry에

  exact-match로 결속합니다. `command.cancel`은 같은 runtime session과 token이
  일치할 때만 cancellation flag를 전환하며, macOS helper runner는 이 flag를
  관찰하면 helper process group을 종료하고 `camera_capture_cancelled`를 반환합니다.
  registry는 승인이나 durable 재개 원본이 아니며 실행 종료 시 entry를 제거합니다.
  MQTT adapter는 별도 lock, token 비교나 cancellation state 사본을 소유하지 않습니다.
- MQTT side-effect request는 canonical capability classification을 사용하며 command,

  operation, target session/fingerprint, idempotency, expiry와 cancel binding이 모두
  공통 `SideEffectBinding`으로 유효해야 handler에 진입합니다. standalone supervisor도
  같은 계약을 사용하며 read-only request만 이 실행 binding 없이 compatibility
  경로를 사용할 수 있습니다.
- MQTT request metadata는 canonical side-effect의 opaque `commandId`, `operationId`,

  target fingerprint를 선택적으로 전달합니다. 결속된 요청의 Rust 응답은 version 1
  `attempt`에 `response_ready`, `helper_timeout`, `handler_failed`, `rejected` 중 실제
  terminal stage와 retry safety를 기록합니다. 구버전 요청·응답은 `attempt`를
  생략하며, 승인·OS 권한·MQTT acknowledgement를 서로 대신하지 않습니다.
- Windows `camera.capture`도 이제 `Yeonjang --camera-capture-helper` 고정 진입점을 사용하고, `device_id`가 있으면 WinRT `MediaCapture` 경로로 분기합니다.
- `camera.capture`와 `screen.capture`는 caller가 지정한 `output_path`를 executor 전에
  거부합니다. MQTT, authenticated stdio와 managed Tokio composition은 시작할 때
  `capture_artifact_root`와 instance ID로 filesystem `CaptureArtifactSink`를 한 번
  만들고 같은 immutable port를 모든 요청에 주입합니다. Application은 exact operation
  lease가 발급한 내부 경로만 platform backend에 전달합니다.
- Sink는 relative/symlink root, root escape, duplicate operation과 비어 있거나 64 MiB를
  넘는 결과를 fail-closed합니다. 실패·취소·inline handoff는 lease drop으로 파일과
  operation directory를 정리합니다. non-inline 성공 response는 raw path와 bytes 대신
  provider-local opaque reference와 bounded metadata만 반환하며 explicit delivery
  cleanup 전까지 resolve할 수 있습니다. Knowbee camera consumer는 현재 inline bytes를
  자체 configured artifact storage로 옮긴 뒤 channel-scoped `artifact:<UUID>`를 별도로
  등록합니다.
- node의 public error projection은 계약화된 camera/capture policy 오류의 bounded

  code와 message만 보존합니다. 그 밖의 adapter 오류는 `request_failed`와 고정된
  public message로 닫으며 raw error chain, local path, command, token을 응답에
  포함하지 않습니다.
- `platform_execution`의 새 failure 값은 pre-effect stage가 effect 적용이나 unknown을
  주장하지 못하게 하고, unknown effect는 반드시 manual verification retry/recovery와
  결속합니다. correlation ID와 optional evidence reference는 non-blank bounded 값만
  허용합니다. 이 Domain contract는 아직 v1 `attempt` projection을 대체하지 않으며,
  후속 공통 execution use case와 MQTT v2 terminal receipt가 소비할 기반입니다.
- `BoundPlatformOperation`은 OS adapter가 method 문자열이나 사용자 문구에서 실행
  identity를 재구성하지 않도록 capture 명령과 모든 execution-critical identity를 한
  값으로 고정합니다. `PlatformPreflightReceipt`는 이 operation/target/resource/digest와
  관측 시각에 결속되며 Application이 제공한 현재 시각과 최대 age로 effect 직전 다시
  검증합니다. 이 계약도 아직 기존 `node.rs` dispatch를 전환하지 않은 Phase 1 기반입니다.
- `PlatformCapabilityPort`는 framework나 transport callback을 노출하지 않고 하나의
  preflight receipt와 하나의 effect receipt만 교환합니다. contract-only adapter는
  preflight에서 `not_started`, 방어적 direct execute에서 `confirmed_not_applied`를
  반환하며 fake native receipt, artifact 또는 success를 만들지 않습니다. Desktop
  adapter와 공통 execution use case 연결은 후속 단계입니다.
- `ExecuteCapabilityUseCase`는 wrong/stale/future preflight와 unavailable/permission
  상태를 platform execute 전에 closed failure로 끝냅니다. 성공처럼 반환된 native
  receipt가 exact operation과 다르면 effect 여부를 추정하지 않고
  `post_check + unknown + manual_verification_required`로 보존합니다. 현재 이 use case는
  새 contract test 경로에서 동작하며 기존 `node.rs` production dispatch 전환은 아직
  수행하지 않았습니다.
- 같은 use case는 operation에 결속된 cancellation ID를 injected read-only query port로,
  deadline을 injected clock으로 preflight 전과 platform execute 직전에 확인합니다.
  어느 guard든 닫히면 `resource_admission` 단계와 `not_started` effect state를 반환하고
  preflight 전 취소/만료 또는 중간 취소에서 platform effect를 시작하지 않습니다.
- legacy failure mapper는 public `CameraCaptureFailure` variant와
  `CaptureArtifactError` variant를 직접 exhaustively match하며 reason 문자열을 의미
  판정에 사용하지 않습니다. Permission은 preflight/not-started, helper timeout/cancel과
  artifact failure는 caller가 확정한 effect state를 보존하고, unknown effect만
  manual verification을 요구합니다. 분류하지 못한 `anyhow` 내용은 폐기하고
  `internal_unclassified` contract만 반환합니다.
- macOS screen helper는 capture path에서 OS permission request를 수행하지 않고
  read-only preflight 실패를 stable exit code로 반환합니다. local screen policy가 허용된
  첫 GUI 시작만 durable marker를 먼저 저장하고 `CGRequestScreenCaptureAccess`를 호출해
  앱 번들을 macOS TCC에 등록하며, Platform adapter와 legacy
  mapper는 이를 typed permission/helper failure로 보존하므로 stderr 문구, private path,
  token을 의미 판정이나 public response에 사용하지 않습니다.
- `TerminalReceipt`는 target platform까지 포함한 bound operation identity를 그대로
  보존합니다. 실행이 성공한 뒤 response publish가 실패하면
  `execution_outcome=succeeded`, `delivery_outcome=pending_retry|failed`,
  `effect_state=confirmed_applied`를 함께 유지합니다. blocked/effect-unknown 결과의
  모순된 effect claim과 다른 operation correlation은 생성 시 거절합니다. 아직 MQTT v2
  envelope나 durable writer에는 연결되지 않은 Domain 계약입니다.
- MQTT v2 topic set은 `yeonjang/v2/instances/...` 아래 exact instance/session/requester
  identity로만 command/control/admin/artifact acknowledgement를 route합니다. Identifier의
  wildcard, separator, traversal, uppercase와 oversize를 거절하고 status/capabilities만
  retained로 정의합니다. 아직 기존 MQTT connection의 subscribe/publish에는 연결되지
  않았습니다.
- MQTT v2 command parser는 64 KiB bound와 version probe를 먼저 적용하므로 v1은
  payload/authorization parsing 전에 `protocol_upgrade_required`로 끝납니다. v2는
  unknown top-level/params/authorization field, stale/future time, topic identity와
  authorization method/resource/requester/target/operation/idempotency mismatch를
  거절하고 typed camera/screen payload만 반환합니다. Authorization signing bytes는
  JSON key 순서와 무관한 versioned length-prefix 형식으로 protocol/schema/kind,
  typed payload digest, envelope identity와 authorization identity/scope/expiry/nonce
  전체를 결속하고 signature 값만 제외합니다. Cryptographic verification은
  issuer/key ID를 받는 injected port를 통해 closed rejection을 반환합니다. Production
  key lease/store와 nonce replay registry 연결은 아직 후속 작업입니다.
- v2 command admission은 signature 검증이 성공한 동일 snapshot만 현재 시각으로 다시
  expiry 확인한 뒤 replay owner에 전달합니다. Replay identity는
  issuer/authorization ID/nonce의 versioned SHA-256 digest이며 raw nonce를 저장하지
  않습니다. 기존 bounded `AuthorizationReplayGuard`를 주입해 writer를 복제하지 않고,
  duplicate와 storage saturation/unavailable을 closed result로 구분합니다. 현재 기본
  adapter는 process-local이므로 restart-safe terminal recovery는 아직 후속 작업입니다.
- v2 admission 성공은 opaque `AdmittedV2Command`로 반환되고 공통 operation mapper만
  이를 소비합니다. Mapper는 parser의 camera/screen typed variant를 직접 match하고
  request/command/operation/requester/target/authorization/idempotency/expiry를 wire
  snapshot에서 복사합니다. Target platform, policy revision, cancellation ID와 artifact
  lease는 composition이 명시적으로 주입하며 blank/invalid 값은 기본값 없이 Domain
  constructor에서 닫힙니다. iOS/Android target도 변환 단계에서는 보존하고 contract-only
  adapter가 실행을 차단합니다. Production MQTT dispatch 연결은 아직 후속 작업입니다.
- 공통 request lifecycle은 `Received→Validated→Authorized→Admitted→Queued→Running`
  순서를 하나의 reducer에서 소유합니다. Authorized stage에서도 effect 전
  blocked/failed/cancellation terminal을 허용하되 Validate에서 Admit으로 건너뛰거나
  terminal 뒤 실행 event를 적용하는 것은 거절합니다. 기존 standalone runtime도 같은
  reducer 순서를 사용하며 별도 v2 승인 boolean을 만들지 않습니다. 이 owner는 현재
  process-local이고 durable v2 event writer 연결은 후속 작업입니다.
- v2 rejection mapper는 malformed/oversize/unknown field, protocol upgrade/unsupported,
  future/expired, topic/target mismatch, authorization mismatch/signature/replay/store
  unavailable을 문자열 없이 enum match합니다. 모든 결과는 `effect_state=not_started`이며
  replay와 verifier unavailable을 별도 reason/retry/recovery로 보존합니다. Serialized
  failure에는 caller가 발급한 bounded correlation과 closed code만 있고 command,
  signature, nonce와 raw error는 없습니다. MQTT response envelope 연결은 후속입니다.
- v2 operation mapper는 공통 operation과 accepted correlation/causation을
  `BoundV2Operation` 하나로 반환합니다. Terminal response content는 이 값의 exact
  binding digest와 TerminalReceipt가 같을 때만 request/command/operation/requester/
  target/idempotency를 투영하며 execution outcome과 delivery outcome을 독립된 상태로
  그대로 보존합니다. Raw authorization/signature/nonce는 포함하지 않습니다. Response
  signature, envelope timing과 MQTT publish는 아직 후속 작업입니다.
- v2 terminal response envelope는 protocol/schema/kind/message identity, accepted
  request/target identity, issued/expiry, terminal revision sequence, versioned response-content
  digest와 response authorization issuer/key/audience/scope/target/expiry/nonce를
  deterministic length-prefix bytes에 결속합니다. Injected signer에는 issuer, key ID와
  bytes만 전달하며 envelope은 key material을 소유하지 않고 Debug에서 signature를
  redaction합니다. Fixed digest/reference HMAC fixture가 canonical bytes를 고정하고
  invalid timing, signer unavailable과 malformed signature를 closed error로 반환합니다.
  Production key lease, consumer verifier와 MQTT publisher는 아직 후속 작업입니다.
- direct MQTT v2 handler는 exact command topic/bytes를 parser에 먼저 전달하고 signature/
  replay admission 성공 뒤에만 explicit runtime context로 common operation을 만듭니다.
  그 다음 기존 `ExecuteCapabilityUseCase`를 한 번 호출하고 success 또는 typed platform
  failure를 revision 1, delivery `not_started` TerminalReceipt content로 반환합니다.
  Malformed/signature/context rejection은 platform call 0이며, iOS/Android contract-only
  adapter는 fabricated success 없이 blocked/not-started terminal을 반환합니다. 이 slice는
  Gateway, Telegram, LLM과 무관합니다. Durable idempotency/replay terminal, lifecycle
  persistence, response signing/publish와 Tokio dispatch는 아직 후속 작업입니다.
- direct handler의 v2 terminal repository는 idempotency key 하나에 exact
  request/command/operation/requester/target/method/payload/authorization scope digest
  하나만 결속합니다. 한 lock 안에서 claimed/in-progress/completed/scope-conflict/
  saturation을 결정하고 fresh claim만 platform effect에 진입합니다. 동일 signed QoS
  redelivery는 completed content를 반환해 effect count 1을 유지하고, 같은 key의 다른
  scope는 call 0으로 닫힙니다. Pending이나 repository failure를 자동 abandon해 effect를
  재실행하지 않으며 raw command/signature를 저장하지 않습니다. In-progress, scope-conflict와
  repository-unavailable rejection은 내부 scope digest가 아니라 수신 command bytes의 SHA-256
  correlation을 사용해 requester가 exact duplicate 응답도 식별할 수 있습니다. 현재 adapter는
  process-local이므로 restart durability와 retention은 후속 작업입니다.
- `DurableV2TerminalRepository`는 기존 revision-CAS `DurableRecordStorage` port를
  재사용하며 concrete file/path를 발견하지 않습니다. Version 1 strict record는
  idempotency key, exact scope digest와 pending 또는 validated terminal content만
  저장합니다. Claim은 raw storage commit 성공 뒤에만 accepted되고 pending restart는
  in-progress로 복원되어 effect를 자동 재실행하지 않습니다. Completed restart는 같은
  immutable content를 replay합니다. Bootstrap은 read-only이며 corrupt, duplicate,
  capacity와 CAS failure를 닫습니다. `AtomicLocalStorage`의 checksum/atomic replace/
  backup/rollback을 그대로 사용할 수 있지만 production composition activation과
  retention/migration release gate는 아직 후속 작업입니다.
- v2 response adapter는 exact command topic의 retained delivery를 parser/platform call
  전에 `retained_message_rejected + not_started`로 닫습니다. Terminal content만
  injected response signer를 거쳐 최대 512 KiB strict JSON으로 만들고 exact requester
  response topic, QoS 1, retain false를 반환합니다. Signing/serialization/oversize
  failure는 publish DTO를 만들지 않습니다. 이 DTO는 아직 network publish가 아니며
  transport PUBACK을 terminal success나 consumer acknowledgement로 해석하지 않습니다.
- production v2 command pump는 exact command와 control topic을 각각 QoS 1로
  subscribe하고 caller가 만든 AsyncClient/EventLoop와 watch shutdown을 소유합니다.
  Max in-flight는 normal command용 2~64 typed config이고, 같은 bounded JoinSet에
  control-plane용 여유 lane 하나를 별도로 둡니다. Normal command capacity가 찼을 때는
  최대 64개의 command DTO만 bounded queue에 보관하면서 exact cancel/control을 계속
  수신하므로 취소가 대상 effect 뒤에서 기아 상태가 되지 않습니다. Shutdown은 canonical
  registry에 먼저 latch되고 실행 중 job과 queued command 모두 `runtime_shutdown`
  terminal로 수렴한 뒤 response enqueue와 disconnect outgoing event를 drain합니다.
  Purpose-specific adapter processing은 `spawn_blocking`으로 EventLoop에서 분리되며
  ownerless/unbounded task를 만들지 않습니다. Pump는 별도 runtime이나 sleep-polling
  owner를 만들지 않습니다.
- concurrency fixture는 same camera 두 명령의 measured max active 1과 camera/screen
  조합의 max active 2를 각각 확인합니다. Resource waiter exact cancel fixture는 첫
  camera effect가 permit을 소유한 동안 두 번째 명령의 cancel ACK가 `accepted`, target
  terminal이 `cancelled + not_started`, effect 미진입임을 검증하고 이후 같은 camera
  명령 성공으로 permit 반환을 확인합니다. 별도 shutdown fixture는 normal slot 두 개와
  bounded queue 한 개를 채운 뒤 세 요청이 모두 `runtime_shutdown` terminal로 수렴하고
  registry active count와 backend effect가 0임을 확인합니다.
- v2 `command.cancel` parser는 control 요청 자체의 request/command/operation/
  idempotency와 취소 대상의 request/command/operation/idempotency/cancellation/token을
  분리해 하나의 signed snapshot에 결속합니다. Exact requester/instance/session/
  fingerprint와 authorization scope가 다르거나 v1, unknown field, wrong topic이면
  registry 호출 전에 거부합니다. Envelope Debug는 token과 signature를 노출하지
  않습니다. Control admission은 injected verifier가 이 snapshot을 검증한 뒤 현재
  expiry를 다시 확인하고 issuer/authorization ID/nonce의 SHA-256 replay identity를
  한 번 소비합니다. 실패한 signature와 expired control은 replay capacity를 소비하지
  않으며 success만 opaque token이 됩니다. 현재 replay adapter는 process-local이고
  active-command transition과 non-terminal cancel acknowledgement는 후속 control
  use case에서 연결합니다.
- v2 cancel use case는 별도 flag/map을 만들지 않고 기존 exact active-command registry
  writer를 사용합니다. Composition이 주입한 instance/session/fingerprint owner scope와
  admitted control이 다르면 registry call 0으로 닫고, exact target/session/fingerprint/
  idempotency와 token이 일치할 때만 cancellation signal을 전이합니다. Ack는
  accepted/duplicate/already-terminal/binding-mismatch/target-mismatch/not-active/
  unavailable을 구분하며 항상 `target_terminal=false`여서 대상 command의 별도 terminal
  receipt를 가장하지 않습니다. 현재 v2 command handler가 이 registry에 active command를
  등록하는 연결과 durable ack는 후속입니다.
- v2 executable command는 cancellation ID와 opaque cancel token을 command envelope와
  `effect.execute` authorization 양쪽에 필수로 포함합니다. 두 값은 canonical signature와
  idempotency scope digest에 들어가며 mapper는 더 이상 runtime context에서
  cancellation ID를 재구성하지 않고 signed snapshot의 ID를 BoundPlatformOperation에
  복사합니다. Token은 operation, terminal과 Debug에 투영하지 않습니다. 이 변경은
  production v2 활성화 전 계약 수렴이므로 이전 불완전 v2 fixture를 실행 호환하지 않고
  strict schema rejection하며, publisher/consumer fixture와 binary를 같은 release
  gate에서 전환하고 이전 signed binary로 rollback합니다.
- direct v2 handler는 durable terminal scope를 claim한 뒤 signed cancellation ID/token과
  exact target binding을 기존 `ActiveCommandRegistry`의 같은 active entry에 등록합니다.
  Entry는 partial state로 노출되지 않도록 canonical reducer 순서를 거쳐 Running으로
  만든 뒤 publish되고, `ExecuteCapabilityUseCase`의 cancellation query도 이 registry
  signal만 읽습니다. Preflight 중 exact cancel은 두 번째 pre-effect guard에서
  `cancelled + not_started` terminal이 되어 platform effect 0이며, terminal transition
  뒤 exact tombstone을 기록하고 active entry/cancellation ID를 제거합니다. 같은
  command 또는 cancellation ID의 concurrent registration은 `resource_busy` terminal로
  닫힙니다. Helper가 이미 시작된 뒤 native cancellation propagation은 별도 후속입니다.
- cancel acknowledgement response는 control request의 request/command/operation/
  correlation/causation/requester/target/idempotency와 target command identity,
  cancellation ID, closed outcome, `target_terminal=false`를 하나의 payload로 보존합니다.
  Response authorization은 exact requester audience와 target을 다시 결속하고 canonical
  signing bytes의 fixed digest fixture로 고정됩니다. Signature와 cancel token은 payload와
  Debug에 노출되지 않습니다. 이 ack는 cancellation request 접수 결과일 뿐 MQTT PUBACK,
  OS effect 결과 또는 대상 command terminal이 아닙니다. MQTT publish와 durable replay는
  후속입니다.
- durable v2 cancel use case는 기존 `DurableCancellationReceiptStore`의 exact digest
  key와 Prepared/terminal CAS 순서를 재사용합니다. Active target을 probe한 뒤
  Prepared commit이 성공해야만 registry signal을 바꾸며, begin/finalize 실패와 wrong
  scope는 signal 0의 typed ack로 닫힙니다. QoS redelivery는 control signature와 현재
  expiry를 다시 검증한 `VerifiedReplayV2Control` token으로만 durable receipt를 읽고,
  저장된 accepted/duplicate/already-terminal outcome을 재투영합니다. Missing receipt는
  signal을 재생성하지 않고 unavailable로 닫습니다. MQTT에서 선행 command와 후행
  cancel이 순서대로 들어와도 blocking worker 시작 순서가 뒤집힐 수 있으므로,
  `NotActive` 첫 관측은 canonical registry의 register/terminal 조건 신호를 최대 500ms
  기다린 뒤 다시 판정합니다. 이 coordination grace는 별도 pending map을 만들거나
  effect 결과를 추정하지 않으며, 여전히 미관측이면 기존 `not_active`를 반환합니다.
  Process restart 뒤 target command terminal index를 v2 terminal repository와
  수렴시키는 작업은 아직 후속입니다.
- direct MQTT control adapter는 retained/wrong-topic/malformed/invalid-signature control을
  cancellation use case 전에 닫습니다. Fresh admission만 persist-before-signal path를
  호출하고 verified replay는 durable read-only path만 호출합니다. 두 경우 모두 exact
  requester response topic의 QoS 1/non-retain bounded signed ack DTO를 만들며, DTO 생성이나
  broker PUBACK 자체는 cancellation 또는 target terminal 증거가 아닙니다.
- command/control pump composition은 두 adapter가 동일 `ActiveCommandRegistry`를
  공유하도록 요구합니다. Controlled direct broker는 두 exact subscription 뒤 command를
  보내고 preflight 진입을 관측한 다음 signed control을 보내며, cancel ack
  `target_terminal=false`와 대상 command의 별도 `cancelled + effect not_started`
  terminal을 각각 받습니다. Platform effect count는 0이고 shutdown은 두 job 및 response
  enqueue를 drain합니다. 이 검증은 Gateway나 channel 승인을 사용하지 않으며 transport
  PUBACK을 cancellation evidence로 해석하지 않습니다.
- signed `receipt.get`은 cancellation과 같은 user-facing control topic을 쓰지만
  `receipt.read` scope, target request/command/operation/idempotency, opaque exact-scope
  digest와 expected terminal revision을 가진 별도 strict contract입니다. Signature와
  replay admission 뒤 `V2ReceiptQueryUseCase`는 existing terminal repository의
  `lookup`만 호출합니다. Exact completed content만 반환하고 miss/in-progress/
  revision-mismatch/binding-mismatch/unavailable은 closed outcome이며 claim, complete,
  lifecycle/cancellation write나 platform effect를 호출하지 않습니다. Wrong owner
  scope에서는 repository 존재 여부를 조회하지 않습니다.
- MQTT control router는 bounded JSON의 protocol/schema/message-kind와 closed
  `command.cancel|receipt.get` discriminator만 보고 purpose-specific adapter를
  선택합니다. Unknown prose나 control kind는 어느 use case에도 전달하지 않습니다.
  Receipt adapter는 query identity, closed outcome과 optional immutable terminal을
  `yeonjang.receipt-response.v2`로 서명해 exact requester response topic에 QoS 1,
  non-retained로 publish합니다. Controlled broker는 두 subscription 이후 query를
  보내며 command effect 0, repository lookup 1과 found terminal revision 1을
  확인합니다. Receipt response는 새 target execution이나 consumer acknowledgement가
  아니며 `response.ack` writer는 후속입니다.
- signed `response.ack`은 receipt ID, target request/command/operation/idempotency,
  terminal revision, canonical response digest와 exact requester/instance/session/
  fingerprint를 `response.ack` scope에 결속합니다. Durable delivery repository는 raw
  response나 signature를 저장하지 않고 queued/published/consumer-acknowledged와 별도
  delivery revision만 소유합니다. Published exact ack를 CAS로 persist한 뒤에만 accepted를
  반환하고 restart 뒤 exact redelivery는 duplicate입니다. Wrong owner/digest/binding,
  stale revision, not-ready와 storage failure는 state를 바꾸지 않는 closed outcome입니다.
  Execution terminal content/effect state는 이 repository에 없으므로 delivery ack가
  execution 결과를 다시 쓰지 못합니다.
- response ack MQTT adapter는 retained/malformed/invalid-signature/expired 입력을 delivery
  writer 전에 닫고, accepted/duplicate/not-ready/not-found/binding/revision/unavailable과
  optional delivery revision을 `yeonjang.response-ack-result.v2`로 서명합니다. Control
  router의 third closed discriminator만 이 adapter에 도달합니다. Controlled broker
  QoS redelivery에서 first accepted와 second duplicate가 모두 delivery revision 2를
  반환하고 platform effect는 0입니다. Pump의 MQTT PUBACK branch는 ack use case를
  호출하지 않습니다. Terminal response publish 시 queued/published receipt를 자동
  등록하는 연결은 후속입니다.
- signed terminal response는 canonical terminal payload SHA-256에서 도출한
  64-byte bounded opaque receipt ID와 full SHA-256 response digest를 response
  authorization signing bytes에 포함하고 wire에 노출합니다. Message ID, issued time과
  nonce는 publication마다 달라질 수 있지만 같은 immutable terminal의 receipt ID와
  response digest는 process restart 뒤에도 바뀌지 않습니다. Upgrade 전
  `receipt-{response_message_id}` row가 같은 terminal binding에 하나 존재하면 durable
  delivery repository가 그 ID와 published/acknowledged revision을 계속 canonical로
  선택합니다. 같은 binding의 legacy ID가 둘 이상이면 새 ID를 추가하거나 임의 선택하지
  않고 response signing/publication을 fail closed합니다. 두 형식 모두 기존 schema 1의
  bounded opaque identifier이므로 reader와 ACK wire schema는 바뀌지 않습니다.
  Terminal publish DTO만 queued `V2DeliveryReceipt`를 opaque metadata로 운반하며 cancel/
  receipt-query/ack-result DTO는 이를 갖지 않습니다. Pump는 queued CAS가 성공해야
  AsyncClient에 enqueue하고, 모든 publish enqueue를 `Some(receipt)|None` FIFO로 보존해
  rumqttc `Outgoing::Publish(packet_id)`와 순서대로 결속합니다. Matching broker PUBACK
  뒤에만 durable state를 published/revision 2로 바꿉니다. Unknown PUBACK은 무시하고
  packet reuse, missing state와 commit failure는 typed pump failure입니다. Shutdown도
  accepted terminal의 outgoing/PUBACK tracking을 bounded drain한 다음 disconnect합니다.
  Controlled broker에서 queued storage failure는 platform effect 뒤 network response 0,
  정상 path는 published revision 2를 확인합니다. Consumer `response.ack`은 이 다음의
  별도 transition입니다.
- legacy capture adapter는 backend capability를 생성자에서 한 번 snapshot하고 camera
  permission만 preflight 때 typed state로 관측합니다. 실행 시 bound operation의
  command/operation/target/idempotency로 기존 artifact lease를 만들고 exact
  cancellation ID의 signal만 전달합니다. 성공은 opaque artifact reference를 native
  receipt ref로 반환하고 typed timeout과 missing/invalid artifact는 common failure
  mapper로 보냅니다. Screen permission은 생성자에 필수인 non-prompting typed probe가
  반환하며 denied/restricted/not-determined는 common use case에서 backend effect 전에
  닫힙니다. Native macOS/Windows/Linux probe composition과 production
  `node.rs`/MQTT dispatch 연결은 아직 후속 작업입니다.
- Linux backend는 camera/screen host fact를 composition 때 한 번 관측하고, 나머지
  외부 도구 기반 기능은 `xdotool`, `systemctl`/`loginctl` 계열 설치 여부에 따라
  capability를 보고합니다.
- direct MQTT v2 연결 factory는 raw environment나 legacy settings를 실행 중 다시 읽지
  않고 immutable `MqttV2ConnectionConfig` 하나에서 exact broker host/port,
  instance/session identity, keepalive와 request-channel capacity를 검증합니다.
  Plaintext는 loopback에만 허용하고 remote broker는 기존의 redacted
  `MqttTransportSecurity`가 소유한 CA/client certificate/private key를 모두 갖춘
  mutual TLS만 허용합니다. Stable hashed client ID와 `clean_session(false)`로
  reconnect identity를 고정하지만 factory 자체는 Tokio runtime, task 또는 reconnect
  loop를 시작하지 않습니다. 반환된 `AsyncClient`와 `EventLoop`의 실행·취소·종료
  ownership은 composition root/supervisor가 명시적으로 가집니다.
- `mqtt_v2_runtime_composition.rs`는 direct MQTT v2의 production 조립과 pump task
  ownership을 한 곳에 둡니다. Bootstrap이 미리 복구·활성화한 artifact composition,
  durable terminal/delivery/cancellation repositories, immutable HMAC key snapshot,
  permission policy reader와 OS-neutral `PlatformCapabilityPort`만 주입받습니다. 여기서
  exact instance/session/requester/fingerprint/topics를 한 번 대조하고 command/control/
  receipt/response-ack/artifact adapter가 동일 topics와 active-command registry를
  공유하도록 조립합니다. 각 authorization lane의 replay guard는 독립적이며 같은
  capacity snapshot을 사용합니다. Runtime handle은 watch cancellation과 유일한 pump
  `JoinHandle`을 소유하고, `shutdown()`은 pending publish drain과 MQTT disconnect를
  마친 typed pump outcome만 반환합니다. Drop은 비동기 성공을 가장하지 않고
  cancellation만 요청합니다. Controlled direct broker는 이 production builder로
  signed camera command, durable terminal, 300KB JPEG의 두 binary chunk, exact signed
  acknowledgement, cleanup과 deterministic shutdown을 검증합니다. Legacy main/GUI
  activation, live broker credential과 policy-admin write lane은 아직 이 조립에
  연결되지 않았습니다.
  Pump max-in-flight와 같은 bound로 만든 typed resource admission을 common execute에
  주입해 동일 camera/display backend overlap을 막되 control/cancel lane과 독립
  camera/screen concurrency는 유지합니다.
- `mqtt_v2_production_bootstrap.rs`는 packaged headless/GUI가 공유하는 v2-only
  activation root입니다. Dedicated `mqtt_v2.session_id/requester_id` enrollment를
  broker username, node/display alias와 분리하고, non-secret instance/host/install
  identity의 domain-separated SHA-256을 target fingerprint로 사용합니다. Broker
  password는 CONNECT credential snapshot과 domain-separated v2 HMAC key로 한 번
  변환되며 임시 raw buffer, connection credential과 HMAC key buffer는 각 owner가
  사용 후 지웁니다. Bootstrap에서 이미 획득해 전달된 fixed OS-runtime lease guard를
  runtime owner로 이동한 뒤 terminal,
  delivery, cancellation의 서로 다른 atomic files와 artifact recovery를 준비한 뒤에만
  MQTT client/pump를 만듭니다. Lease는 pump task의 activation guard로 이동해 runtime
  handle을 실수로 drop해도 detached pump보다 먼저 반환되지 않습니다.
- `main.rs --managed`와 GUI connection flow는 더 이상 legacy
  `ManagedRuntime::start_mqtt`를 호출하지 않습니다. 둘 다 process-lifetime fixed guard를
  production bootstrap에 전달하며 같은
  common `LegacyCapturePlatformAdapter -> PlatformCapabilityPort` factory를 사용합니다.
  GUI는 dedicated lowercase v2 session/requester 입력을 저장하고, spawn 성공이 아니라
  pump가 관측한 실제 MQTT CONNACK projection에서만 Connected를 표시합니다. Pump의
  조기 종료는 headless `run_until` 또는 GUI tick에서 관측되어 typed shutdown/join
  결과로 회수됩니다. GUI lifecycle presence를 legacy v1 status topic에 publish하던
  compatibility call은 v2 cutover에서 제거됐으며 signed v2 status/capability
  publication은 별도 후속 계약입니다.
- `system_screen_permission.rs`는 normal MQTT execution에서 OS consent를 변경하지 않는
  Platform observer입니다. macOS는 CoreGraphics의 read-only
  `CGPreflightScreenCaptureAccess`로 granted/denied를 반환합니다. 별도
  `request_screen_capture_access`는 capture policy가 허용된 첫 GUI 시작에서만 durable
  marker 뒤 `CGRequestScreenCaptureAccess`를 호출하고, remote request·permission read·
  capture preflight에는 연결되지 않습니다. 현재 Windows와 non-portal Linux adapter에는 별도
  screen-recording consent API가 없어 `NotRequired` observation과 `Unsupported` local-request
  result를 구분합니다. capability, Wayland/X11 backend와 native capture failure는 별도
  preflight/effect 경계에서 계속 검증됩니다. 다른 target은 observation unavailable로
  닫힙니다. Headless와 GUI가 같은 probe를 production platform factory에 주입하며 camera와
  screen 모두 같은 common use case에서 typed artifact terminal을 생성합니다.
- capture permission projection은 canonical method descriptor에서 camera/screen의
  method, resource와 local setting identity를 가져오고 platform availability,
  persisted local policy와 supplied OS permission observation을 별도 closed state로
  유지합니다. 이 projection은 OS를 probe하거나 prompt하지 않고 policy를 쓰지
  않습니다. GUI에는 기존에 빠져 있던 camera local-policy toggle이 screen과 같은
  경로로 추가됐고, local policy enable을 OS 승인 실패로 단정하던 count 문구는
  non-prompting OS 상태 확인 필요로 바뀌었습니다. Canonical policy repository와
  revision writer는 후속 단계이며 현재 GUI 저장은 legacy settings compatibility
  writer를 그대로 사용합니다.
- local permission policy Domain은 exact target instance, schema version과 monotonic
  revision을 가진 immutable snapshot을 소유합니다. Camera와 screen decision은
  OS permission이나 operation authorization과 분리된 allowed/denied 값이며 any 또는
  capability-compatible exact camera/display resource constraint를 가집니다. Pure
  reducer는 applied, unchanged, revision-conflict와 rejected를 닫힌 결과로 반환하고
  wrong target, invalid resource와 revision overflow에서 원본을 바꾸지 않습니다.
  Rollback은 과거 snapshot의 값을 현재 revision+1로 복원해 과거 revision을 다시
  사용하지 않습니다. Persistence, nonce, authorization과 MQTT admin은 후속 boundary가
  소유합니다.
- durable policy repository는 current와 bounded historical snapshots를 persistence
  DTO로 변환하고 whole-history CAS가 성공한 뒤에만 in-memory current를 전환합니다.
  Logical policy revision과 physical storage revision은 서로 다른 monotonic 값이며,
  stale repository의 storage conflict는 기존 writer 결과를 덮지 않습니다. Restart는
  strict schema/version, target, revision 0부터의 contiguous history와 capability별
  resource compatibility를 모두 검증합니다. Rollback도 requested historical values를
  current+1 snapshot으로 같은 CAS에 commit합니다. Persisted record에는 secret, raw
  admin reason 또는 OS permission 상태가 없습니다.
- policy admin Application use case는 `admin.policy.write`와 `effect.execute`를 closed
  scope로 분리하고 exact target instance, requester, session, fingerprint, nonce,
  expiry와 update/rollback action binding을 가진 grant만 받습니다. Scope, target 또는
  action mismatch는 purpose-specific verifier와 repository writer 전에 닫히며,
  verifier가 expired/replayed/unavailable을 반환해도 writer effect는 0입니다.
  Update grant는 rollback을 승인하지 않고 그 반대도 같습니다. 이 use case는 OS
  permission을 관측·변경하거나 prompt하지 않습니다. Cryptographic adapter와 durable
  nonce/audit의 원자적 결속은 후속입니다.
- verified admin write는 authorization/requester/target/session/nonce의 SHA-256
  digests와 existing target fingerprint만 audit evidence로 만들며 raw grant identity,
  reason, secret 또는 OS permission을 저장하지 않습니다. Repository는 authorized
  applied/unchanged/revision-conflict/rejected attempt의 audit outcome, nonce digest와
  optional new policy snapshot/history를 하나의 whole-state CAS로 commit합니다. CAS가
  실패하면 memory와 durable policy/audit/nonce가 모두 그대로여서 동일 grant로
  storage recovery 뒤 재시도할 수 있습니다. 성공한 nonce는 restart 뒤 replay로
  거부되고 policy writer effect는 0입니다. Rollback audit와 restored current+1
  snapshot도 같은 원자성을 가집니다.
- MQTT v2 policy admin wire는 exact requester admin topic에서만 strict
  `policy.update|policy.rollback` payload를 받으며 common request/command/operation,
  target instance/session/fingerprint, idempotency와 expiry를 검증합니다. Canonical
  signing bytes는 payload digest와 literal `admin.policy.write` scope를 포함하므로
  같은 key로 만든 `effect.execute` grant나 서명 뒤 decision/resource/reason 변경은
  admission을 통과하지 못합니다. Signature가 검증된 envelope만 owned Domain
  command와 admin grant로 변환됩니다. Signed reason은 diagnostics 의미만 가지며
  policy snapshot/audit에 복사되지 않고 OS permission/prompt field는 strict schema에서
  허용하지 않습니다.
- policy admin MQTT adapter는 retained/parse/signature rejection을 writer 전에 닫고,
  admitted update/rollback을 Application use case에 한 번 전달합니다. Applied,
  unchanged, revision-conflict, rejected, replayed와 unavailable은 signed
  `yeonjang.policy-admin-result.v2` response의 closed outcome/reason으로 구분됩니다.
  Pump는 configured admin adapter가 있을 때 exact admin topic을 command/control과 함께
  subscribe하고 같은 bounded JoinSet과 shutdown owner에서 처리합니다. Admin response는
  QoS 1 non-retained이며 execution terminal이나 response delivery receipt를 생성하지
  않습니다.
- direct v2 command handler는 canonical `PermissionPolicyReader`를 필수 dependency로
  받고 signature admission 뒤 terminal claim과 platform preflight 전에 exact target,
  camera/screen decision과 optional exact camera/display resource를 검사합니다. Denied와
  resource mismatch는 `local_policy_denied`, unavailable/wrong-target snapshot은
  `local_policy_unavailable`로 effect 0에서 닫힙니다. Compatibility binding context의
  policy revision은 authority가 아니며, admitted immutable snapshot revision만
  `BoundPlatformOperation`에 결속됩니다. Durable policy repository가 동일 read port의
  canonical 구현입니다.
- canonical capture permission projection은 durable snapshot의 logical revision,
  camera/screen decision과 exact resource constraint를 읽고 platform availability 및
  supplied OS observation과 분리해 제공합니다. Projection 자체는 I/O, prompt 또는
  write를 하지 않습니다. Legacy `PermissionSettings` migration은 canonical store가
  없는 bootstrap compatibility 입력으로만 사용하며 review가 완료되지 않았거나 값이
  fresh/missing이면 revision 0 default deny를 유지합니다. Review된 camera/screen true만
  Domain reducer로 명시적으로 allow하며 shell 등 다른 legacy permission은 canonical
  capture policy에 복사하지 않습니다.
- local capture setup은 camera/screen desired decisions와 resource constraints를 하나의
  expected-revision command로 받아 두 entry가 달라도 logical revision을 한 번만
  증가시킵니다. Repository는 local change ID를 raw로 저장하지 않고 digest audit와
  optional new pair snapshot/history를 같은 CAS에 commit합니다. Restart의 같은 change
  ID는 duplicate이며, storage failure에서는 두 capability 모두 이전 상태를
  유지합니다. 이 use case는 OS permission을 관측하거나 성공으로 쓰지 않습니다.
- production capture policy bootstrap은 configured settings directory의 sibling
  `permission-policy.json`과 lock을 absolute atomic storage로 한 번 엽니다. Canonical
  store가 없을 때만 review가 완료된 legacy camera/screen 값을 compatibility input으로
  사용하며, store가 존재하면 이후 legacy bool은 authority가 아닙니다. GUI는 canonical
  snapshot의 camera/screen decision을 staging에 투영하고 그 snapshot revision 및 기존
  exact resource constraint로 pair transition을 요청합니다. Applied/unchanged 결과의
  target, revision과 두 decision을 repository에서 post-check한 뒤에만 legacy settings,
  launch-on-startup과 runtime restart를 진행합니다. Conflict, unavailable, duplicate와
  post-check mismatch는 typed reason으로 닫히고 후속 activation을 하지 않습니다.
  Capture decision이 바뀌지 않은 일반 settings save는 policy storage/audit를 쓰지
  않습니다. Canonical write 뒤 legacy settings 저장이 실패하면 이미 확정된 canonical
  state를 되돌리지 않으며 다음 bootstrap/reload projection이 legacy copy를 교정합니다.
- capture artifact post-check는 helper/process exit와 별개인 pure bounded contract로
  JPEG camera와 PNG screen의 exact kind, structural end marker, non-zero bounded
  dimensions, 최대 64 MiB size와 SHA-256 digest를 검증합니다. Filesystem lease는 이
  post-check 뒤에만 immutable metadata manifest를 sync하고 opaque reference를
  반환합니다. Restart delivery resolve는 regular-file/containment를 다시 확인하고
  bytes를 재검증해 manifest의 kind/format/dimensions/size/digest와 대조합니다. Wrong
  format, truncated/empty/oversized image와 post-commit tamper는 typed artifact
  failure이며 private path와 raw bytes는 public reference, manifest와 Debug projection에
  포함되지 않습니다.
- artifact lifecycle Domain은 opaque ref와 owner requester/request/operation,
  post-check full digest, size와 TTL을 immutable binding으로 소유합니다.
  `registered -> fetching -> awaiting_ack -> acknowledged`와 expired/cancelled/failed를
  closed state로 표현하고 exact transfer/chunk count/owner/digest를 event마다
  검증합니다. 동일 fetch/ack redelivery만 idempotent이며 wrong owner/transfer/digest,
  early expiry, expiry 뒤 전달과 모든 terminal 재변경을 거부합니다. Reducer는 MQTT,
  filesystem, Tokio와 clock에 의존하지 않고 outer Application owner가 transition을
  durable commit한 뒤 publish/cleanup effect를 수행해야 합니다.
- durable artifact repository는 strict versioned binding/state DTO만 저장하고 image
  bytes나 private path를 저장하지 않습니다. Register와 reducer transition은
  artifact ref별 logical expected revision을 먼저 확인한 뒤 전체 bounded record set을
  physical storage CAS로 commit합니다. CAS 성공 뒤에만 in-memory projection을
  교체하므로 stale writer, unavailable storage와 corrupt restart가 canonical state를
  덮지 않습니다. Exact same binding 등록만 idempotent이며 owner/digest가 다른 같은
  ref는 binding conflict입니다. MQTT publish와 file cleanup은 durable transition
  결과 이후에 수행해야 합니다.
- artifact transfer chunk는 최대 256 KiB payload와 transfer/artifact/owner
  requester/request/index/count/offset/chunk size/total size, per-payload SHA-256, full
  SHA-256와 expiry header를 가집니다. Builder는 `fetching` lifecycle의 exact transfer와
  expected count 및 source bytes의 size/full digest를 확인합니다. Raw payload는
  redacted `ArtifactChunk` 안에만 transient하게 존재합니다. Reference assembler는
  index로 out-of-order chunk를 재조립하고 exact identical duplicate만 idempotent하게
  처리하며 missing/overlap/tamper/wrong binding/expired input에서는 complete를
  생성하지 않습니다. Consumer completion evidence는 전체 bytes reassembly와 full
  digest 검증 결과이며 MQTT PUBACK가 아닙니다.
- artifact transfer Application use case는 path-free `VerifiedArtifactSource`와
  canonical lifecycle store만 주입받습니다. Fetch는 exact owner/request/operation,
  revision과 expiry를 검증해 `fetching`을 durable commit한 뒤에만 verified bytes를
  읽고 chunk를 만듭니다. Source/digest 실패는 artifact failed state로 commit하며
  execution effect 성공을 덮지 않습니다. Publisher가 모든 chunk enqueue 성공을
  보고한 뒤에만 `awaiting_ack`가 되고, exact requester/transfer/full digest consumer
  ack가 durable applied된 경우에만 cleanup-required를 반환합니다. Duplicate ack는
  already-acknowledged로 처리해 cleanup effect를 다시 요청하지 않습니다.
  Exact cancel command는 artifact/owner request/owner operation/active transfer와
  consumer가 관찰한 revision 하한을 모두 검증한 뒤 같은 lifecycle writer로
  `Cancelled`를 commit하며 exact transfer identity도 durable state에 보존합니다.
  같은 immutable transfer가 `fetching`에서
  `awaiting_ack`로 전진한 경우만 최신 canonical revision으로 CAS하며 future revision,
  다른 transfer/owner와 terminal state는 거부합니다. 동일 owner/transfer의
  redelivery만 `AlreadyCancelled`로 복원합니다. 이전 schema-1 Cancelled record에
  transfer identity가 없으면 읽기는 가능하지만 replay 성공으로 추측하지 않습니다.
  새 optional field를 모르는 이전 binary는 해당 record를 fail-closed하므로 rollback은
  cancelled artifact cleanup/state migration을 release gate로 요구합니다.
- MQTT v2 artifact control boundary는 strict `yeonjang.artifact-control.v2` envelope로
  fetch, ack와 cancel을 분리합니다. Fetch/cancel은 exact requester control topic,
  ack는 exact
  transfer ack topic에서만 수신하며 owner request/operation, opaque artifact ref,
  lifecycle revision guard, transfer, chunk size 또는 full digest가 authorization과
  필드별로 일치해야 합니다. Fetch/ack의 `expected_revision`은 exact CAS 값이고 cancel의
  `expected_revision`은 위 active transfer에서 소비자가 관찰한 revision 하한입니다.
  Canonical signing bytes는 JSON 순서와 무관한 payload
  digest 및 fetch/ack의 `artifact.read` 또는 cancel의 별도 `artifact.cancel` scope를
  포함합니다. Retained, wrong topic/identity,
  expired, unknown field, effect/admin scope, invalid signature와 replay는 artifact use
  case 전에 닫힙니다. Admitted cancel의 closed Application 결과는 별도
  `yeonjang.artifact-cancel-ack.v2` response로 exact request/owner/transfer와 결속하고
  기존 response signer로 서명합니다. Fresh cancel과 durable exact redelivery는 각각
  `cancelled`, `already_cancelled`이며 use-case rejection은 bounded reason을
  `rejected`로 회신합니다. Protocol/admission rejection은 이 response로 노출하지
  않습니다. Chunk binary frame과 MQTT publish 연결은 다음 boundary가 소유합니다.
- artifact chunk wire는 `YAC2` magic, big-endian header length, strict versioned JSON
  header와 raw payload 순서입니다. Decoder는 header bound와 unknown field를 닫고
  `ArtifactChunk::from_untrusted`를 다시 거쳐 payload size/digest를 검증합니다. MQTT
  artifact adapter는 admitted fetch만 path-free Application command로 만들고 QoS 1,
  non-retained exact transfer chunk publish 목록과 opaque completion token을 반환합니다.
  Outer transport가 모든 enqueue 성공을 보고한 뒤에만 `awaiting_ack`를 commit하며
  partial failure는 durable artifact failure입니다. Signed exact ack만
  cleanup-required를 만들고 duplicate ack는 cleanup effect를 반복하지 않습니다.
- owned Tokio MQTT pump는 command/control/admin과 같은 EventLoop에서 artifact schema를
  exact discriminator로 route하고 requester-bound `artifact/+/ack` filter의 concrete
  topic을 다시 transfer ID로 검증합니다. Request-channel capacity보다 subscription
  수가 많아도 시작 전에 막히지 않도록 subscription enqueue와 EventLoop polling을
  interleave합니다. Multi-chunk publish도 한 chunk씩 queue/poll하며 모든 enqueue가
  끝난 뒤에만 artifact lifecycle을 `awaiting_ack`로 전환합니다. Normal response와
  artifact publish는 하나의 FIFO outgoing/PUBACK tracker를 공유하고 shutdown drain도
  같은 owner가 수행합니다. Connection failure는 protocol state, packet-too-large,
  timeout, I/O와 handshake class로 닫혀 generic connection error보다 원인을 보존합니다.
  Durable exact-transfer cancel completion은 같은 pump가 소유한 아직 미전송 chunk
  batch만 제거합니다. 이미 rumqttc 또는 broker가 accepted한 frame은 회수할 수 없지만
  canonical `Cancelled`가 이후 acknowledgement와 cleanup 전이를 차단합니다. 같은
  completion action이 signed cancel ack를 normal response outbox에 enqueue하므로 batch
  중단과 requester 회신의 pump owner가 갈라지지 않습니다.
  Exact ack의 cleanup-required는 injected cleanup sink로만 전달되며 filesystem 삭제와
  restart orphan recovery는 후속 owner가 담당합니다.
- artifact aggregate는 execution/delivery terminal state와 별도로 durable
  `cleanup pending|completed`를 소유합니다. Ack, expiry, cancellation 또는 transfer
  failure 뒤 cleanup은 pending이며 file removal 성공 또는 exact already-missing 뒤
  CAS가 통과해야 completed가 됩니다. Cleanup 실패에서는 revision을 바꾸지 않아 restart
  candidate를 잃지 않습니다. Recovery use case는 read-only lifecycle snapshot을
  순회하고 active TTL을 먼저 canonical expired transition한 다음 같은 opaque-ref
  cleanup port를 호출합니다. Filesystem port는 configured canonical root의 exact digest
  directory, regular capture/manifest allowlist만 제거하고 symlink, wrong ref와 unknown
  entry를 거부합니다. MQTT ack handoff와 startup recovery adapter는 동일 cleanup use
  case를 사용합니다. 이전 schema-1 record에 cleanup status가 없으면 pending으로
  복구해 데이터가 남는 방향으로 fail-safe합니다.
- production artifact composition은 configured capture root를 bootstrap에서 한 번
  canonicalize하고 instance-scoped filesystem owner와 atomic lifecycle storage를
  엽니다. 같은 concrete filesystem object를 capture sink, verified transfer source와
  cleanup port로 공유하고 같은 durable repository를 transfer use case와 restart
  recovery에 주입합니다. Recovery는 MQTT subscribe보다 앞선 activation gate이며
  cleanup deferred가 있으면 typed startup failure로 닫힙니다. Router attachment와 pump
  cleanup attachment도 이 composition만 제공하므로 test와 production이 별도 상태
  복사본을 만들지 않습니다. Managed runtime은 해당 composition을 shutdown까지
  소유하며 raw environment나 path를 Application에서 다시 읽지 않습니다.
- capture platform success receipt는 opaque native string을 artifact metadata로
  재해석하지 않습니다. Platform adapter가 filesystem manifest post-check 결과를
  path-free `PlatformCaptureArtifactReceipt`로 변환하고, Application registration
  use case가 exact requester/request/operation, completion time과 configured TTL로
  durable artifact binding을 먼저 등록합니다. Exact idempotent registration까지
  성공해야 fetch 가능한 descriptor가 됩니다. Conflict/unavailable은
  `artifact_commit_failed`와 confirmed-applied effect state로 terminal에 남아 device
  effect와 delivery failure를 구분합니다.
- v2 terminal content schema 2는 optional artifact descriptor에 opaque ref, kind/media
  type, size, full digest, created/expiry와 lifecycle revision을 포함합니다. Schema-1
  durable terminal은 artifact 없음으로 읽기 호환하며 새 writer만 schema 2를 냅니다.
  Controlled MQTT fixture는 command terminal을 받은 뒤 exact descriptor binding으로
  fetch/2 chunks/full-digest ACK를 수행합니다. Startup recovery는 filesystem의 exact
  digest directory inventory와 canonical lifecycle ref를 비교해 등록 전 crash
  orphan만 제거하고, unknown/symlink inventory에서는 activation을 차단합니다.
- production MQTT v2 HMAC boundary는 inbound primary와 최대 두 개의 명시적 rollback
  key snapshot, 별도 outbound signing key snapshot만 bootstrap에서 받습니다. Exact
  issuer/key ID가 일치한 snapshot만 선택하고 command, cancel, receipt query,
  response ACK, artifact와 policy-admin verifier가 protocol 소유 canonical bytes를
  HMAC-SHA256으로 검증합니다. 모든 v2 response signer도 같은 adapter를 사용하지만
  outbound selected key 외에는 서명하지 않습니다. Proof는 lowercase fixed digest로
  decode하고 HMAC library의 constant-time verify를 사용합니다. Secret은 Debug/log에
  없고 key snapshot drop에서 buffer를 zero-fill합니다.
- production MQTT v2 policy-admin lane은 command가 읽는
  `DurablePermissionPolicyRepository`의 동일 `Arc`를 admin writer에도 주입해
  canonical policy write owner를 하나만 유지합니다. Strict admin DTO와 HMAC
  admission을 통과한 grant도 runtime snapshot의 exact requester, instance, session,
  target fingerprint와 expiry guard를 다시 통과해야 하며 `effect.execute` scope는
  policy writer에 도달하지 않습니다. Admin adapter가 있을 때 pump는 exact admin
  topic을 command/control/artifact-ack와 함께 구독하고, applied,
  revision-conflict와 durable replay를 signed closed result로 반환합니다. Admin
  처리 자체는 platform port를 호출하지 않습니다. Controlled production test는
  admin apply와 duplicate replay에서 camera/screen 호출 0회, repository 재부팅 뒤
  revision 복구, 그리고 다음 signed camera command가 같은 정책을 읽어 실제
  artifact terminal을 만드는 것까지 직접 MQTT로 검증합니다.
- signed MQTT v2 status는 exact instance/session/fingerprint와 `online|offline`,
  observed/expiry, sequence 및 `status.publish` signing identity를 가진 strict
  retained projection입니다. Online은 최대 5분의 finite expiry이고 runtime pump가
  TTL의 1/3 주기로만 갱신합니다. Offline은 CONNECT 시점에 고정되는 MQTT Last Will의
  한계 때문에 `i64::MAX` expiry와 `unexpected_disconnect` reason을 사용하며, 같은
  exact session의 다음 retained online이 이를 대체합니다. 이는 liveness projection일
  뿐 command, permission, effect 또는 artifact 성공 증거가 아닙니다.
- production runtime composition은 HMAC-signed offline envelope를 broker connection
  생성 전에 QoS 1 retained Last Will로 결속합니다. CONNACK 뒤에만 signed online을
  enqueue하고 GUI connected projection을 갱신하며, owned heartbeat가 유효기간 전에
  online을 재발행합니다. Graceful shutdown은 진행 중 response/artifact를 drain한 뒤
  signed `graceful_shutdown` offline을 enqueue/PUBACK drain하고 DISCONNECT합니다.
  Connection loss에서는 broker Last Will이 대신 offline을 투영합니다. Status build,
  signature 또는 publish 실패는 typed runtime/pump failure이며 연결 성공으로
  숨기지 않습니다.
- signed MQTT v2 capabilities는 production common execute path가 실제 구현한
  `camera.capture|screen.capture` 두 method만 canonical descriptor에서 투영합니다.
  Platform availability와 bootstrap 시 한 번 관측한 immutable backend capability,
  durable local-policy decision/revision, implementation status, cancellation,
  post-check와 artifact delivery 계약은 서로 다른 필드입니다. Local policy deny는
  adapter 부재로 위장하지 않고, Android/iOS serialized platform은
  `contract_only`로 보존하되 executable method로 광고하지 않습니다. Envelope는 exact
  instance/session/fingerprint, observed/expiry/sequence와
  `capabilities.publish` HMAC identity를 가지며 QoS 1 retained입니다. Legacy node
  capability JSON은 이 production v2 projection의 authority가 아닙니다.
- `capture.permission.get`은 기존 strict capabilities/command schema를 바꾸지 않는
  additive `yeonjang.control.v2` read 계약입니다. `permission.read` HMAC admission
  뒤 Application read owner가 canonical policy snapshot을 읽고, injected
  non-prompting observer를 정확히 한 번 호출합니다. 응답은
  `yeonjang.capture-permission-response.v2`로 camera/screen availability, policy
  revision/decision/constraint 종류와 OS observation을 분리합니다. 개별 native
  observation 실패는 grant로 추정하지 않고 `not_observed`, 전체 owner 실패는 row가
  없는 typed outcome으로 반환합니다. 이 경로는 capture preflight/effect, policy
  writer와 OS permission request API를 호출하지 않습니다.
- status와 capability publication은 sole MQTT EventLoop owner가 기다리는 rumqttc
  request channel에 다시 `publish().await`하지 않습니다. Pump-owned retained
  outbox가 exact topic별 최신 snapshot 하나만 coalesce하고 `try_publish` 뒤 다음
  EventLoop poll에서 capacity와 PUBACK를 진행하므로 느린 broker에서도 heartbeat가
  무한히 쌓이거나 owner가 자기 교착하지 않습니다. Graceful shutdown은 남은
  projection을 버리고 signed offline만 같은 outbox로 drain해 최종 retained 상태를
  보장합니다.
- policy admin adapter의 public typed publication result는 signed response와 별도로
  `refresh_capabilities`를 전달합니다. 이 값은 canonical repository가 실제
  `Applied`를 반환한 경우에만 true이며 replay, unchanged, revision conflict,
  authorization rejection이나 user-facing 문자열을 재해석해 만들지 않습니다. Pump는
  이 신호 뒤 같은 `PermissionPolicyReader`에서 새 revision을 읽어 capability를 즉시
  재발행합니다. Controlled production MQTT 검증은 revision 0 deny projection,
  signed admin apply, revision 1 allow projection 순서와 platform effect 0회를
  확인합니다.
- production MQTT pump는 network/flush timeout, socket I/O, MQTT state I/O, TLS의
  typed I/O source와 broker `service_unavailable`만 reconnect 가능한 transport
  class로 취급합니다. `rumqttc`가 TLS 세부 enum을 공개하지 않으므로 문자열 대신
  표준 error source chain의 `std::io::Error` 타입을 확인합니다. 인증서·키·DNS·TLS
  검증 실패, 인증 거부, invalid state/packet/handshake와 request-stream 종료는 기존
  typed terminal pump failure로 유지해 재연결로 숨기지 않습니다. Reconnect
  backoff는 shutdown watch와 같은 owner 안에서 경쟁하며 별도 task를 만들지 않습니다.
- reconnect CONNACK마다 command/control/admin/artifact ingress의 exact topic을 다시
  구독하고 signed online/capability projection을 새로 발행합니다. Broker session
  continuity에만 correctness를 맡기지 않으며, 동일 signed command가 재전달되면
  durable terminal을 재생하고 platform effect는 반복하지 않습니다. Controlled
  two-connection production 검증은 첫 terminal PUBACK 전 socket loss, 동일 client
  identity, 두 번째 terminal parity와 camera effect 1회를 확인합니다.
  별도 artifact reconnect 검증은 synthetic 300KB JPEG의 첫 `YAC2` chunk를 consumer가
  digest 검증한 뒤 PUBACK 없이 연결을 끊습니다. 두 번째 session에서 retransmit과 남은
  chunk를 같은 reference assembler가 duplicate-safe하게 받아 full digest를 검증한
  뒤에만 signed exact ACK와 cleanup을 진행하며 capture effect는 1회로 유지됩니다.
  Signed macOS actual gate는 script-owned container 안의 Mosquitto process만
  재시작해 TLS socket을 실제로 끊습니다. Requester는 같은 mTLS/client identity로
  다시 연결하고, signed app은 외부 재연결 신호 없이 ingress를 재구독한 뒤 fresh
  online/capability를 발행해야 합니다. 이후 실제 camera/screen artifact 완료가
  통과해야 reconnect를 성공으로 인정합니다. Docker Desktop에서 임의 공개 port가
  container restart 뒤 사라지는 현상은 product retry로 보상하지 않고 test-only
  supervisor로 container/host port를 유지합니다.
- sole EventLoop owner는 terminal response에도 `publish().await`를 사용하지 않습니다.
  Completion은 delivery receipt를 먼저 durable register한 뒤 pump-owned response
  outbox에 넣고, `try_publish`와 다음 EventLoop poll로 bounded rumqttc queue를
  진행합니다. QoS 1 tracker는 모든 publication을 packet ID와 연결하되 receipt ID는
  terminal에만 보유하며, reconnect 때 rumqttc가 같은 packet ID를 retransmit하면 새
  pending publication을 소비하지 않습니다. Exact PUBACK만 receipt를 한 번
  `published`로 전이합니다.
- durable v2 terminal schema 2의 `prepared` record는 exact-bound effect-unknown
  response content를 effect dispatch 전에 같은 CAS로 저장합니다. 같은 process의
  duplicate는 `InProgress`지만, 새 process의 bootstrap은 모든 prepared record를
  `Completed`로 원자 확정한 뒤에만 handler/MQTT를 활성화합니다. 재전달은
  `restart_recovery_required`, unknown effect, manual verification terminal을
  재생하며 platform effect를 호출하지 않습니다. 정상 completed content는 restart
  뒤 immutable하게 재생됩니다.
- terminal schema 1 completed record는 read compatible입니다. 반면 exact recovery
  content가 없는 schema 1 pending은 안전하게 effect 여부를 추론할 수 없으므로
  `RecoveryEvidenceMissing` bootstrap failure이며 rewrite, artifact cleanup, MQTT
  connect와 자동 effect retry를 하지 않습니다. Prepared recovery CAS 실패도
  `RecoveryCommitFailed`로 activation 전에 닫힙니다. Schema 2 state를 쓴 뒤 구
  binary로 즉시 rollback할 수 없으므로 cutover 전 state backup, 새 binary rehearsal,
  rollback 시 backup restore가 release gate입니다.
- delivery receipt registration은 receipt의 immutable owner/request/command/operation,
  idempotency, target, terminal revision과 response digest만 replay binding으로
  비교합니다. 기존 durable `Published` 또는 `ConsumerAcknowledged` state와 delivery
  revision은 새 process가 만든 `Queued` projection으로 되돌리지 않습니다. 따라서
  completed terminal restart replay는 같은 delivery binding을 재사용하고 exact
  PUBACK/consumer ACK 상태를 보존합니다.
- production MQTT pump의 정상 종료와 모든 조기 반환은 하나의 shutdown sink를 통해
  canonical active-command registry에 runtime cancellation을 먼저 요청합니다. 정상
  경로는 worker terminal, response/artifact publication과 DISCONNECT를 drain하고,
  composition task는 blocking OS adapter가 남을 수 있는 오류 경로에서도 registry의
  active owner가 실제 0이 될 때까지 exact instance activation guard를 유지합니다.
  Runtime handle Drop은 성공을 추정하거나 임대를 직접 풀지 않고 shutdown만 요청하며,
  pump task가 최종 guard owner입니다. Registry poison은 0으로 간주하지 않아 중복
  runtime 시작을 fail-closed합니다.
- `release_identity.rs`는 explicit executable 또는 bootstrap에서 한 번 얻은 current
  executable을 64 KiB chunk로 읽어 package version, compiled OS/arch, byte size와
  SHA-256만 `yeonjang.release-identity.v1`로 투영합니다. Raw path, settings, credential,
  MQTT와 Gateway state는 포함하지 않으며 digest 일치는 device effect 증거가 아닙니다.
  Platform package staging은 Mach-O/ELF/PE header와 requested target을 먼저 대조하고,
  source/staged binary와 permission/protocol contract digest를
  `release-identity.json`에 고정합니다. Generated package verifier는 이후 binary
  tamper를 closed reason으로 거부합니다.
- Schema-3 durable terminal compatibility는 platform-neutral Rust state contract로
  소유합니다. 2026-07-31 actual rehearsal은 distinct signed macOS arm64 current/previous
  package와 같은 state root를 사용해 exact terminal/receipt/digest replay와 새 effect
  0을 검증했습니다. Windows ARM64와 Ubuntu X11은 별도 native package/device gate로
  OS adapter와 loaded identity를 검증합니다.
