# Confirmed 80% / 100% preferences

Updated 13 November 2026. This guide covers saving a charge target. Immediate
charging has a separate connection requirement and command; see [BOOST.md](BOOST.md).

## Watch flow

Select → 80% or 100% → **¿Quieres enviar la nueva configuración?** → **Sí / No**.
The summary shows reported SOC → target, the exact additional percentage and
ready-by time. **No is selected by default.** Up selects Sí, Down selects No;
Select activates the choice. No/Back returns to actions without sending.

The phone reads both providers to prepare, then reads again after Sí. Changes to
SOC, AC limit, provider constraints, account/device, settings generation or stored
schedules require a new confirmation. A proposal older than one minute also
requires confirmation again. Plug/unplug transitions alone do not invalidate an
otherwise identical preference proposal.

## Exact calculation and preconditions

Calculate `max(0, target − latest reported Kia SOC)` additional percentage points.
Do not silently round, send zero, or increase a sub-minimum amount. Examples with
an advertised minimum of 10 and step 1:

| Reported SOC | Target | Result |
| --- | --- | --- |
| 64% | 80% | Save +16%, if all other checks pass. |
| 62% | 100% | Save +38%, if the Kia AC limit is 100%. |
| 76% | 80% | Block +4% as below minimum; do not request +10%. |
| 80% or higher | 80% | Already reached; leave existing preferences unchanged. |

Fetch current provider metadata; do not hardcode those example constraints. The
Android UI's 5-point increment does not define the API step. A real +16% update
was accepted on 8 November, proving at least that non-5% value is writable.

A parked car's latest valid report remains usable even if hours old. Show its
actual timestamp. Missing/invalid/future dates, unavailable provider reads and
invalid SOC still block target calculation. Old age alone does not block it.

Read Kia `charge.targetStateOfCharge.standard` as the **AC** limit. The V2C
charger does not use the quick/DC limit. A lower or unknown AC limit blocks the
target, with guidance to review the limit in Kia. Recheck it after Sí. The app
does not raise or unlock the vehicle setting; the user can change it in Kia.

**Disconnected/away is allowed**: save now, plug in later. Provider phases smart
control, control ready and disconnected/away are accepted for preferences. Paused,
lost connection, boost, setup, error and unknown phases still block this action.

## Recurring Octopus setting

The product has **one additional percentage and one ready-by time**, as in
Android. It is a recurring daily setting, not a per-session or per-day feature.
Use `setDevicePreferences` with CHARGE, PERCENTAGE and complete Monday–Sunday
rows. On this account, uniform rows were accepted; per-day/weekday-only variants
were rejected with KT-CT-4321. Preserve the common ready-by time and configured
minimum. Block inconsistent daily times/minimums or missing/ambiguous days.

The read API may return `min: null`; omit that unconfigured field on the wire.
Sending explicit null was rejected. Preserve non-null minimums; read-only
upperLimit fields are not mutation inputs. Compare normalized rows for read-back.

Success requires the same device/account, mode/unit and full schedule set to
match. **Configuración verificada** confirms stored preferences, not delivered
energy, a recalculated dispatch plan or an exact final physical SOC.

## Failure handling

Preference and boost writes share a controller and persistent phone-side
`ov2c.control.pending` fence. Persist the desired schedules/mode/unit before a
preference submission, without credentials or account/device identifiers.

Send a mutation once. Never automatically retry a timeout, lost response or auth
rejection. Ignore duplicate/stale confirmation IDs and suppress periodic refresh
while control is busy. Read back even after a failed response: matching desired
preferences can verify the state without sending again. Known validation/auth
rejections are reported; unclassified or mismatched outcomes remain uncertain.

An unresolved fence survives restart and blocks both actions. Choosing an action
then checks the existing desired state rather than submitting another command.
Permanent mismatch still needs manual recovery UX; never silently remove a fence.
The watch shows an uncertain result after 45 seconds without a final response;
a late verified result can replace it. Leaving a sending screen cannot cancel a
command that has already been dispatched.

## Evidence and references

The 8 November live trial saved **+16%, 11:00, every day** from reported Kia 64%.
Independent API read-back and the user's Android confirmation agreed. That does
not verify a 100% real preference update or final delivered SOC. The 13 November
91-test suite covers both targets offline, cached SOC, AC limits, unplugged
saving, reconfirmation and uncertainty. See [STATUS.md](STATUS.md) and
[DEVELOPMENT.md](DEVELOPMENT.md) for builds and safe emulator use.

The [changelog](CHANGELOG.md) records the accepted behavior and validation milestones.
Obsolete diagnostics and duplicated documentation snapshots were removed during cleanup.

Official references consulted during implementation:

- [setDevicePreferences](https://developer.oees-kraken.energy/graphql/reference/mutations/setdevicepreferences/)
- [SmartFlexDevicePreferencesInput](https://developer.oees-kraken.energy/graphql/reference/input-objects/smartflexdevicepreferencesinput/)
- [PreferencesScheduleInput](https://developer.oees-kraken.energy/graphql/reference/input-objects/preferencesscheduleinput/)
- [Pleos battery charging status](https://document.pleos.ai/en/api-reference/vehicle-data-api/vehicle-data-api/common/get-battery-charging-status)
- [Kia EV charging settings](https://ownersmanual.kia.com/ivi/STD_GEN5W/AVNT/EU/English/evsettings.html)
