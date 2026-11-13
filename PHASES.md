# Charger phases and schedule indicator

Updated 13 November 2026. Use Octopus `devices.status { current currentState
isSuspended }` for operational phase. Kia report age and provider read failures
remain separate. Never infer completion or disconnection from an empty plan.

## Mapping

| Provider state | Watch label | Meaning |
| --- | --- | --- |
| SMART_CONTROL_IN_PROGRESS | Carga inteligente | Smart charging is scheduled or occurring; not proof of current power. |
| SMART_CONTROL_CAPABLE | Control listo | Connected control readiness; may be seen after a session or cancelled boost. Not proof of target delivered. |
| SMART_CONTROL_NOT_AVAILABLE | No conectado en casa | Smart control unavailable, such as away/unplugged. |
| LOST_CONNECTION | Sin conexión V2C | Device connectivity loss; distinct from an unplugged car. |
| Suspended / SMART_CONTROL_OFF | Control en pausa | Smart control disabled/suspended. |
| BOOSTING | Carga rápida | Manual immediate charging, outside the smart timetable; this label does not imply DC charging. |
| Setup/auth/test pending states | Preparando control | Device is not ready for normal smart control. |
| Authentication/test failure or retired | Revisa el acceso V2C / Dispositivo retirado | Needs attention in Octopus. |
| Missing/unrecognized state | Estado desconocido | Readiness, completion and connection are unknown. |
| Failed device read | Estado sin actualizar | Do not present a previous phase as freshly verified. |

For disconnected, paused, offline and setup/error phases, plan guidance replaces
provider/cached windows rather than advertising an actionable plan. A ready device
can retain future windows explicitly returned by the provider. Optional plan-query
errors remain visible where the phase does not already explain unavailability.

## Connection requirements by action

**Disconnected/away permits saving 80%/100% preferences.** The dashboard retains
additional charge/time and the plan footer says **Conecta para cargar**. Connect
later for charging; saving does not imply a dispatch has been published.

**Forzar carga ahora requires connected control readiness.** Accept only LIVE,
not suspended, phase smart-control/ready and an Octopus-supported boost capability.
Recheck after Sí. Already BOOSTING prevents a duplicate start. See [BOOST.md](BOOST.md).

During BOOSTING the third watch action becomes **Detener carga**. Its default-No
confirmation requires an active supported boost before and after Sí. CANCEL is
sent once; same-device LIVE, unsuspended smart-control/ready read-back verifies
the stop. This restores the smart timetable without disabling future charging.
Paused, offline, setup, error and unknown phases block current watch writes.

## Green clock / ON

Show only after a successful Octopus read with SMART_CONTROL_IN_PROGRESS and at
least one valid ongoing/upcoming SMART dispatch. It means **verified smart
schedule**, not charging power or simply stored preferences.

Hide it during boost, disconnected/ready/paused/offline/error phases, failed plan
reads, or after the evidence expires. Expiry is the earlier of six minutes after
the Octopus read and the final valid dispatch end. Refresh normally runs every
five minutes; the watch minute tick can clear the badge up to one minute late.
A Kia failure or old report alone does not change the Octopus schedule indicator.

## Evidence

User screenshots distinguish “Control inteligente listo” after charging from
“No conectado en casa”. The initial ready-state mapping used documented enum
semantics and fixtures rather than a historical API record of those screenshots.

On **13 November**, a verified real start transitioned smart control → BOOSTING.
A verified CANCEL transitioned BOOSTING → SMART_CONTROL_CAPABLE, not suspended.
The user confirmed actual charging both started and stopped. Saved +21% / 11:00
preferences remained unchanged. This supports the tested transitions without
making SMART_CONTROL_CAPABLE a general “battery full” signal.

Recent [boost emulator result](docs/screenshots/boost-active.png) uses
synthetic data. The [selected gallery](docs/screenshots/index.html) retains representative current
screens; obsolete baseline captures have been removed.

Source consulted: [SmartFlexDeviceState](https://developer.oees-kraken.energy/graphql/reference/enums/smartflexdevicestate/).
