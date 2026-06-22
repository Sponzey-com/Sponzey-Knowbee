# Sponzey Knowbee

[English](./README.md) | [한국어](./README.ko.md)

<p align="center">
  <img src="./resource/knowbee-1-512.png" alt="Knowbee" width="220" />
</p>

Sponzey Knowbee is a local-first personal AI assistant that runs on the user's computer. Inside the product, the assistant is called `Knowbee`.

Knowbee is not meant to be only a chat bot. It receives a request, understands the intent, chooses an execution path, uses local tools and connected services, tracks progress, delivers the result, and decides whether the work is actually complete.

## Current Direction

The work from `.tasks/phase001` through `.tasks/phase016` has moved Knowbee toward a task-centric orchestration product:

- setup and onboarding are handled in the WebUI
- one configured AI connection is used as the main interpretation and execution brain
- MCP servers, Skills, Telegram, Slack, and Yeonjang are connected as capabilities
- user requests become tracked runs, task cards, attempts, deliveries, and completion reviews
- prompts are split into role-specific source files under `prompts/`
- memory, retrieval evidence, diagnostics, and task history are stored by purpose
- schedules, delivery receipts, audit events, and rollback evidence are treated as structured records
- topology and setup screens use visual scenes so users can see what is connected
- sub-agents and teams are represented as explicit contracts, hierarchy, permissions, memory scopes, and delegation sessions

The current product should be understood as `Knowbee + local gateway + WebUI + optional channels + optional Yeonjang extension + optional sub-agent/team orchestration`.

## What Knowbee Can Do

### WebUI and Setup

- guide the user through initial setup
- configure one active AI backend
- register MCP servers and Skills
- configure communication channels
- show runtime status, diagnostics, and advanced settings
- visualize setup, capability, and topology state

### AI and Prompt Runtime

- use OpenAI, Anthropic, Gemini, Ollama, OpenAI-compatible endpoints, or a local/remote inference server
- assemble prompts from separate source files instead of one large prompt
- keep prompt source id, version, and checksum evidence for each run
- default responses to the user's language

### Task Execution

- receive requests from WebUI and supported channels
- create structured runs and task cards
- separate intake, execution, recovery, delivery, and completion review
- show progress, failures, recovery attempts, and final state
- avoid duplicate final delivery through message ledger and delivery receipt logic

### Local Control Through Yeonjang

Yeonjang is the extension that lets Knowbee reach the user's device, screen, keyboard, mouse, camera, and local command surface.

Currently these capabilities require Yeonjang to be running:

- shell command execution
- app launch
- screen and camera capture
- keyboard input and shortcuts
- mouse movement, click, scroll, and button actions

The most validated operating system is `macOS`. Windows and Linux paths exist by feature area, but still need more environment-specific validation.

### Channels

- WebUI chat is available.
- Telegram integration is implemented.
- Slack integration has implementation work in place, with continued hardening around delivery, approval, and smoke verification.

### Schedules and Retrieval

- one-time and recurring schedules are modeled separately from normal user runs
- schedule identity, payload, delivery, and migration use structured keys rather than natural-language comparison
- web retrieval uses source candidates, evidence, verification, cache, degraded mode, and strict completion checks
- vector search is a candidate provider only, not the final decision maker

### Sub-Agents and Teams

Sub-agent support is being built around explicit contracts rather than hidden extra bots.

- `Knowbee` is the fixed top-level coordinator.
- sub-agents have unique nicknames, roles, model/capability summaries, permissions, and memory scopes
- hierarchy is a tree: an agent can delegate only to direct children
- teams are planning groups owned by an agent, not independent executors
- team members are drawn from the owner's direct child agents
- delegation creates sub-sessions, data exchange packages, result reports, review verdicts, and monitoring events
- final user delivery remains owned by Knowbee for user-started requests

## Project Layout

- `packages/core`
  - gateway, contracts, orchestration, runs, memory, schedule, channels, API, tools, MCP, and release logic
- `packages/cli`
  - daemon and local command entry points
- `packages/webui`
  - setup, settings, run monitor, topology, task cards, and diagnostics UI
- `prompts`
  - prompt source files used to assemble role-specific runtime prompts
- `Yeonjang`
  - local extension runtime for device control
- `.tasks`
  - phase plans and implementation notes
- `docs`
  - operational runbooks and release notes

## Quick Start

### Requirements

- macOS is the currently supported primary environment
- Node.js `22+`
- `corepack` enabled
- `pnpm@8.10.2`
- Rust / Cargo if running Yeonjang from source

### Step 1. Prepare Node.js 22

```bash
nvm install 22
nvm use 22
node -v
```

You should see a `v22.x.x` version.

If you are on Windows and do not use `nvm`, install Node.js 22 first, open a new terminal, and verify with:

```bash
node -v
```

### Step 2. Enable pnpm with Corepack

```bash
corepack enable
corepack prepare pnpm@8.10.2 --activate
pnpm -v
```

If `corepack` is missing, your Node installation is too old or incomplete. Reinstall Node.js 22 first.

This repository uses a `pnpm` workspace. Use `pnpm install`, not `npm install`.

### Step 3. Download the repository

If the GitHub repository has already been renamed to `Sponzey-Knowbee`, use:

```bash
git clone https://github.com/Sponzey-com/Sponzey-Knowbee.git
cd Sponzey-Knowbee
```

If the remote repository has not been renamed yet, use the old URL and then continue with the same commands:

```bash
git clone https://github.com/Sponzey-com/Sponzey-Nobie.git
cd Sponzey-Nobie
```

### Step 4. Install dependencies

Run this once after cloning the repository:

```bash
pnpm install
```

This installs every workspace package at once:

- `@knowbee/core`
- `@knowbee/cli`
- `@knowbee/webui`
- `@sponzey/knowbee`

For CI or a strict reproducible install, use:

```bash
pnpm install --frozen-lockfile
```

### Step 5. Build Knowbee

```bash
pnpm -r build
```

`pnpm -r build` builds every package in the workspace. `pnpm build` also works from the repository root because it is wired to the same recursive build.

### Step 6. Start Knowbee locally

Start the local Gateway and WebUI on macOS, Linux, or a bash-compatible environment:

```bash
bash scripts/knowbee-start.sh
```

This is the easiest way to run Knowbee after installation. It starts:

- the local Gateway
- the WebUI
- the Knowbee runtime entrypoint used by the local stack

### Step 7. Open Knowbee in your browser

After `knowbee-start.sh` finishes, open:

- WebUI: `http://127.0.0.1:4220`
- Gateway: `http://127.0.0.1:18888`

For most users, the WebUI address is the one to open first.

### Quick install and start

After Node.js 22 and pnpm are ready, the full first-run flow is:

```bash
git clone https://github.com/Sponzey-com/Sponzey-Knowbee.git
cd Sponzey-Knowbee
pnpm install
pnpm -r build
bash scripts/knowbee-start.sh
```

If the repository is still named `Sponzey-Nobie` on GitHub, replace the first two lines with:

```bash
git clone https://github.com/Sponzey-com/Sponzey-Nobie.git
cd Sponzey-Nobie
```

### Step 8. Useful local control commands

If services are already running and you want a clean restart:

```bash
bash scripts/knowbee-start.sh --restart
```

Check current status:

```bash
bash scripts/status-local.sh
```

Stop local services:

```bash
bash scripts/stop-local.sh
```

Notes:

- `knowbee-start.sh` builds the Gateway runtime packages it needs before launch.
- If Gateway or WebUI is already running, `knowbee-start.sh` can stop and start them again.
- Use `--restart` when you want the restart step to be explicit in logs and workflow.
- Windows-native batch entry points are currently provided for Yeonjang. The local Gateway/WebUI flow uses shell scripts, so use a bash-compatible shell on Windows.

### Optional: run the Knowbee CLI directly

If you want to inspect the CLI entrypoint after building:

```bash
node packages/knowbee/bin/knowbee.js --help
node packages/knowbee/bin/knowbee.js status
```

If you want to start the backend entrypoint directly without the helper script:

```bash
node packages/knowbee/bin/knowbee.js serve
```

For normal local development and setup, prefer `bash scripts/knowbee-start.sh` because it manages the local WebUI and service lifecycle together.

### Run Yeonjang

Compile Yeonjang for macOS:

```bash
bash scripts/build-yeonjang-macos.sh
```

This produces the macOS app bundle and helper binaries under `Yeonjang/target/...`.
The script expects Rust / Cargo and Xcode command line tools for `xcrun swiftc`.

Compile Yeonjang for Windows:

```bat
scripts\build-yeonjang-windows.bat
```

This produces the Windows executable under `Yeonjang\target\...` or `%LOCALAPPDATA%\Yeonjang\target`.
The script expects Rust / Cargo and will use LLVM `clang` automatically if it is installed.

For normal macOS local control:

```bash
bash scripts/start-yeonjang-macos.sh
```

Yeonjang starts in tray-first mode for `desktop_interactive`: the main window stays hidden at launch, the tray icon remains available, and closing the window hides it back to the tray instead of exiting.

For a clean macOS restart:

```bash
bash scripts/start-yeonjang-macos.sh --restart
```

To stop the macOS Yeonjang GUI without restarting:

```bash
bash scripts/stop-yeonjang-macos.sh
```

For Windows local control:

```bat
scripts\start-yeonjang-windows.bat
scripts\start-yeonjang-windows.bat --restart
scripts\stop-yeonjang-windows.bat
```

For Linux local control:

```bash
bash scripts/start-yeonjang-linux.sh
bash scripts/start-yeonjang-linux.sh --restart
bash scripts/stop-yeonjang-linux.sh
```

For Linux headless managed control:

```bash
bash scripts/start-yeonjang-linux-headless.sh
bash scripts/start-yeonjang-linux-headless.sh --restart
bash scripts/stop-yeonjang-linux-headless.sh
```

For source-based development:

```bash
cargo run --manifest-path Yeonjang/Cargo.toml
```

Notes:

- `start-yeonjang-macos.sh` checks and rebuilds the macOS app bundle before launch.
- `start-yeonjang-windows.bat` owns the Windows start and restart flow, and uses the build script only to prepare a missing binary.
- `start-yeonjang-linux.sh` checks and rebuilds the Linux desktop binary before launch.
- `start-yeonjang-linux-headless.sh` runs the `headless_managed` profile through the managed MQTT entrypoint with no tray/window expectation.
- `build-yeonjang-windows.bat` and `build-yeonjang-linux.sh` stay focused on build output preparation.
- Yeonjang support profiles are:
  - `desktop_interactive`: tray-first desktop app
  - `desktop_limited`: desktop app without tray-first guarantees
  - `headless_managed`: MQTT/runtime-only managed node
- `desktop_interactive` starts hidden to the tray. Open the window from the tray menu, and on Windows you can also reopen it with a tray double-click.
- Linux tray icon event support is limited, so Linux should be treated as tray-menu-first for reopening the window.
- Linux desktop start requires `DISPLAY` or `WAYLAND_DISPLAY`. If neither exists, use the headless managed script instead of the GUI script.
- The window close button is hide-to-tray. Use the tray menu `Quit` item when you want the process to exit.
- `Launch on Startup` writes an OS-specific autostart entry and starts Yeonjang again in the same tray-first mode.
- Use the stop script only when you want Yeonjang to remain stopped after cleanup.

In Yeonjang, the default MQTT connection is:

- Host: `127.0.0.1`
- Port: `1883`
- Node ID: `yeonjang-main`

## Verification

Common checks:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Release packaging:

```bash
pnpm run release:dry-run
pnpm run release:package
```

Release and rollback operations should follow [docs/release-runbook.md](./docs/release-runbook.md).

## Design Principles

- keep the first-run setup understandable for non-developers
- prefer one clear AI connection in the normal UI
- keep advanced diagnostics available without making the default flow heavy
- treat execution success and completion success as different things
- store important decisions as structured contracts, receipts, and events
- keep raw secrets, private memory, and internal IDs out of normal user-facing UI
- make sub-agent delegation visible and attributable without exposing unnecessary internals
