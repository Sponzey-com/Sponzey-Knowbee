# Task 010 - 반응형 레이아웃, Redaction, Architecture Gate 정리

상태: completed
자동 검증 상태: 통과
수동 smoke 상태: 미실행
운영 증거: 있음
완료 판정 가능 여부: 예, 자동 release gate 기준. 단, 실제 브라우저 viewport smoke는 후속 확인 필요.
검증 환경: 로컬 개발 환경
검증 실행자: Codex

우선순위: P0

## 목표

서브 에이전트 설정 UI 개선 전체를 release 가능한 수준으로 정리한다. 레이아웃 overflow, secret 노출, architecture 회귀, TypeScript/generated artifact 불일치를 최종적으로 잡는다.

이번 태스크의 완료 기준은 다음 3가지다.

1. 쉬운 설정, 고급 설정, 토폴로지, 런타임 모니터링의 반응형/스크롤 품질을 자동 gate로 고정한다.
2. 사용자-facing 화면과 trace에서 secret, credential URL, raw payload, internal id가 노출되지 않도록 redaction을 강화한다.
3. architecture/test/type/build/generated gate를 통과하고, 실패한 검증과 남은 위험을 문서화한다.

## 기준 문서

- `.tasks/plan.md`의 `12. UI 구성 계획`
- `.tasks/plan.md`의 `13. 구현 단계`
- `.tasks/plan.md`의 `14. 테스트 계획`
- `.tasks/plan.md`의 `15. 완료 기준`
- `AGENTS.md`의 Architecture Cleanup Gate, WebUI 개발 기준, 작업 완료 조건

## 선행 조건

- `task001.md`
- `task002.md`
- `task003.md`
- `task004.md`
- `task005.md`
- `task006.md`
- `task007.md`
- `task008.md`
- `task009.md`

## 후속 의존 태스크

- 없음

## 포함 기능

- [x] 반응형 레이아웃과 스크롤 회귀 정리
- [x] 전체 redaction과 이름 attribution 점검
- [x] architecture/test gate와 release 정리

---

## 기능 1 - 반응형 레이아웃과 스크롤 회귀 정리

### 목표

서브 에이전트 설정 UI가 화면 밖으로 넘어가거나, 하단 버튼/카드가 조작 불가능해지는 문제를 막는다.

### 구현 결과

- 쉬운 설정 readiness panel과 생성 dialog에 `min-w-0`, `overflow-wrap:anywhere`, viewport 기반 `max-height`, `overflow-y-auto`를 적용했다.
- 긴 이름, 별명, 역할, 설명, validation message가 카드와 버튼을 밀어내지 않도록 wrapping class를 보강했다.
- 토폴로지 작업 화면의 shell, toolbar, 추천 executor 버튼, 첫 시작 영역에 narrow width wrapping과 overflow 방지 class를 보강했다.
- 토폴로지 inspector의 제목, badge, 입력 필드, 설명 영역에 overflow 방지 class를 보강했다.
- 고급 설정 화면의 list/detail 2단 레이아웃, agent detail, runtime monitor, trace/review 카드에 `min-w-0`, scroll, wrapping guard를 추가했다.
- 고급 설정 editor는 선택 agent 변경 시 `key={detail.agentId}`로 remount되도록 정리해 이전 agent의 임시 입력/오류가 섞이지 않게 했다.

### 구현 체크리스트

- [x] 쉬운 설정 화면을 점검한다.

  - [x] readiness panel overflow
  - [x] create dialog overflow
  - [x] sub-agent card list overflow
  - [x] CTA button wrapping
  - [x] 긴 이름/별명/설명 처리
- [x] 토폴로지 화면을 점검한다.

  - [x] canvas와 inspector 분할
  - [x] inspector scroll
  - [x] node drag feedback의 기존 gate 유지
  - [x] selected node action area
  - [x] 저장/발행 버튼 접근성
- [x] 고급 설정 화면을 점검한다.

  - [x] 목록/상세 2단 레이아웃
  - [x] 좁은 폭에서 세로 재배치
  - [x] 섹션 내부 스크롤
  - [x] 하단 상태 바/버튼 영역
  - [x] 권한 카드와 Skill/MCP 목록 overflow
- [x] 런타임 모니터링 화면을 점검한다.

  - [x] trace timeline scroll
  - [x] 긴 event summary wrapping
  - [x] 필터/검색 영역
  - [x] empty/degraded/error state
- [x] CSS/layout 기준을 정리한다.

  - [x] fixed width 남용 제거
  - [x] min-width로 overflow 만드는 요소 제거
  - [x] `min-width: 0` 필요한 flex/grid child 확인
  - [x] `box-sizing` 영향 없음 확인
  - [x] stable height/scroll container 확인
  - [x] button text wrapping 적용

### 검증 시나리오

- [x] 자동 release gate에서 주요 container가 overflow guard를 갖는지 확인했다.
- [x] 긴 한글/영문 이름과 설명이 UI를 밀어내지 않도록 static markup test로 확인했다.
- [x] 권한 카드와 trace 카드가 오른쪽으로 넘어가지 않도록 runtime monitor markup class를 확인했다.
- [ ] 실제 브라우저에서 1280px desktop viewport를 수동 확인한다.
- [ ] 실제 브라우저에서 1024px width viewport를 수동 확인한다.
- [ ] 실제 브라우저에서 768px width viewport를 수동 확인한다.
- [ ] 프로젝트가 모바일 대응을 요구하면 390px viewport를 수동 확인한다.

---

## 기능 2 - 전체 redaction과 이름 attribution 점검

### 목표

사용자-facing 화면과 trace가 agent 이름/별명을 사용하고, secret/raw/internal 데이터가 노출되지 않도록 전체 경로를 점검한다.

### 구현 결과

- 고급 설정 runtime monitor의 redaction을 강화했다.
- API key, OAuth token, MCP secret, bearer token, credential URL, raw screenshot binary, raw diagnostics, run/task/trace id가 사용자-facing markup에 노출되지 않는 테스트를 추가했다.
- sub-session handoff data exchange provenance가 memory isolation validator에서 인식되는 `opaque:command_request:*` 형태로 저장되도록 수정했다.
- static architecture audit에서 실제 compatibility boundary로 남겨야 하는 `single_nobie` 경로를 명시적으로 허용하고, `.tasks/architecture-cleanup-inventory.md`에 cleanup 경계를 남겼다.

### 구현 체크리스트

- [x] 이름 attribution 경로를 점검한다.

  - [x] 쉬운 설정
  - [x] 토폴로지
  - [x] 고급 설정
  - [x] runtime monitor
  - [x] validation message
  - [x] final result preview
- [x] internal id 표시 경로를 점검한다.

  - [x] product view 기본 숨김
  - [x] debug/dev test id 허용 범위 분리
  - [x] runtime monitor 기본 표시에서 raw id redaction
- [x] secret redaction 경로를 점검한다.

  - [x] API key
  - [x] OAuth token
  - [x] MCP secret
  - [x] raw endpoint with credential
  - [x] raw tool input/output
  - [x] stack trace
  - [x] screenshot binary
- [x] validation/error message를 점검한다.

  - [x] raw validator key 직접 노출 금지
  - [x] optional locale absence를 fatal error로 표시하지 않음
  - [x] 사용자 입력 오류와 시스템 오류 구분
  - [x] 권한 필요와 실행 실패 구분
- [x] 로그 수준을 점검한다.

  - [x] product
  - [x] debug
  - [x] dev/test
  - [x] 프로세스 중간 환경 삽입 금지 원칙 유지

### 검증 시나리오

- [x] 모든 agent 관련 기본 표시가 이름/별명 기준으로 보이는지 기존 task suite와 task010 gate로 확인했다.
- [x] internal id가 사용자 기본 화면에 노출되지 않는지 task010 gate로 확인했다.
- [x] secret이 UI, trace, static markup에 노출되지 않는지 task010 gate로 확인했다.
- [x] optional 한국어 prompt/source 부재가 오류로 표시되지 않는지 prompt gate로 확인했다.
- [x] 로그 수준별 표시 범위는 기존 architecture/prompt 정책 테스트와 충돌하지 않는다.

---

## 기능 3 - architecture/test gate와 release 정리

### 목표

전체 변경이 프로젝트 지향점과 충돌하지 않는지 architecture gate로 확인하고, 검증 결과와 남은 위험을 정리한다.

### 구현 결과

- task010 전용 UI release gate를 추가했다.
- 변경된 파일만 대상으로 Biome check를 통과시켰다.
- core generated compatibility artifact를 `pnpm run core:sync-src-artifacts`로 동기화했다.
- architecture gate 전체를 통과시켰다.
- root `pnpm run lint`는 저장소 전역 기존 Biome 문제로 실패했으며, 이번 변경 범위의 targeted Biome check는 통과했다.

### 구현 체크리스트

- [x] 관련 unit test를 실행한다.

  - [x] view model
  - [x] command validator
  - [x] projection
  - [x] redaction
  - [x] delegation policy
  - [x] memory/permission policy
- [x] 관련 component test를 실행한다.

  - [x] 쉬운 설정
  - [x] 토폴로지 inspector
  - [x] 고급 설정 shell/sections
  - [x] Skill/MCP binding
  - [x] runtime monitor
- [x] 관련 integration/contract test를 실행한다.

  - [x] easy create -> topology -> advanced
  - [x] model override
  - [x] Skill/MCP independent binding
  - [x] memory isolation
  - [x] direct-child delegation
  - [x] redelegation trace
- [x] architecture gate를 실행한다.

  - [x] `pnpm run test:architecture:static`
  - [x] `pnpm run test:architecture:runtime`
  - [x] `pnpm run test:architecture:webui`
  - [x] `pnpm run test:architecture:prompts`
  - [x] `pnpm run test:architecture:generated`
- [x] 타입체크와 빌드를 실행한다.

  - [x] TypeScript typecheck
  - [x] Web build
  - [x] generated compatibility artifact sync
  - [x] 변경 파일 targeted lint/format check
  - [ ] root lint 통과
- [ ] smoke 검증을 수행한다.

  - [ ] dev server 또는 local start script 실행
  - [ ] 쉬운 설정 서브 에이전트 생성
  - [ ] 토폴로지 표시
  - [ ] 고급 설정 수정
  - [ ] runtime monitor 표시
  - [ ] reload 후 저장 상태 유지
- [x] release note 또는 완료 보고 자료를 정리한다.

  - [x] 변경 요약
  - [x] 검증 명령과 결과
  - [ ] 수동 smoke 결과
  - [x] 남은 위험
  - [x] 후속 작업

### 검증 시나리오

- [x] architecture gate가 현재 지향점 기준으로 통과한다.
- [x] generated artifact와 TypeScript source가 동기화되어 있다.
- [x] 빌드 결과에서 compile regression이 없다.
- [ ] smoke에서 저장/새로고침/런타임 표시가 동작한다.
- [x] 실패한 검증 이유와 남은 위험이 명확히 기록된다.

---

## 검증 결과

### 통과

- [x] `pnpm exec biome check packages/webui/src/components/setup/SubAgentReadinessPanel.tsx packages/webui/src/components/topology/ExecutorWorkspaceShell.tsx packages/webui/src/components/topology/ExecutorInspector.tsx packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx packages/webui/src/lib/advanced-sub-agent-settings.ts packages/core/src/orchestration/sub-session-runner.ts tests/task010-ui-release-gate.test.tsx tests/legacy-routing-static-audit.test.ts`

  - 결과: 8 files checked, no fixes applied.
- [x] `pnpm exec vitest run --cache=false tests/task005-advanced-sub-agent-settings.test.tsx tests/task010-ui-release-gate.test.tsx`

  - 결과: 2 files passed, 8 tests passed.
- [x] `pnpm exec vitest run --cache=false tests/task001-executor-ux-exposure-policy.test.tsx tests/task002-executor-ux-language.test.tsx tests/task002-topology-workspace-routing.test.tsx tests/task002-ui-navigation.test.ts tests/task004-simple-workspace-shell.test.tsx tests/task012-advanced-escape-hatch.test.tsx tests/task012-topology-workspace-release-gate.test.ts tests/task013-executor-first-usability.test.tsx tests/task002-sub-agent-settings-view-model.test.ts tests/task003-beginner-sub-agent-setup.test.tsx tests/task004-topology-sub-agent-sync.test.tsx tests/task005-advanced-sub-agent-settings.test.tsx tests/task006-advanced-sub-agent-identity-model.test.tsx tests/task007-advanced-skill-mcp-bindings.test.tsx tests/task008-advanced-memory-permission-delegation.test.tsx tests/task009-sub-agent-runtime-monitoring.test.tsx tests/task010-ui-release-gate.test.tsx tests/task003-child-memory-bootstrap.test.ts tests/task012-agent-prompt-bundle-preflight.test.ts`

  - 결과: 19 files passed, 88 tests passed.
- [x] `pnpm run core:sync-src-artifacts`

  - 결과: 1656 generated core src artifacts synced.
- [x] `pnpm run test:architecture`

  - 결과: static 35 tests, runtime 24 tests, webui 21 tests, prompts 38 tests, generated 3 tests 통과.
  - 참고: webui gate에서 React Router `useLayoutEffect` SSR warning이 출력되지만 테스트는 통과한다.
- [x] `pnpm --filter @nobie/core typecheck`

  - 결과: 통과.
- [x] `pnpm --filter @nobie/core build`

  - 결과: 통과.
- [x] `pnpm --filter @nobie/webui build`

  - 결과: 통과.
  - 참고: Vite chunk size warning이 출력된다.

### 실패 또는 미실행

- [ ] `pnpm run lint`

  - 결과: 실패.
  - 원인: 저장소 전역 기존 Biome 포맷/정렬 문제. `Yeonjang/target/**` 빌드 산출물과 package/tsconfig formatting 등 이번 변경 범위 밖 diagnostics가 대량 포함된다.
  - 최신 수치: 4008 files checked, 8603 errors, 81 warnings.
  - 이번 변경 범위는 targeted Biome check로 통과 확인했다.
- [ ] 실제 브라우저 수동 smoke

  - 결과: 미실행.
  - 남은 확인: 1280px, 1024px, 768px viewport에서 쉬운 설정, 서브에이전트 설정, 고급 설정, runtime monitor 조작 가능 여부.

## 변경 파일 요약

- `tests/task010-ui-release-gate.test.tsx`
  - 반응형 overflow guard와 redaction release gate 추가.
- `packages/webui/src/components/setup/SubAgentReadinessPanel.tsx`
  - readiness panel/dialog/card/button wrapping과 scroll guard 보강.
- `packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx`
  - list/detail/runtime monitor wrapping, scroll guard, editor remount reset 정리.
- `packages/webui/src/components/topology/ExecutorWorkspaceShell.tsx`
  - narrow width toolbar/button/recommended executor wrapping 보강.
- `packages/webui/src/components/topology/ExecutorInspector.tsx`
  - inspector text/input/badge overflow guard 보강.
- `packages/webui/src/lib/advanced-sub-agent-settings.ts`
  - credential URL, raw screenshot binary 등 redaction 강화.
- `packages/core/src/orchestration/sub-session-runner.ts`
  - handoff data exchange provenance를 memory isolation validator가 인식하는 opaque ref로 저장.
- `tests/legacy-routing-static-audit.test.ts`
  - compatibility boundary로 남은 `single_nobie` 허용 경로 명시.
- `.tasks/architecture-cleanup-inventory.md`
  - cleanup inventory와 compatibility boundary 기록.
- `packages/core/src/**/*.js`, `packages/core/src/**/*.d.ts`, `packages/core/src/**/*.map`
  - `pnpm run core:sync-src-artifacts` 결과로 TypeScript source와 동기화.

## 남은 위험과 후속 작업

- [ ] `pnpm run lint`가 저장소 전역에서 실패한다. 별도 태스크로 Biome include/exclude 정책 또는 생성물/빌드 산출물 제외 정책을 정리해야 한다.
- [ ] 실제 브라우저 수동 viewport smoke를 아직 수행하지 않았다.
- [ ] Vite chunk size warning은 release blocker는 아니지만, WebUI 번들 분리가 필요한지 후속 성능 태스크에서 검토할 수 있다.
- [ ] React Router SSR warning은 기존 webui architecture gate에서 반복 출력된다. 테스트 실패는 아니지만 SSR render test 환경에서 client-only router wrapper 정리가 가능하다.

## 완료 조건

- [x] 쉬운 설정, 토폴로지, 고급 설정, runtime monitor가 overflow guard를 갖는다.
- [x] 사용자-facing 화면은 agent 이름/별명을 사용하고 internal id를 기본 노출하지 않는다.
- [x] secret/raw payload가 UI와 trace에 노출되지 않도록 redaction gate를 추가했다.
- [x] architecture gate, typecheck, build, 관련 테스트가 실행되었다.
- [x] 실행하지 못한 검증은 이유와 남은 위험이 기록되었다.
- [x] 전체 UI 개선 작업을 자동 release gate 기준으로 release 가능한 상태로 판단할 근거가 있다.