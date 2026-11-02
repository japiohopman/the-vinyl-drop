# Information Page Visual References

This folder is the canonical visual reference location for the public information/help pages. These pages use the shared `views/layouts/main.ejs` shell and must remain part of the same tactile, editorial record-shop identity.

## Current page inventory

| Page | Route | EJS source | Reference files |
| --- | --- | --- | --- |
| Terms of Use | `/terms` | `views/info/terms.ejs` | [`terms_desktop.png`](../menu/terms_desktop.png), [`terms_mobliel.png`](../menu/terms_mobliel.png) |
| Installation | `/install` | `views/info/install.ejs` | [`install_desktop.png`](../menu/install_desktop.png), [`install_mobiel.png`](../menu/install_mobiel.png) |
| Privacy Notice | `/privacy` | `views/info/privacy.ejs` | [`privacy_desktop.png`](../menu/privacy_desktop.png), [`Privacy_mobiel.png`](../menu/Privacy_mobiel.png) |
| Community Rules | `/community-rules` | `views/info/community-rules.ejs` | [`rules_desktop.png`](../menu/rules_desktop.png), [`rules_mobiel.png`](../menu/rules_mobiel.png) |
| Contact | `/contact` | `views/info/contact.ejs` | [`contact_desktop.png`](../menu/contact_desktop.png), [`contact_mobiel.png`](../menu/contact_mobiel.png) |

The existing desktop and mobile captures are committed under the sibling `menu/` folder and are linked above without renaming. They cover all five pages in this inventory. The `information/` folder remains the page-family index and capture guidance; do not duplicate the images into a second folder. The Contact validation/success state remains optional unless that interaction is specifically changed.

## Capture and update rules

- Use the live staging route and staging test accounts. Do not capture production data, credentials or personal information.
- Record viewport width × height, route, page state, active theme, staging capture date and the deployed application commit SHA when it can be verified. Write `not recorded` rather than guessing.
- Preserve legal and policy content verbatim. This folder is a visual reference, not authority to rewrite Terms, Privacy Notice, Community Rules or age/access wording.
- Long documents should be captured at a representative initial viewport; use additional focused captures only when a unique interaction or navigation pattern needs documenting. Do not store every scroll position.
- Use the same page shell and spacing system as other reference screens. Do not treat the documents as standalone HTML microsites.
- When a page's layout is intentionally changed, update its existing canonical reference in the same PR and update the row in [`../../UI_VISUAL_REFERENCE.md`](../../UI_VISUAL_REFERENCE.md).

## Filename and metadata convention

Preserve the exact filenames and case shown in the table (including the existing `terms_mobliel.png` and `Privacy_mobiel.png` spellings). The central index records route and state metadata. Keep source assets in `public/`; screenshots remain references only.
