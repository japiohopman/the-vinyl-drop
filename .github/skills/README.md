# The Vinyl Drop — Agent Skills

This is a small library of reusable, project-specific workflows. It complements root AGENTS.md, the five specialist contracts and canonical documentation; it does not replace any of them.

## How to use these skills

- Start with the active GitHub Issue and the relevant specialist contract in .github/agents/.
- Select only the SKILL.md files relevant to the work. Open and read them before planning or editing.
- Do not assume that every coding tool automatically discovers repository skills. When ChatGPT works directly on this repository, it opens the selected skill itself.
- Skills provide methods and guardrails, not independent task authorization.
- For any visible UI change, the UI Visual Reference Library and the exact relevant screenshot are mandatory inputs; see mobile-first-ui and visual-regression-evidence.

## Specialist map

| Specialist | Default skill(s) | Add when the task also covers |
| --- | --- | --- |
| Architecture | express-route-asset-audit | performance-investigation for measured cross-layer performance; safe-migration-rollout for migration design |
| Data / Catalog | safe-migration-rollout | performance-investigation for measured SQL, index, query or pooler work |
| UI | mobile-first-ui, visual-regression-evidence, express-route-asset-audit | performance-investigation for browser/runtime performance |
| Marketplace | listing-photo-pipeline | express-route-asset-audit for route/EJS/bundle changes; performance-investigation for measured upload/image/storage work |
| Verification | visual-regression-evidence, express-route-asset-audit, safe-migration-rollout | performance-investigation when measurement evidence is required |

## Skill catalogue

| Skill | Use when |
| --- | --- |
| mobile-first-ui | Any visible screen, EJS, responsive layout, navigation, form flow or interaction change. |
| visual-regression-evidence | Capturing/comparing screenshots, checking provenance or promoting a reviewed baseline. |
| express-route-asset-audit | Tracing Express routes to controllers/views and checking route-specific CSS/JS assets. |
| performance-investigation | Measuring browser, Node/Express, PostgreSQL/Drizzle, Render, Sharp, Storage or network performance. It is a cross-specialist capability, not a sixth specialist role. |
| listing-photo-pipeline | Changing seller photo roles, upload, browser correction, Sharp, public derivatives, private edit sources or cleanup. |
| safe-migration-rollout | Planning or verifying schema migrations and staging/production database rollout. |

## Deliberately pruned overlaps

- PostgreSQL/Drizzle procedures live in performance-investigation rather than a second database-performance skill.
- Express request tracing and route-asset auditing share one workflow in express-route-asset-audit.
- No separate Performance Specialist role is added. The same performance skill is available to all five specialists when the Issue requires measured evidence.

## Format and maintenance

Each skill uses the standard SKILL.md frontmatter fields name and description. Skills link to canonical repository documents rather than duplicating large sections. When a skill is added, renamed or removed, update this map and the relevant specialist contract and tests.
