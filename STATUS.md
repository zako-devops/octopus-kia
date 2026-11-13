# Current status — 13 November 2026

Read this handoff and [AGENTS.md](AGENTS.md) before resuming. The latest
**octopus-kia 0.1.0** build was installed successfully on the physical watch on
13 November at 17:58 Madrid. New watch interactions and long-term reliability
still need user feedback. No live write, reinstall or publication follows
from this handoff automatically.

## Installed confirmation icon update

The middle-button back arrow is replaced with a **tick** on 80%, 100%, boost-start
and boost-stop confirmations. Select still applies the highlighted Sí/No choice;
actual return screens retain their back arrow. Production build and all four
screens were checked in the offline emulator; no real charging command was sent.
This update was **installed successfully on the watch at the user’s request**.
The [new installation receipt](docs/validation/confirmation-icon-install-2026-11-13.json)
confirms the same production hash; physical UI validation remains with the user. [New build verification](docs/validation/confirmation-icon-build-2026-11-13.json)
records its hash. Selected start/stop images and store draft were refreshed.
Dependencies restored successfully from the local npm cache; fresh network install
certificate trust remains a separate workstation issue. The 91-test record below
predates this visual-only change; no new behavioral tests were needed.

## Installed release

- Target: Pebble Time 2 / emery, 200×228; C watch UI and ES5 phone companion.
- UUID: `d8ebdf30-61e3-4157-9e88-f5364d939733`; existing ov2c.* storage keys preserved.
- Production bundle: **754,095 bytes**, SHA-256
  `d026e0ab1e508de979be945d1070129331db1281bab9b2b3a943bbdd2ac14847`.
- [Build verification](docs/validation/confirmation-icon-build-2026-11-13.json) and
  [installation receipt](docs/validation/confirmation-icon-install-2026-11-13.json) are sanitized
  public evidence. SDK success establishes installation, not physical UI validation.
- The exact installed PBW and original receipts are backed up under ignored
  `.local/`. The current `build/octopus-kia.pbw` matches the installed visual update;
  the earlier installed release remains separately backed up. Always specify an explicit PBW path.

## Implemented behavior

Dashboard uses Pleos sellname (verified EV6), with Kia fallback, and displays
SOC, Octopus addition, ready time, phase and vehicle report timestamp.
Actions are 80%, 100%, and Forzar carga ahora / Detener carga during BOOSTING.
All confirmations default No.

- Preference updates calculate the exact addition, recheck SOC/AC limit/provider
  constraints, preserve the common daily ready time/minimum and verify saved rows.
  **Disconnected/away is allowed**; parked-car report age alone does not block it.
- Starting boost requires connected, unsuspended LIVE readiness and supported
  capability before and after Sí. Send once and verify same-device BOOSTING.
- Stopping requires an active supported boost, sends CANCEL once and verifies
  LIVE, unsuspended smart control on the same device/account. Future scheduled
  charging remains enabled. Never turn a pending stop into a start.
- All actions share a persistent uncertainty fence; never retry a mutation blindly.
  Permanent mismatch recovery UX and multiple-account/device selection remain pending.
- Reads run on launch, Up, settings save and every five minutes while open. Tokens
  use actual expiry with a one-minute margin. Legacy Octopus login is the user's
  prototype choice; OAuth is deferred. Green clock/ON requires verified SMART windows.

Details: [preferences](CONTROL.md), [start/stop](BOOST.md), [provider reads](LIVE.md),
[phases](PHASES.md), [configuration](CONFIGURATION.md), [design](DESIGN.md).

## Verified results

| Evidence | Result |
| --- | --- |
| 8 November, API and Android | Saved +16% / 11:00 daily, from reported Kia 64% → 80%. |
| 13 November, automated checks and emulator | 91 tests pass; offline start → stop, default No and verified results exercised. |
| [Start trial, 13:11 Madrid](docs/validation/boost-start-2026-11-13.json) | One BOOST; smart control → BOOSTING; user confirmed charging started. |
| [Stop trial, 13:15 Madrid](docs/validation/boost-stop-2026-11-13.json) | One CANCEL; BOOSTING → SMART_CONTROL_CAPABLE, not suspended; user confirmed charging stopped. |

Both real commands preserved all preferences, including **+21% / 11:00**. The real
stop trial preceded the watch stop menu; the new menu flow is verified offline.
The last observed provider state was control ready with boost cancelled; this
cleanup performed no new provider reads/writes. An actual 100% preference write,
final delivered SOC and physical validation of the new watch flow remain open.

## Repository cleanup

Removed obsolete generated builds/dependencies, old captures/logs/ZIPs, diagnostic
helpers and duplicated documentation history. [CHANGELOG.md](CHANGELOG.md) retains
milestones. Nine selected current emulator captures and checksums live under
[docs/screenshots](docs/screenshots/README.md). Sanitized receipts are under
[docs/validation](docs/validation/README.md); no public links depend on ignored output.

Ignored `.local/` preserves the installed release, original install metadata and
live-trial guard state. Do not delete those records to retry a command. The trial
helpers now store local receipts/fences there, away from disposable artifacts/.
Parent properties files and SDK/phone storage were not changed.

The store preview uses five selected current images and remains a **local draft**;
publication_authorized is false for the Appstore. The public GitHub source
repository is published at https://github.com/zako-devops/octopus-kia with the
MIT license and main as its default branch. GitHub identity, public visibility,
license detection and remote commit were verified. Initial publication contains
81 audited files; credentials, local records and generated output are excluded.
All 91 tests passed locally before publication. GitHub publication does not
authorize Appstore upload.
The cleanup uses a public npm tarball URL with the existing lockfile integrity.
The source-to-publish check found 77 files (about 342 KiB); exact credential,
ignore-rule and screenshot/store checksum checks passed. All 91 tests passed
before dependencies were removed. A fresh public npm install was attempted in
a temporary directory but blocked by this machine's certificate trust; TLS
verification was not disabled. Resolve that environment issue before a clean build.

## Next session

1. Resume from user feedback on the installed watch; do not reinstall automatically.
2. Validate physical start/stop interactions only when requested. Completed API
   trials are not standing authorization for another real command.
3. Improve permanent uncertainty recovery and multiple-account/device selection.
4. Use [DEVELOPMENT.md](DEVELOPMENT.md) for Node 22+ tests and offline builds.
   SDK 4.44 / tool 5.1.2 were used; host compatibility wrappers are temporary.
5. GitHub work uses workspace account zako-devops and ../scripts/github. A push
   or publication still needs scope from the user. Store assets remain local.
