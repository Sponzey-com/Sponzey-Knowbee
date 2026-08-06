# Installer application

The staged bundle launches `apply.mjs` with its private Node runtime. The composition root reads
the host/environment once, parses the bounded native-verifier receipt, and calls
`applyInstallerCandidate` with explicit install, installer-state, launcher, and application-state
roots.

`install-application.mjs` is the filesystem adapter behind the canonical installer transaction
reducer. It copies only regular files into an inactive version, verifies the bundle inventory,
atomically switches the POSIX `current` and launcher links, and persists every revision. It never
writes the separate `~/.knowbee` application state root. Activation returns a typed
`service_registration` continuation; it is not yet a committed installation.

On macOS/Linux, `posix-service.mjs` renders a closed LaunchAgent/systemd-user definition with the
exact private launcher, state directory and release snapshot. It uses `plutil` plus
`launchctl bootstrap/bootout/kickstart/print`, or `systemctl --user` without linger, and commits
only after active command/owner and local health identity post-checks. Failure persists
failed→rolling_back→rolled_back and restores the previous pointer/service.

On Windows, `windows-service.mjs` uses a symlink-free atomic `current-version` pointer and stable
batch launcher. Its static ScheduledTasks helper is invoked with `-File` and closed argv only,
never a policy bypass or encoded command, and reads back the exact private Node action, working
directory, interactive limited principal and running state before the shared service/health
transaction commits. Rollback unregisters the candidate task and restores the previous pointer
and exact task definition.

`lifecycle.mjs` owns the closed `uninstall [--purge]` use case, install-root ownership marker and
exclusive lifecycle lock. It preflights every deletion target, stops the exact per-user service,
removes only installer-owned runtime/launcher/receipts, and preserves application state unless
purge is explicit. `uninstall.mjs` composes OS-specific service removal from one startup snapshot;
the Windows launcher copies the private Node and lifecycle files to a temporary directory so the
active version has no executable lock when deletion begins.

`user-environment.mjs` owns idempotent per-user PATH configuration and exact rollback; POSIX edits
one bounded regular login profile while Windows uses a static user-registry helper without
elevation or policy changes. `browser.mjs` opens only the fixed loopback WebUI after health, with a
`gio` fallback after `xdg-open` failure. Optional Yeonjang is disabled by default; selection
requires exact target/package inventory, requests no permission and defers launch until
authenticated initialization. The active effect profile has its own receipt, so same-version
reruns converge changed service/PATH/browser choices.

The release layout copies the tested transaction store and generated reducer beside the
application so the clean machine does not need a workspace checkout or system Node.
