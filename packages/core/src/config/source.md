# source.md

## 목적과 경계

`config`는 bootstrap에서 raw environment와 persisted settings를 한 번 읽어 immutable typed
runtime snapshot으로 변환합니다. Domain과 Application에는 환경 변수 이름이나 raw map을
전달하지 않습니다.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `index.ts` | 설정 로딩, legacy 정규화, startup validation | config file·environment read; runtime 중 재로드 없음 |
| `types.ts` | immutable runtime config 계약 | I/O 없음 |
| `paths.ts` | state, DB, log, session, plugin 경로 결정 | host path read at bootstrap |
| `auth.ts` | 인증 token 생성·저장 보조 | secret storage boundary |

활성 AI 진실 원천은 `ai.connection` 하나입니다. `KNOWBEE_MQTT_V2_REQUESTER_ID`는 Gateway의
v2 requester enrollment로 startup에 한 번 읽어 lowercase identifier로 검증하며 broker
계정, agent 이름 또는 legacy node ID에서 추론하지 않습니다.
