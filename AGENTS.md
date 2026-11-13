# octopus-kia

The project folder remains octopus-v2c; the app/build name is octopus-kia.
Preserve UUID and existing ov2c.* phone storage keys across the rename.
VEHICLE_MODEL is appended to AppMessage keys. Use validated Pleos sellname only,
never the private nickname or VIN, for the model-aware dashboard label.

For session continuity, read `STATUS.md` first. It records the saved handoff and
next work; verify drift-prone observations before reuse.
The user is testing the installed production build for several days. On return,
start with their feedback; do not automatically install, change charging settings
or publish. The Appstore presentation remains a local draft by user decision.

Read README.md, DESIGN.md, CONFIGURATION.md, LIVE.md, PHASES.md and DEVELOPMENT.md before changing this
independent Pebble Time 2 watchapp. Target: `emery`, 200×228 color display.
SDK 4.44 and Pebble Tool 5.1.2 were verified on 2026-11-06. This is a C watch UI
with an ES5 PebbleKit JS phone companion. Do not modify CarGlance for this app.

The app now includes a confirmed preference-write path; read CONTROL.md. The phone reads Kia battery,
Octopus relative charge preferences, constraints and planned dispatches. Up
refreshes; the companion also refreshes every five minutes while the app is open.
Only selecting Sí on a freshly validated confirmation may issue a charging write.
Use offline emulator fixtures for routine development. On 8 November the user
explicitly authorized a real charging-schedule trial in the emulator and Android
read-back verification; see STATUS.md. The user subsequently requested the latest
production build on the physical watch for a multi-day trial; it was installed on
8 November. Further physical-watch updates still require authorization.
Do not execute a real charging mutation while testing without explicit authorization.

Read BOOST.md for immediate charging. Only Forzar carga ahora requires connected
provider control readiness; normal preference updates remain allowed unplugged.
Use updateBoostCharge, never deprecated triggerBoostCharge. Recheck readiness and
FLEX_SERVICE capability after Sí; send once, verify BOOSTING on the same device.
Boost and preferences share the persistent uncertainty fence. PREPARE_BOOST is
appended to preserve existing AppMessage IDs. PREPARE_STOP_BOOST is appended too.
When BOOSTING, the third menu action becomes Detener carga. Prepare/confirm stop
requires a supported active boost; send CANCEL once and verify LIVE, unsuspended
smart control on the same device/account. It does not disable future scheduling. The user authorized one live boost
start and one cancellation on 13 November; both succeeded with physical confirmation.
Do not repeat them automatically. The helper
scripts/trial_boost.cjs is read-only unless --start is passed, which changes real
charging and requires explicit authorization. The user requested and received
the 13 November physical-watch update through the phone LAN developer connection. See STATUS.md
for its receipt; further installs and live writes still require authorization.

## Layout and checks

- `src/c/main.c`: dashboard, actions, target previews and scrollable charging plan.
- `src/pkjs/config.js`: bundled Clay Android form; automatic events stay disabled.
- `settings.js`: allowlisted phone-side configuration storage and invalidation.
- `index.js`: config events, manual/periodic refresh and queued watch delivery.
- `live.js`: API reads, independent provider results and credential-free summaries.
- `charger-state.js`: provider phase mapping and state-specific plan messages.
- `token.js`: actual JWT expiry plus a one-minute margin and coordinated renewal.
- `madrid.js`: Europe/Madrid calendar and dispatch display, independent of phone TZ.
- `planning.js`: exact percentage calculations and dynamic limits, without rounding up.
- `scripts/probe_octopus.py`: separate read-only discovery helper.

Use Node 22 or newer for `node --test tests/*.test.cjs`; the default system Node 16
does not support existing structuredClone-based tests. See DEVELOPMENT.md. For offline confirmation tests build with
`python3 scripts/build_emulator.py` and install `artifacts/octopus-kia-emulator.pbw`
only in the emulator. It is visibly marked SIMULACIÓN, uses in-memory storage
and never calls a real API. Production runtime-mode.js must stay false.
The script restores any existing production PBW byte-for-byte; otherwise no
simulator PBW remains in the default build path. For the complete documentation
set, install the offline artifact and run scripts/capture_screens.py; outputs go
to ignored artifacts/screenshots. Only deliberately selected captures belong in
docs/screenshots; keep its manifest updated. Obsolete captures were removed.
For a future production build, build with
`PEBBLE_EXTRA_PATH=/tmp/pebble-compat/bin pebble build` while this session's
compatibility wrappers exist, otherwise use a compatible host. Install with the
same environment and `pebble install build/octopus-kia.pbw --emulator emery --vnc`.
Always specify the PBW path; the legacy folder name differs from the new artifact.
Capture and inspect
screenshots under ignored `artifacts/` and collect bounded logs. Physical-watch
installation and publication require authorization. Do not wipe SDK/emulator state.

## Data and credentials

Kia client ID/secret and Octopus email/password live in phone `localStorage`.
The parent `kia.properties` and `octopus.properties` are local test inputs only.
Read values in memory. Tokens may be cached only in the phone's normal app store.
Never commit, print, export to artifacts or send credentials/JWTs to the watch.
Keep account/device identifiers and VINs in memory; omit them from watch messages,
retained responses and logs. AppMessage carries operational summaries and flags
only. Tests must use synthetic credentials and identifiers.

The user explicitly accepts the latest reported Kia SOC while parked, even if
the vehicle timestamp is hours old. Display its timestamp, but do not block
confirmation/sending based on age. Still fetch the latest available SOC before
confirmation and before writing; changed SOC requires reconfirmation. Missing or
invalid/future timestamps and provider errors remain distinct from old-but-valid data.
Preserve last known values on transient failures but identify the failing source.
Disconnected/away (`SMART_CONTROL_NOT_AVAILABLE`, phase 3) must allow confirmed
preference updates before plugging in. Saving preferences does not imply an active
dispatch or ON badge; keep other phase/error checks and AC-limit validation.
Before any 80%/100% submission, read and recheck Kia AC target
`charge.targetStateOfCharge.standard`; reject targets above it or an unknown
limit. DC/quick is not the limit for the V2C AC charger. No documented personal
Pleos setter was found: never silently raise the car limit or invent an endpoint.
Do not silently select a vehicle/account/device when there are multiple matches.
Authentication rejections receive one retry; avoid unbounded retry loops.

Octopus targets are additional battery percentage points. Compute
`max(0, target - currentSoc)` for 80 and 100 and validate the exact value against
live metadata. The device advertised step 1%, minimum 10%, maximum 100% on the
initial check; do not hardcode either 1% or the Android UI's 5% increment. A value
below the minimum must not become a larger request that exceeds the target.
`setDevicePreferences` is implemented behind explicit confirmation and verified
using offline responses and an authorized real +16% update.
For this V2C account the API rejects per-day and weekday-only variation; send a
uniform daily amount for all seven days, in Monday–Sunday order. Keep the common
ready-by time and any configured minimums; block incompatible daily times/minimums
rather than overwriting them. The product exposes one percentage and one ready-by
time, matching the Android screenshots; never present weekday/weekend scheduling
as a user option. The seven API entries are an implementation detail. Omit an unconfigured
minimum on the wire: explicit min:null is rejected with KT-CT-4321. Never automatically retry a preference mutation; persist an uncertainty
fence and verify by read-back. See CONTROL.md for limitations and recovery.

The user chose legacy `obtainKrakenToken(email,password)` for this prototype and
will contact Octopus about OAuth later. Keep authentication replaceable. Do not
repeat an OAuth approval discussion or assume a fixed one-hour token lifetime.

Do not infer charge completion or physical disconnection from an empty plan.
Use provider status. `SMART_CONTROL_CAPABLE` means control ready, not proof of
percentage delivered. `SMART_CONTROL_NOT_AVAILABLE` covers away/unplugged;
`LOST_CONNECTION` is a separate device connectivity problem. Preserve selected
charge amount and ready-by time when the phase changes. See PHASES.md.

## Repository hygiene

Builds, dependencies, SDK locks, credentials and .local/ operational state are
ignored. Preserve .local/ trial receipts/fences; never remove them to retry a live
command. Public sanitized records in docs/validation are evidence, not guards.
Use CHANGELOG.md for prior milestones; duplicated documentation archives were
removed. Do not publish the local Appstore draft or push a repository without scope.

## Public source repository

The user authorized public GitHub publication as zako-devops/octopus-kia with
MIT licensing on 13 November 2026. Preserve third-party attribution/exclusions.
This authorization does not change the local-only Pebble Appstore decision.
