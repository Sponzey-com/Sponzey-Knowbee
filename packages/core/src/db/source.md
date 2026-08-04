# source.md

## 역할

- `db`는 SQLite 초기화, 마이그레이션, 타입 기반 헬퍼 쿼리를 담당합니다.

## 주요 파일

- `index.ts`: 연결 생명주기와 session, message, run, schedule, memory, channel ref, audit log 헬퍼
- `migrations.ts`: 스키마 변경 이력
- `approved-operation-continuation-repository.ts`: consumed side-effect approval의
  opaque resume identity를 enqueue/lease-claim/complete/fail하는 SQLite adapter

## 메모

- run 상태, 메시지 이력, 스케줄 이력, Telegram 메시지 참조, 메모리가 모두 여기서 만납니다.
- 스케줄은 이제 `target_channel`뿐 아니라 `target_session_id`도 저장해서, 반복 실행 결과를 어느 Telegram 세션으로 돌려보낼지 추적합니다.
- 반복 스케줄은 `execution_driver`도 함께 저장해서 내부 scheduler인지, 시스템 스케줄러(crontab / schtasks)인지 구분합니다.
- 반복 스케줄은 `origin_run_id`, `origin_request_group_id`도 함께 저장해서, 나중의 `schedule.run.*` 실패/완료가 어떤 등록 태스크에서 만들어졌는지 DB 기준으로도 다시 연결할 수 있게 정리 중입니다.
- `better-sqlite3`를 동기 방식으로 쓰므로 헬퍼 함수도 비교적 직접적인 형태입니다.
- 이전 Gateway 프로세스가 남긴 `running` channel-smoke row는 기존 status schema 안에서
  `failed/gateway_restart_interrupted`로 조건부 갱신하며, CLI 소유 row는 제외합니다.
- migration 74의 `approved_operation_continuations`는 approval/run/tool/operation ID,
  binding hash와 version만 저장합니다. raw Tool params, target, path, image와 secret은
  저장하지 않습니다. approval ID unique enqueue와 lease CAS로 live/restart consumer의
  중복 claim을 막으며, pre-74 binary는 이 additive table을 읽지 않는 rollback
  호환성을 유지합니다.
- migration 75는 `approval_registry`에 nullable
  `decision_actor_fingerprint`와 exact channel callback 조회 index를 추가합니다.
  기존 row는 backfill하지 않아 restart callback 자동 승인 대상이 아니며, 새
  Telegram row만 exact message와 hashed actor binding을 가진 상태로 결정됩니다.
- migration 77은 `side_effect_operations`의 closed state에 `EFFECT_REJECTED`,
  `side_effect_operation_receipts`의 closed event에 `RECORD_REJECTION`을 추가합니다.
  SQLite table rebuild 동안 기존 operation/receipt row, revision, binding, target,
  timestamps와 foreign key를 그대로 복사하고 index를 다시 생성합니다. populated-row
  migration rehearsal과 `PRAGMA integrity_check`가 데이터 보존을 검증하며, 운영 적용
  전 backup이 rollback 경계입니다.
- artifact receipt 조회는 새 target-bound delivery에서
  `delivery_receipt_json.channelTarget`까지 일치해야 restart dedupe 근거가 됩니다.
  같은 run/channel/path라도 다른 chat/thread의 receipt는 현재 전달을 완료한 것으로
  보지 않습니다. schema 변경 없이 기존 JSON receipt 계약을 엄격하게 읽습니다.
