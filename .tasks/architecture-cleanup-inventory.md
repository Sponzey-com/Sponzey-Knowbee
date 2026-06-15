# Architecture Cleanup Inventory

이 문서는 architecture cleanup gate가 참조하는 source-of-truth inventory이다. 목적은 cleanup 과정에서 남겨도 되는 compatibility 경계와 제거해야 하는 legacy 경계를 분리하는 것이다.

## Compatibility Boundaries

- `packages/core/src/contracts/*`: 외부 저장 형식, release package, 오래된 fixture를 읽기 위한 compatibility 타입을 둘 수 있다.
- `packages/core/src/config/*`: 기존 설정 파일을 읽고 새 runtime 계약으로 변환하는 bootstrap compatibility를 둘 수 있다.
- `packages/core/src/orchestration/mode*`: orchestration mode snapshot을 만들 때 legacy `single_nobie` 값을 읽거나 표시할 수 있다.
- `packages/core/src/api/routes/settings*`: 설정 API의 migration, import, export, setup draft compatibility를 둘 수 있다.
- `packages/core/src/control-plane/*`: setup draft를 읽고 저장하는 settings/control-plane compatibility를 둘 수 있다.
- `packages/core/src/ui/sub-agent-settings*`: 설정 화면 view model에서 단일 노비 상태를 사용자-facing 상태로 표현할 수 있다.
- `packages/core/src/release/*`: release gate와 rollback evidence에서 legacy mode를 진단값으로 확인할 수 있다.

## Cleanup Boundaries

- 실행 의사결정, planner, execution harness, intake bridge는 legacy routing fallback을 새 실행 경로로 사용하면 안 된다.
- 기본 topology UI는 EnterpriseTopology V1 편집 화면이나 raw contract를 사용자 기본 흐름에 노출하면 안 된다.
- child result는 parent review와 aggregation을 거치기 전 최종 사용자 채널 답변으로 표시하면 안 된다.
- 사용자-facing 화면은 agent id, node id, run id 같은 내부 id를 기본 표시명으로 사용하면 안 된다.

## Verification

- `pnpm run test:architecture:static`
- `pnpm run test:architecture:runtime`
- `pnpm run test:architecture:webui`
- `pnpm run test:architecture:prompts`
- `pnpm run test:architecture:generated`
