# Local Font Assets and Licences

The design's existing font families are served from the first-party /fonts/ path. The page layout no longer requests Google Fonts or another remote font host.

All font files are distributed under the SIL Open Font License 1.1. Complete upstream license texts are committed under public/fonts/licenses/. Source files are pinned to Google Fonts commit 47d54ca1ebb14fd864695f1d39dc734f39017c33.

| Family | Local files | Upstream source | Licence |
| --- | --- | --- | --- |
| Capriola | public/fonts/Capriola.ttf | https://github.com/google/fonts/tree/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/capriola | public/fonts/licenses/OFL-Capriola.txt |
| DM Sans | DMSans-Variable.ttf, DMSans-Italic-Variable.ttf | https://github.com/google/fonts/tree/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/dmsans | public/fonts/licenses/OFL-DM-Sans.txt |
| IBM Plex Mono | IBMPlexMono-Regular.ttf, IBMPlexMono-SemiBold.ttf, IBMPlexMono-Bold.ttf, IBMPlexMono-Italic.ttf | https://github.com/google/fonts/tree/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/ibmplexmono | public/fonts/licenses/OFL-IBM-Plex-Mono.txt |
| Space Grotesk | SpaceGrotesk-Variable.ttf | https://github.com/google/fonts/tree/47d54ca1ebb14fd864695f1d39dc734f39017c33/ofl/spacegrotesk | public/fonts/licenses/OFL-Space-Grotesk.txt |

The fonts preserve the existing type families and visual identity while avoiding third-party font requests. The separate live browser/network check remains required before the privacy notice can be approved.
