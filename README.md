# octopus-kia

Spanish watchapp for **Pebble Time 2** (`emery`, 200×228), combining Kia battery
information from Pleos with Octopus Energy Spain / V2C Trydan charging controls.
Formerly **octopus-v2c**; the project folder keeps that name. The app UUID and
phone storage keys are unchanged so an update retains its existing identity.

English disclaimer: This app is available in Spanish only because it is designed
exclusively for Octopus Energy Spain. It does not work with Octopus Energy
accounts or services in other countries or regions.

## What the watch shows

- Latest reported vehicle battery, labelled with the Pleos model: for example
  **EV6 · BATERÍA ACTUAL**, with **Kia** as fallback.
- Octopus's selected **additional charge percentage** and ready-by time.
- Charger phase, dated charging windows, vehicle report timestamp and source errors.
- A green clock / **ON** only while a smart schedule is verified. Boost has a
  separate phase and does not show this smart-schedule badge.

## Actions

| Action | Confirmation | Connection requirement | Effect |
| --- | --- | --- | --- |
| Charge to 80% | ¿Quieres enviar la nueva configuración? → Sí / No | May be saved before plugging in | Saves `80 − reported SOC` additional percentage points, subject to limits. |
| Charge to 100% | Same, default No | May be saved before plugging in | Saves `100 − reported SOC`, if the Kia AC limit permits it. |
| Forzar carga ahora | ¿Estás seguro? → Sí / No, default No | Connected and ready, checked again after Sí | Starts manual boost outside the smart timetable, up to the car's own limit. |
| Detener carga (shown during boost) | ¿Detener carga? → Sí / No, default No | Requires an active boost and supported cancellation | Cancels forced charging and returns to the smart timetable without changing preferences. |

No/Back cancels. Confirmed writes are sent once and verified by reading Octopus
back. Unknown outcomes block further writes until resolved; there is no blind
retry. The third menu row changes from **Forzar carga ahora** to **Detener carga**
while Octopus reports BOOSTING. Stopping boost restores smart control; it does
not disable future scheduled charging.

Octopus uses additional percentage points, not a final SOC target. For example,
reported 64% → target 80% saves **+16%**. There is one percentage and one ready-by
time, matching Android; the seven API schedule rows are internal. Cached parked-car
SOC remains usable even if hours old. Targets are checked against the car's **AC**
limit, and exact amounts are checked against current provider constraints without
rounding or silently increasing a below-minimum request.

## Setup and current release

Enter Kia client ID/secret and Octopus email/password in the Pebble Android app's
configuration page. Credentials and tokens stay on the phone; the watch receives
operational summaries only. See [Android settings](CONFIGURATION.md).

### Obtain your Kia / Pleos API credentials

Start with Pleos's official
[private vehicle owners guide](https://document.pleos.ai/en/api-reference/vehicle-data-api/getting-started/for-private-users/overview)
and [API key instructions](https://document.pleos.ai/en/api-reference/vehicle-data-api/getting-started/for-private-users/request-my-vehicle-api-key):

1. Create an account or sign in to [Pleos Playground](https://developers.pleos.ai/).
2. Open **Workspace → My Vehicle Data API**. Pleos currently makes this menu
   available to European users. Choose the **Kia** manufacturer tab.
3. Accept the required terms/privacy acknowledgements, then select **Get API Key**.
4. In the manufacturer sign-in window, authenticate with the Kia account linked
   to your vehicle and complete the authorization shown by Pleos.
5. Copy the resulting **Client ID** and **Client Secret** into the corresponding
   Kia fields in octopus-kia's settings in Pebble Android. Enter your Octopus Spain
   email/password in the separate Octopus fields, then save the configuration.

The private-user flow does not require creating a business project or requesting
business API approval. Keep the Client Secret private; do not put credentials in
GitHub, screenshots or issue reports.

The app uses those credentials to obtain a temporary access token and renews it
automatically when needed. You do not need to create or paste that token manually;
see [Pleos authentication](https://document.pleos.ai/en/api-reference/vehicle-data-api/getting-started/for-private-users/authorization).
If you revoke or reissue your key, update the saved credentials as necessary;
previous tokens are invalidated. See
[key management](https://document.pleos.ai/en/api-reference/vehicle-data-api/getting-started/for-private-users/manage-my-vehicle-api-key).

### Current release

The latest local production bundle is `build/octopus-kia.pbw`,
version **0.1.0**. It includes the rename, EV6 label, unplugged preference updates
and confirmed start/stop of immediate charging. **Installed successfully on the physical watch on 13 November**, through the
phone LAN developer connection. This replaces the earlier octopus-v2c build; on-watch
interaction and multi-day reliability still need user validation.
See [STATUS.md](STATUS.md) for the exact build, validation and handoff.
The confirmation tick icon update was also installed successfully on the watch
on 13 November; return screens retain the back arrow.

Validation recorded on **13 November 2026**: **91 automated tests passed**;
offline emulator confirmations worked; one real boost start and one cancellation
were acknowledged, read back and confirmed by the user at the car. The saved
**+21% / 11:00** preferences were unchanged by both commands. These are dated
observations, not a new live status query. A separate 8 November trial verified
saving **+16%** in both the API and Android.

## Documentation

| Guide | Contents |
| --- | --- |
| [STATUS.md](STATUS.md) | Current handoff, latest build, verified results and remaining work. |
| [DESIGN.md](DESIGN.md) | Dashboard, three-action navigation and confirmation screens. |
| [CONFIGURATION.md](CONFIGURATION.md) | Android settings, storage and provider increments. |
| [CONTROL.md](CONTROL.md) | 80%/100% calculations, AC limits, recurring preferences and uncertainty. |
| [BOOST.md](BOOST.md) | Immediate charging, connected-state checks and start/stop test evidence. |
| [LIVE.md](LIVE.md) | Provider reads, model field, token expiry and refresh behavior. |
| [PHASES.md](PHASES.md) | Provider-state mapping and smart-schedule badge. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Tests, offline emulator, builds and explicit installation paths. |
| [CHANGELOG.md](CHANGELOG.md) | Changes and dated validation milestones. |

## Screenshots and local listing

Recent native emulator captures show the
[EV6 dashboard](docs/screenshots/dashboard.png),
[renamed launcher](docs/screenshots/launcher.png),
[three-action menu](docs/screenshots/actions.png),
[boost confirmation](docs/screenshots/start-confirmation.png) and
[active result](docs/screenshots/boost-active.png),
[stop confirmation](docs/screenshots/stop-confirmation.png) and
[stopped result](docs/screenshots/stop-result.png). They use synthetic data.

The [selected screenshot gallery](docs/screenshots/index.html) contains nine
native emulator images with dates, captions and checksums. Obsolete full catalogs,
ZIPs, logs and diagnostic captures have been removed.

The [local store preview](store/preview.html) contains the renamed cover, Spanish
description and five selected screenshots from the documentation set. It remains a **local draft**;
no upload or publication is authorized. See [store/README.md](store/README.md).

## License

Original project code, documentation and artwork are licensed under [MIT](LICENSE).
Third-party dependencies, branding and favicon assets retain their own terms; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
