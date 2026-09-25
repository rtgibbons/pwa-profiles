# Third-party notices and asset ledger

## Software and template provenance

This project derives from Ben's **betterPWAs**, pinned to
[benfredwells/betterPWAs at 40ee31ad6cf6acc66189b482dab25df094b5abc2](https://github.com/benfredwells/betterPWAs/commit/40ee31ad6cf6acc66189b482dab25df094b5abc2).
The MIT copyright and permission notice, **Copyright (c) 2024 Ben**, is preserved unchanged in
[LICENSE](LICENSE), included with every release archive.

Adapted templates and software also come from
[bmndc/betterPWAs at d10a17ca4dc928be96f4acc4367a9202133b11d4](https://github.com/bmndc/betterPWAs/commit/d10a17ca4dc928be96f4acc4367a9202133b11d4),
distributed under MIT with the same Ben copyright notice. This credit is for the adapted
software/configuration, not a claim that third-party vendor artwork is licensed by MIT.

`templates/catalog.json` records the repository, revision, and original path per template.
Slack, GitHub, Canva, and Sydney Morning Herald derive from Ben's original `manifests/*.js`;
the other eight derive from bmndc's `manifests/*.json`. Local changes include icon removal and
neutral icon generation. Template routes and product names identify compatible services.

## Asset ledger

| Assets | Provenance and license | Distribution |
| --- | --- | --- |
| `images/icon48.png`, `images/icon128.png`, `images/icon512.png` | Ben's extension artwork at the pinned upstream revision, MIT; incorporates the community PWA mark credited below | Release |
| `images/iconBlue48.png`, `images/iconBlue512.png`, `images/iconDisabled48.png`, `images/iconDisabled512.png`, `images/iconRed48.png`, `images/iconRed512.png` | Ben's extension state/color variants at the pinned upstream revision, MIT; incorporates the community PWA mark | Release |
| `visd/icon4.xcf`, `visd/icon4-128.xcf`, `visd/icon4Blue.xcf`, `visd/icon4Disabled.xcf`, `visd/icon4Red.xcf` | Ben's extension artwork sources at the pinned upstream revision, MIT; incorporates the community PWA mark | Source only, excluded from release |
| `visd/pwalogo.svg` | Diego (diekus) González-Zúñiga's [community PWA logo](https://github.com/webmaxru/progressive-web-apps-logo/blob/master/pwalogo.svg), [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) public-domain dedication | Source only, excluded from release |
| Generated template icons (`lib/site-discovery.js`) | Project-authored deterministic hostname-based gradient and stripes, MIT; no vendor artwork or remote image dependency | Generated locally at runtime |

No vendor logo artwork is distributed in the current source tree or release archive. Removed
vendor assets and obsolete design media may remain in Git history; historical archives are not
release inputs. The retained community PWA mark is not a vendor logo.

This is an independent project, not affiliated with, sponsored by, or endorsed by the listed
vendors or services. Their names and trademarks remain the property of their respective owners.
Users may import website manifests and icons themselves; those remote assets are not bundled
and their rights are not granted by this project's license.
