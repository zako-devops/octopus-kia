# App presentation: local draft

Open [preview.html](preview.html) for the octopus-kia cover, icons, Spanish
description and five selected native 200×228 emulator screenshots. The user
chose **keep it local**. Nothing has been uploaded or published; no new publication
or upload is authorized by cleanup or by the existence of these files.

English disclaimer: This app is available in Spanish only because it is designed
exclusively for Octopus Energy Spain. It does not work with Octopus Energy
accounts or services in other countries or regions.

## Maintained assets

| Field | File |
| --- | --- |
| Name / author | octopus-kia / zako-devops |
| Category / language | Remotes / es |
| Description | description-es.txt |
| Release notes | release-notes-es.txt |
| Cover | assets/banner-emery.png, 720×320; SVG source retained. |
| Store icons | assets/icon-80.png and icon-144.png; SVG sources retained. |
| Screenshots | screenshots/emery_*.png, unchanged copies of selected docs/screenshots images. |
| Local manifest | listing.json, publication_authorized false. |

The manifest records screenshot provenance/checksums. Data is synthetic, not
additional real charging activity. The cover is an example using that dashboard.
Artwork is original code-maintained SVG rendered with librsvg/Cairo; the watch
favicon has separate [provenance](../resources/README.md). This is an independent
project, not an official Octopus, Kia or V2C app.

From the project root, run `python3 scripts/prepare_store.py` to regenerate local
artwork, copies and preview. It makes no API calls or publication. Source images
are maintained in docs/screenshots; disposable emulator captures stay ignored.
Generated upload ZIPs and obsolete duplicate assets were removed during cleanup.
A release PBW can be built separately as described in [DEVELOPMENT.md](../DEVELOPMENT.md).

## Store listing versus installation

Phone cover/details require Appstore metadata; adding npm fields or assets does
not populate a sideloaded app's gallery. The launcher icon is a separate bundled
resource. [STATUS.md](../STATUS.md) records the installed app; no separate Android
companion app is submitted by this project.

Only revisit publication if the user explicitly requests it. If approved later,
use the Developer Dashboard and choose the intended visibility before submitting;
unlisted apps are accessible by link, not private. Preserve UUID and use the
intended developer identity. CLI pebble publish is unsuitable for an unlisted-first
submission because its documented flow creates a Listed app and publishes it.

References consulted on 8 November 2026:
[submission assets](https://developer.repebble.com/guides/appstore-publishing/preparing-a-submission/),
[publishing](https://developer.repebble.com/guides/appstore-publishing/publishing-an-app/),
[launcher icon](https://developer.repebble.com/guides/app-resources/images/#menu-icon-in-the-launcher).
