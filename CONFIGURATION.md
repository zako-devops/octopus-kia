# Android configuration and charge increments

Updated 13 November 2026. The latest octopus-kia bundle was installed on the watch
on this date. Open its settings in Pebble Android; the unchanged UUID preserves
the app identity and existing phone storage across the rename.

## Settings

For first-time Kia access, follow
[Obtain your Kia / Pleos API credentials](README.md#obtain-your-kia--pleos-api-credentials).
The private-user API key provides the Client ID and Client Secret entered below;
the companion obtains and renews the temporary access token automatically.

The Spanish form contains Kia / Pleos **Client ID**, **Client Secret**, Octopus
**email** and **password**. Tap **Guardar configuración**. Credentials and token
caches stay in the phone's Pebble app storage, never on the watch. This is normal
phone app localStorage, not a claim of Android Keystore encryption.

Reopening the form restores saved values. Explicitly emptying a field clears it;
cancelling leaves settings unchanged. Saving unchanged credentials preserves
cached tokens. Changing one provider invalidates its token/device cache and old
in-flight results. UUID and existing storage keys are unchanged by the rename.

Saving settings only triggers reads: it does not change the charge amount or
start charging. Watch actions require their own Sí/No confirmations. The form explains that confirmed watch actions can adjust preferences or start
and stop charging; saving credentials itself performs no charging command.

The form is bundled Clay content opened on the phone; automatic Clay AppMessage
handling is disabled. The companion handles validated settings and sends only
configuration flags/operational summaries to the watch. Logs omit form URLs,
responses, credentials, tokens, VINs and account/device identifiers.

## Watch controls and settings are distinct

| Operation | Effect |
| --- | --- |
| Save credentials | Refresh provider reads only. |
| Confirm 80% / 100% | Save additional percentage while preserving ready-by time; allowed before plugging in. |
| Confirm Forzar carga ahora | Require connected readiness and start manual boost without changing preferences. |
| Confirm Detener carga during boost | Cancel manual boost and restore smart control; future scheduled charging stays enabled. |

See [CONTROL.md](CONTROL.md), [BOOST.md](BOOST.md) and [LIVE.md](LIVE.md) for checks,
token renewal and failure handling. Legacy Octopus password login is the user's
chosen prototype flow; OAuth is deferred.

## Observed API increments

The Android UI's 5-point buttons do not define the API step. On 6 November,
metadata advertised step 1, minimum 10 and maximum 100 additional percentage
points. A real **+16%** update was accepted and confirmed in Android on 8 November.
These are dated observations: fetch current constraints for every proposal.

Use the exact difference between target and reported SOC. For 62% → 80%, request
+18% if supported. For 76% → 80%, +4% is below the observed minimum; explain it
rather than silently increasing to +10%. Already-reached and zero requests do
not cancel or replace existing preferences.

The schedule's optional min is distinct from the allowed minimum additional
percentage. Preserve configured minimums, omit an unconfigured min on the wire,
and keep the common ready-by time. One daily configuration is represented by
seven uniform rows; there is no day-of-week selection in the product.

## Validation and references

Configuration restoration was checked in the emulator on 6 November. The latest
functional suite passed 91 tests including the stop-menu addition; current validation
and physical-watch installation status are recorded in [STATUS.md](STATUS.md).
Phone settings are described above; no credential-bearing form capture is kept.
The selected watch images live in [docs/screenshots](docs/screenshots/README.md).

References consulted during implementation:
[configuration guide](https://developer.repebble.com/guides/user-interfaces/app-configuration.md),
[preference constraints](https://developer.oees-kraken.energy/graphql/reference/interfaces/flexdevicepreferenceschedulesettinginterface/),
[preference mutation](https://developer.oees-kraken.energy/graphql/reference/mutations/setdevicepreferences/).
