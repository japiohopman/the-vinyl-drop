# The Vinyl Drop — Agent Skills

This registry contains a deliberately small set of reusable, repository-specific task procedures. Skills complement (but do not replace) root instructions, specialist role contracts and canonical product/technical documentation.

## How loading works

- Root AGENTS.md is the repository-wide instruction entry point.
- The five role contracts in .github/agents/ define specialist ownership and handoffs.
- The dispatcher maps the primary and secondary specialists to the role contracts and default skills below.
- Jules is not assumed to discover or automatically load repository SKILL.md files. The dispatcher puts the exact file paths in the generated session prompt and tells the agent to open and read them before implementation.
- An Issue may request additional cross-specialist skills with a metadata line such as: Required Agent Skills: performance-investigation. Only registered skill IDs are accepted; unknown names fail preflight.
- Do not load the whole skill catalogue. Read the assigned specialist contracts and only the skill files named in the prompt.

## Specialist map

| Specialist | Default task skills |
| --- | --- |
| Architecture | express-route-asset-audit |
| Existing composite label Architecture / Database | express-route-asset-audit + safe-migration-rollout, mapped to Architecture and Data / Catalog contracts |
| Data / Catalog | safe-migration-rollout |
| UI | mobile-first-ui, visual-regression-evidence, express-route-asset-audit |
| Marketplace | listing-photo-pipeline |
| Verification | visual-regression-evidence, safe-migration-rollout, express-route-asset-audit |

## Cross-specialist skill

| Skill | Use when |
| --- | --- |
| performance-investigation | A measurable latency, throughput, memory, CPU, query, image-processing, bundle-size or network/egress problem is in scope. Add it explicitly with Required Agent Skills in the Issue. It is available to all specialists but is not loaded for unrelated work. |

## Intentionally pruned candidates

- postgres-drizzle-performance is folded into performance-investigation, which already covers PostgreSQL, Drizzle, Supabase and connection/pooler measurement. A second database-performance skill would duplicate its procedures.
- express-feature-trace and ejs-route-asset-audit are combined into express-route-asset-audit. The single sequence traces the real Express request through EJS and the route-specific browser asset bundle.
- No sixth Performance Specialist role is introduced. Performance is a cross-specialist skill selected by the Issue.

## Skill format

Each skill uses the open Agent Skills SKILL.md frontmatter fields name and description. Project-specific instructions remain in the skill body. References point back to canonical repository documents instead of copying them. These files are repository references, not proof that a particular agent runtime automatically discovers them.
