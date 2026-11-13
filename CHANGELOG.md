# Changelog

## Confirmation icon follow-up — 13 November 2026

Replace the middle-button back arrow with a tick on all Sí/No confirmations.
Select applies the highlighted choice, including No; actual return screens keep
the back arrow. This visual change does not alter charging or confirmation logic.
Built, checked in the offline emulator and installed on the physical watch at the
user’s request.

## 0.1.0 — local development, 13 November 2026

- Renamed the app from octopus-v2c to **octopus-kia**. Folder, UUID and existing
  phone storage keys are preserved; build output is now octopus-kia.pbw.
- Use Pleos sellname for the battery model label: EV6, with Kia fallback. Private
  nicknames and VINs are not sent to the watch.
- Allow 80%/100% preference updates before plugging in. Plug/unplug transitions
  alone do not invalidate a confirmation. Change guidance to Conecta para cargar.
- Add **Forzar carga ahora** with **¿Estás seguro?**, Sí/No defaulting to No.
  Require connected, unsuspended LIVE control and supported boost capability;
  recheck after confirmation, submit once and verify BOOSTING.
- Keep the existing amount/time and car limit when starting boost. Share the
  pending-operation fence with preference writes.
- Verified one real BOOST at 13:11 Madrid and one CANCEL at 13:15, with API
  read-back and user confirmation that charging started and stopped. Saved
  +21% / 11:00 preferences were unchanged. The watch now also exposes **Detener carga** during BOOSTING, with a default-No
  confirmation, single CANCEL and verified return to smart control.
- 91 automated tests passed; new UI and confirmation flow checked offline.
- Consolidated project documentation; later removed superseded snapshots and generated files. The latest
  production build was installed through the phone LAN developer connection on this date.
  Physical interaction/reliability validation remains pending; no Appstore publication.

## 0.1.0 — testing handoff, 8 November 2026

- Confirmed 80%/100% relative target updates with exact increment checks, Kia AC
  limit warnings, default-No confirmation and verified read-back.
- Accepted cached parked-car SOC regardless of age while displaying its timestamp.
- Real +16% / 11:00 daily update verified in the API and Android from Kia 64%.
- Added provider phase handling, native Octopus favicon, verified clock/ON badge,
  phone credential settings, token expiry handling and offline simulation.
- Captured the 57-screen documentation baseline and prepared local store artwork.
  The listing remained a draft with an English Spain-only disclaimer.
- Installed octopus-v2c on the physical watch for multi-day testing.

## Initial prototype — 6 November 2026

Read-only Pleos and Octopus discovery, dashboard, Android configuration, charging
plan display, emulator validation and workspace documentation setup. The milestones above summarize the earlier development work.

## Repository cleanup — 13 November 2026

Removed old captures, diagnostic logs/ZIPs, historical documentation duplicates,
generated build/dependency output and the obsolete phase-capture helper. Nine
selected screenshots and sanitized validation records are maintained under docs/.
Installed-release backup and live-trial guard state remain local and ignored.
The dependency lockfile uses the public npm tarball URL with unchanged integrity.
No GitHub repository was created or pushed by this cleanup.

## GitHub source publication — 13 November 2026

The user authorized public source publication as zako-devops/octopus-kia and
selected MIT. Added LICENSE, package metadata and third-party notices. Credentials,
local operational records and generated builds remain excluded. The Pebble
Appstore presentation remains a local draft.
