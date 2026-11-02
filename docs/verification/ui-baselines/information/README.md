# Information Page Visual References

This folder is the canonical visual reference location for the public information/help pages. These pages use the shared `views/layouts/main.ejs` shell and must remain part of the same tactile, editorial record-shop identity.

## Current page inventory

| Page | Route | EJS source | Reference files |
| --- | --- | --- | --- |
| Terms of Use | `/terms` | `views/info/terms.ejs` | `terms-desktop.png`, `terms-mobile.png` |
| Installation | `/install` | `views/info/install.ejs` | `install-desktop.png`, `install-mobile.png` |
| Privacy Notice | `/privacy` | `views/info/privacy.ejs` | `privacy-desktop.png`, `privacy-mobile.png` |
| Community Rules | `/community-rules` | `views/info/community-rules.ejs` | `community-rules-desktop.png`, `community-rules-mobile.png` |
| Contact | `/contact` | `views/info/contact.ejs` | `contact-desktop.png`, `contact-mobile.png` |

There are currently no committed baselines in this folder. Add one desktop and one mobile capture for each page where the responsive layout differs. Capture the default page plus a meaningful inline form state only where it adds useful reference value (Contact validation/success, for example).

## Capture and update rules

- Use the live staging route and staging test accounts. Do not capture production data, credentials or personal information.
- Record viewport width × height, route, page state, active theme, staging capture date and the deployed application commit SHA when it can be verified. Write `not recorded` rather than guessing.
- Preserve legal and policy content verbatim. This folder is a visual reference, not authority to rewrite Terms, Privacy Notice, Community Rules or age/access wording.
- Long documents should be captured at a representative initial viewport; use additional focused captures only when a unique interaction or navigation pattern needs documenting. Do not store every scroll position.
- Use the same page shell and spacing system as other reference screens. Do not treat the documents as standalone HTML microsites.
- When a page's layout is intentionally changed, update its existing canonical reference in the same PR and update the row in [`../../UI_VISUAL_REFERENCE.md`](../../UI_VISUAL_REFERENCE.md).

## Filename and metadata convention

Use the filenames in the table above. The central index records route and state metadata. Keep source assets in `public/`; screenshots remain references only.
