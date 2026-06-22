# source.md

## 역할

- `scripts`는 개발, 로컬 실행, 패키징 보조 스크립트를 담습니다.

## 현재 중심 스크립트

- Knowbee 로컬 실행/정지 스크립트
- macOS용 Yeonjang 빌드/시작/종료 스크립트
- Linux용 Yeonjang 빌드/시작/종료 스크립트
- Linux용 Yeonjang headless managed 시작/종료 스크립트
- Windows용 Yeonjang 빌드/시작/종료 배치 스크립트

## 메모

- 이 스크립트들은 운영 편의 도구이지 제품의 핵심 런타임 자체는 아닙니다.
- 시작 방식이 바뀌면 실제 패키지 진입점과 스크립트가 서로 어긋나지 않게 맞춰야 합니다.
- Knowbee와 Yeonjang 모두 재시작 흐름은 별도 restart 스크립트보다 `start-* --restart` 진입점으로 모읍니다.
- 로컬 Gateway/WebUI 제어는 bash 스크립트를 기준으로 하고, Windows 네이티브 배치는 현재 Yeonjang runtime 관리에 집중합니다.
- Yeonjang GUI 시작 스크립트는 `desktop_interactive`를 tray-first lifecycle로 안내해야 하며, startup hidden / close-to-tray / explicit quit 원칙을 함께 표시합니다.
- Linux 스크립트는 desktop GUI 경로와 `headless_managed` 경로를 분리해서 안내해야 합니다.
- Windows 배치 스크립트는 `cargo`가 설치된 guest/실기 환경에서 바로 실행하는 용도입니다.
