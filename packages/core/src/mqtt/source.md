# source.md

## 목적과 경계

`mqtt`는 Gateway Infrastructure 계층의 내장 broker 신뢰 경계입니다. 인증된 연결과
검증된 Yeonjang 상태 projection만 제공하며 실행 승인이나 사용자 완료 판정을 하지 않습니다.

| Path | Responsibility | Boundary / Side effects |
| --- | --- | --- |
| `broker.ts` | broker 생명주기, 인증, v1 소유권, signed v2 retained 관측 admission | TCP listener와 registry projection write; requester route는 bootstrap identity로 제한 |

v2 status/capability는 retained·HMAC·instance/session/fingerprint·expiry·sequence를 검증한
뒤 기존 registry writer에 전달합니다. broker credential 인증만으로는 충분하지 않으며,
같은 인증 생명주기의 client가 immutable bootstrap requester와 일치하는 v2 requester route를
먼저 구독하고 active 상태가 된 뒤에만 관측을 투영합니다. Aedes가 초기 구독을 `clientReady`
전에 authorize할 수 있으므로 단조 증가 authentication generation으로 두 이벤트를 결속합니다.
이 connection-scoped admission은 disconnect·broker stop에서 제거되고 같은 client ID의 이전
연결이 재사용할 수 없으며 canonical liveness를 소유하지 않습니다. stale/duplicate 관측과 이전 session은
현재 상태를 되돌리지 못하며 offline Last Will은 새 signed online 관측 전까지 실행 가능
상태가 아닙니다.
Broker credential 거부와 requester config/mismatch는 서로 다른 bounded reason code로
기록해 자격증명 재설정과 exact requester 수정 조치를 혼동하지 않습니다.
broker 소유 liveness sweep는 signed status lease 만료를 offline으로 수렴시키며 lifecycle과
함께 종료됩니다. broker의 실제 신규 시작은 SQLite에 남은 v2 session/client/method 상태를
fail-closed로 닫고, fresh signed status가 도착하기 전에는 이전 상태를 재사용하지 않습니다.
이 startup fence는 v1 transport와 CLI 소유 상태를 변경하지 않습니다.
종료 시 TCP listener는 즉시 새 연결을 거부하도록 close를 시작하고, Aedes broker가 소유한
활성 client를 먼저 종료한 뒤 listener drain 완료를 기다립니다. 따라서 연결된 Yeonjang이
있어도 Gateway shutdown이 서로를 기다리는 순환 대기에 빠지지 않습니다.
- `client-error-log-throttle.ts`는 동일 client failure의 첫 Product Log를 즉시 남기고
  반복 건을 bounded process-local window로 집계합니다. 다음 보고에는 억제 건수를
  포함하며 broker shutdown 때 상태를 지웁니다. transport나 canonical 상태에는 관여하지
  않습니다.
