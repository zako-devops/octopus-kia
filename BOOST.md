# Start and stop immediate charging

Updated 13 November 2026. The third row in the watch's action menu changes with
Octopus state. Both confirmations default to **No**. No/Back cancels without
sending; Sí rechecks the current state/capability, sends once and reads back.

| Provider state | Menu action | Confirmation | Verified result |
| --- | --- | --- | --- |
| Connected smart control / ready | Forzar carga ahora | ¿Estás seguro? | BOOSTING on the same account/device. |
| BOOSTING | Detener carga | ¿Detener carga? | LIVE, unsuspended SMART_CONTROL_CAPABLE or SMART_CONTROL_IN_PROGRESS on the same account/device. |

Starting bypasses the smart timetable up to the car's own charging limit. The
confirmation says **Hasta el límite del coche / Fuera del plan horario**. It does
not set an 80%/100% target, modify the Kia AC limit or replace the saved amount/time.

Stopping cancels only manual boost and returns control to the smart schedule.
The confirmation says **Volver al plan horario / Sin cambiar preferencias**.
Future scheduled charging remains enabled; a smart dispatch may still legitimately
charge the car. Stopping boost is not a general “disable all charging” command.

## Preconditions and stale displays

Require a successful fresh Octopus read and exactly one account/matching V2C.
For start, require lifecycle LIVE, explicitly not suspended, and smart-control or
ready phase. For stop, require LIVE, not suspended and active BOOSTING. Check the
corresponding FlexTriggerBoostChargeCapability or FlexCancelBoostChargeCapability
with FLEX_SERVICE support. Missing capabilities and third-party redirects are
not sufficient. Recheck everything after Sí.

Disconnected/away, lost connection, setup, suspended, retired/auth-error and
unknown phases cannot start a boost. Already BOOSTING blocks another start.
A stop whose boost has already ended or whose car disconnects is blocked before
sending; never change that pending stop into a start. An outdated menu may first
show a blocked result and then the newly read phase/action.

These operations do not need a successful Kia read: they leave the car limit and
saved target unchanged. By contrast, 80%/100% preferences calculate from Kia SOC
and may be stored before plugging in. See [CONTROL.md](CONTROL.md).

## API and duplicate handling

Use `updateBoostCharge(input: {deviceId, action: BOOST|CANCEL}) { id }`. Do not send
endTime or targetSocPercentage for these actions. The older triggerBoostCharge
is deprecated. IDs, credentials and tokens remain on the phone.

Start, stop and preferences share the persistent `ov2c.control.pending` fence.
Persist `{kind: "boost"}` or `{kind: "stop"}` before sending. Never retry a
mutation automatically, including on auth failure or lost response. Duplicate
button presses cannot send again. A returned ID is insufficient: re-read and
check the expected phase on the same device/account.

Unknown outcomes remain fenced across restart and block all control writes.
Recovery reads the currently selected device rather than resending. It reports
observed active boost or restored smart control, without attributing a state
change to the original uncertain command. Missing/mismatched reads remain
uncertain. Manual recovery for a permanently unresolved operation is still pending.
Known KT-CT-4357/4356 start refusals and KT-CT-4354 cancel refusals are definite
rejections; other server errors remain uncertain.

BOOSTING is provider control state, not proof of electrical power. The green
smart-schedule ON badge is hidden during boost and can return after cancellation
only if valid SMART dispatches are again verified. Saved preferences stay visible.

## Validation

**91 Node 22 tests passed** on 13 November. Coverage includes disconnected and
unsupported starts, active-only stops, rechecking after confirmation, No/Back,
changed identity, duplicate presses, HTTP refusal/auth without mutation retry,
persistent uncertainty and unchanged saved preferences. The offline adapter →
real live client/controller tests exercise start followed by stop.

The emulator's start → BOOSTING → Detener carga → default No cancellation → Sí
→ restored smart-control flow was exercised. See [stop menu](docs/screenshots/stop-menu.png),
[confirmation](docs/screenshots/stop-confirmation.png),
[result](docs/screenshots/stop-result.png) and
[dashboard](docs/screenshots/smart-control-restored.png). These are synthetic, not real
charging commands. The latest build was installed on the physical watch on 13 November; validation
of its physical-watch interactions is pending.

### Real start and stop trials

On 13 November, with explicit user authorization:

- **13:11 Madrid:** one BOOST through the app's live/controller/HTTP modules;
  smart control → BOOSTING; same-device read-back verified it. The user confirmed
  actual charging started. [Start receipt](docs/validation/boost-start-2026-11-13.json).
- **13:15 Madrid:** one CANCEL through a separate API helper; BOOSTING →
  SMART_CONTROL_CAPABLE, not suspended. The user confirmed charging stopped.
  [Stop receipt](docs/validation/boost-stop-2026-11-13.json).

Both commands preserved all preferences, including **+21%, ready 11:00**. The real
stop trial preceded the watch stop-menu implementation. The new watch stop flow
is tested offline; no additional real command was sent merely to test the UI.

## Live helpers

`scripts/trial_boost.cjs` is read-only unless --start is passed.
`scripts/trial_stop_boost.py` is read-only unless --send is passed. Mutation flags
require explicit authorization; completed trials are not standing approval.
The stop helper persists a pre-send receipt and refuses a second send once an
attempt exists. Never delete it simply to retry. Helpers retain sanitized receipts
and separate local fencing; credentials/JWTs/IDs stay in memory. They do not read
or clear the phone's own fence. See [DEVELOPMENT.md](DEVELOPMENT.md).

Official documentation consulted and live schema checked on 13 November:

- [updateBoostCharge](https://developer.oees-kraken.energy/graphql/reference/mutations/updateboostcharge/)
- [UpdateBoostChargeInput](https://developer.oees-kraken.energy/graphql/reference/input-objects/updateboostchargeinput/)
- [BOOST / CANCEL actions](https://developer.oees-kraken.energy/graphql/reference/enums/updateboostchargeaction/)
- [Provider states](https://developer.oees-kraken.energy/graphql/reference/enums/smartflexdevicestate/)
- [Start capability](https://developer.oees-kraken.energy/graphql/reference/objects/flextriggerboostchargecapability/)
- [Cancel capability](https://developer.oees-kraken.energy/graphql/reference/objects/flexcancelboostchargecapability/)
- [Capability support](https://developer.oees-kraken.energy/graphql/reference/interfaces/flexcapabilitysupportinterface/)
