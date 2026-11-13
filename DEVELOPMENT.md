# Development and verification

Run commands from the project folder, still named `octopus-v2c`. The app and
current artifacts are named **octopus-kia**. Target is **emery only**.

## Tests and environment

Use Node **22 or newer**. The system Node 16 lacks structuredClone, which the
existing tests use. Select Node 22 or newer in your shell, then run:

```bash
node --test tests/*.test.cjs
```

The last functional run on 13 November passed **91 tests**, including provider
mapping, expiry, cached SOC, AC limits, exact increments, confirmation, connected
boost, unplugged preference saving, single-shot writes and persisted uncertainty.
Documentation-only updates do not require a new SDK build or live charge test.

SDK 4.44 / Pebble Tool 5.1.2 were used. Existing host compatibility wrappers live
in `/tmp/pebble-compat/bin`; check they still exist. A newer CLI notification is
not permission to upgrade. SDK commands need access to the user's existing cache;
request that scoped access if needed rather than relocating or resetting it.

## Safe offline emulator workflow

```bash
python3 scripts/build_emulator.py
PEBBLE_EXTRA_PATH=/tmp/pebble-compat/bin pebble install artifacts/octopus-kia-emulator.pbw --emulator emery --vnc
pebble screenshot --no-open --emulator emery --vnc artifacts/emulator-review.png
```

The build script temporarily enables simulation and restores source afterward.
It also restores an existing production PBW byte-for-byte; if none existed, it
leaves the production path absent. The offline adapter uses synthetic credentials,
EV6 62%, AC limit 100%, seven +20% / 11:00 rows and in-memory tokens/preferences.
Its BOOST response changes the fixture phase to BOOSTING; CANCEL restores smart control. No real API is contacted.

Before confirming a test, verify the installed bundle is the offline artifact.
Screens are marked **SIMULACIÓN · sin cambios**. Exercise No/Back, Sí, both target
choices and both boost start/stop; inspect screenshots and bounded logs. A build alone is not
proof of emulator or physical-device behavior. Never wipe storage without scope.

`capture_screens.py` verifies installed bundle equality and simulation mode before
using buttons. It regenerates the baseline gallery through offline companion
flows and display fixtures. Full generated catalogs stay ignored and the script does not yet catalog every
boost/stop case. The small public set in docs/screenshots includes the tested
start/stop flow; update it deliberately with inspected captures and checksums.

## Production build

```bash
PEBBLE_EXTRA_PATH=/tmp/pebble-compat/bin pebble build
```

Verify `src/pkjs/runtime-mode.js` is false and inspect the compiled PBW's mode,
UUID, app name and credential exclusion. Wscript explicitly names the output
`build/octopus-kia.pbw`; generated PBWs are excluded from Git.
**Always pass the intended PBW path explicitly to install commands.**

The existing linker RWX segment warning remains. See [STATUS.md](STATUS.md) and
its build receipt for verified size/hash rather than assuming a fresh build is
identical to the installed one.

## Physical watch

A physical installation requires authorization. Recheck phone IP, same-network
reachability and Pebble Android **Use LAN developer connection** plus Dev
Connection. Per-machine phone addresses belong in ignored .local/, not public docs.
After authorization, install the explicit production PBW through the current
phone connection. SDK installation success does not prove phone configuration,
watch UI, charging behavior or long-term reliability. Keep UUID/storage keys.

## Live helpers

| Helper | Default | Explicit mutation flag |
| --- | --- | --- |
| scripts/probe_octopus.py | Authenticate/read only | None |
| scripts/trial_boost.cjs | Authenticate/read only | --start sends one real BOOST through the app modules. |
| scripts/trial_stop_boost.py | Authenticate/read only | --send cancels one real active boost. |

Do not run mutation flags without explicit authorization. Persisted uncertainty
must survive retries/restarts. The stop helper refuses a second send once its
receipt records an attempted command; verify that outcome rather than removing
its receipt. The helpers' fences are separate from phone storage. Never retain
credentials, JWTs, VINs or account/device IDs in output or artifacts.

## Local store assets

From the project root, `python3 scripts/prepare_store.py` regenerates only local
artwork, screenshot copies, manifest and preview. It does not rebuild the PBW. Generated ZIPs and old package duplicates were
removed; distribute a release PBW separately when explicitly requested.
Publication remains unauthorized. See [store/README.md](store/README.md).

## Clean source tree

Use npm ci to restore dependencies (public registry tarball and pinned integrity
in package-lock.json). Never commit node_modules, build, artifacts, SDK lockfiles,
properties files or .local/. The latter holds this workstation’s installed-release
backup and live-trial receipts/guards. Deleting it can defeat duplicate-send
protection in the local trial helpers; preserve it. The public copies under
docs/validation exclude phone IPs and are never used as operational guards.

Cleanup validation: 91 tests passed using the installed dependency before its
removal. A clean public-registry npm install was attempted separately and failed
certificate verification on this workstation. The lockfile retains the original
integrity hash. Repair local certificate trust before a fresh install/build;
do not disable TLS verification to work around it.
An offline npm-cache restore and Pebble builds subsequently succeeded for the
confirmation-icon update; this does not establish a fresh network installation.
