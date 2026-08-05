# source.md

## 목적과 경계

`logger`는 Gateway의 Product, Field Debug, Development 로그 목적과 공통 redaction을 소유하는
Infrastructure 경계입니다. 호출자는 구조화된 최소 진단 값만 넘기며, 로그는 상태·승인·재시도 결정을
소유하지 않습니다.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `index.ts` | startup-captured log policy, purpose visibility, redaction, stdout/stderr emission | Field Debug는 `KNOWBEE_FIELD_DEBUG_UNTIL`의 future Unix epoch milliseconds 동안만 허용; raw payload·secret·local path를 기록하지 않음 |
