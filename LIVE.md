# Provider integration

Updated 13 November 2026. The production companion reads Pleos and Octopus and
supports confirmed preference updates and immediate charging. Routine emulator
tests use an offline adapter. See [CONTROL.md](CONTROL.md) and [BOOST.md](BOOST.md)
for mutation behavior; this guide describes reads and authentication.

## Pleos / Kia

1. POST `/v1/auth/personal-token` with Brand kia and the configured client ID/secret.
2. GET `/v1/vehicles/consent` with the personal bearer token. Require exactly one
   consented vehicle; keep its VIN in memory.
3. Read that vehicle's `/batteries` endpoint for `charge.stateOfCharge`, vehicle
   timestamp and `charge.targetStateOfCharge.standard` AC limit.

Use **sellname** from consent for the dashboard model label. A read-only query on
13 November returned **EV6**. Accept a bounded, validated model string, with Kia
fallback for missing/malformed data. Do not use the private vehicle `name` or VIN
as a display label. Transient read failures retain the previous model/value with
a source-error state; configuration invalidation clears them.

The vehicle timestamp is the last report, not proof of a fresh car poll. The user
accepts cached parked-car SOC regardless of age. Display the timestamp, but do
not use a 15-minute age as a preference-write block. Missing/invalid/future dates
and failed provider reads still block target updates. Fetch the latest available
report before confirmation and sending. No documented force-refresh/wake or AC
limit setter was found in the personal API inspected during implementation.

## Octopus Energy Spain

Endpoint: `https://api.oees-kraken.energy/v1/graphql/`.

The user selected legacy `obtainKrakenToken(input: {email, password})` for the
prototype. Send its token directly in Authorization, without a Bearer prefix.
OAuth is deferred until the user contacts Octopus; keep authentication replaceable.
The legacy credential fields were marked deprecated in the inspected schema,
but login succeeded in the 13 November trials. Do not assume indefinite support.

Use viewer accounts to discover the single account, then devices to require one
matching V2C Trydan. Read status, relative percentage preferences, current allowed
increments and boost capabilities. Use flexPlannedDispatches for dated windows.
Multiple accounts/vehicles/devices produce selection errors; no picker exists yet.

A failed optional plan query does not discard valid saved preferences. Provider
phase controls plan guidance; an empty plan never proves completed charging or a
physically disconnected car. Convert dates/times using Europe/Madrid including DST.
Summaries display at most eight windows, with a notice if more exist.

Octopus's `max` schedule value means **additional percentage points**. Uniform
seven-day rows represent the one amount/time exposed by the product, not separate
user-selectable schedules. Fetch current metadata rather than assuming 1% or 5%.

## Tokens, refresh and delivery

- Reuse cached JWTs only while their actual expiry is more than one minute away.
  Coordinate renewals. A read auth rejection gets one fresh-token retry.
- Mutations never use that retry path. Token renewal before sending is allowed;
  an uncertain/auth-failed dispatched write is not resubmitted automatically.
- Read on launch, Up, settings save and every five minutes while the app is open.
  Overlapping refreshes coalesce; suppress periodic reads during a control operation.
- Retain last known values on transient failures and identify the failing provider.
  After companion restart, watch values begin as placeholders until refreshed.
- Serialize watch delivery, retrying a failed message at most twice. Watch delivery
  retry is distinct from retrying an API mutation.

Credentials and token caches stay in phone storage. Watch messages contain only
model, SOC, additions, time, provider/phase states, plan, timestamps, limits-related
warnings and confirmation data. No JWT, secret, account/device ID or VIN is sent to
the watch or retained in logs. Internet permissions cover only api.pleos.ai and
api.oees-kraken.energy. See [CONFIGURATION.md](CONFIGURATION.md).

## Verified scope

The latest functional suite passed **91 tests** on 13 November. Preference writes
were verified in the API and Android on 8 November. A real boost start and stop
were verified in the API and by the user on 13 November, without changing saved
preferences. See [STATUS.md](STATUS.md) for receipts and the latest observed state.
The new production build was installed on the physical watch on 13 November.
Its physical interactions and multi-day reliability await user validation.

The last observed 3,600-second token lifetime is an observation, not a constant;
the implementation uses each token's expiry. Further multi-day/new-build watch
validation and an actual 100% preference write remain outstanding.

For read-only discovery, run `python3 scripts/probe_octopus.py`. Authentication is
its only mutation; do not run the live trial mutation flags as diagnostic reads.
Historical milestones are summarized in the [changelog](CHANGELOG.md); obsolete raw
snapshots have been removed. Sanitized current receipts are in docs/validation.

References consulted during development:
[Spain developer portal](https://developer.oees-kraken.energy/),
[obtainKrakenToken](https://developer.oees-kraken.energy/graphql/reference/mutations/obtainkrakentoken/),
[devices](https://developer.oees-kraken.energy/graphql/reference/queries/devices/),
[dispatches](https://developer.oees-kraken.energy/graphql/reference/queries/flexplanneddispatches/),
[Pleos personal Vehicle Data API](https://document.pleos.ai/en/api-reference/vehicle-data-api/intro).
