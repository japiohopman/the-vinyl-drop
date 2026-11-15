'use strict';

const SKILL_REGISTRY = Object.freeze({
  'mobile-first-ui': '.github/skills/mobile-first-ui/SKILL.md',
  'visual-regression-evidence': '.github/skills/visual-regression-evidence/SKILL.md',
  'express-route-asset-audit': '.github/skills/express-route-asset-audit/SKILL.md',
  'performance-investigation': '.github/skills/performance-investigation/SKILL.md',
  'listing-photo-pipeline': '.github/skills/listing-photo-pipeline/SKILL.md',
  'safe-migration-rollout': '.github/skills/safe-migration-rollout/SKILL.md',
});

const SPECIALIST_REGISTRY = Object.freeze({
  architecture: {
    label: 'Architecture',
    aliases: ['architecture', 'architecture specialist'],
    contractPath: '.github/agents/architecture.md',
    skills: ['express-route-asset-audit'],
  },
  dataCatalog: {
    label: 'Data / Catalog',
    aliases: ['data / catalog', 'data/catalog', 'data catalog', 'data-catalog', 'data / catalog specialist', 'data catalog specialist'],
    contractPath: '.github/agents/data-catalog.md',
    skills: ['safe-migration-rollout'],
  },
  ui: {
    label: 'UI',
    aliases: ['ui', 'ui specialist'],
    contractPath: '.github/agents/ui.md',
    skills: ['mobile-first-ui', 'visual-regression-evidence', 'express-route-asset-audit'],
  },
  marketplace: {
    label: 'Marketplace',
    aliases: ['marketplace', 'marketplace specialist'],
    contractPath: '.github/agents/marketplace.md',
    skills: ['listing-photo-pipeline'],
  },
  verification: {
    label: 'Verification',
    aliases: ['verification', 'verification specialist'],
    contractPath: '.github/agents/verification.md',
    skills: ['visual-regression-evidence', 'safe-migration-rollout', 'express-route-asset-audit'],
  },
});

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ');
}

function splitSpecialists(value) {
  if (Array.isArray(value)) return value.flatMap(splitSpecialists);
  return String(value ?? '')
    .split(/\s*(?:,|;)\s*|\s+and\s+/i)
    .map((item) => item.trim())
    .filter((item) => item && !['n/a', 'na', 'none', 'not applicable'].includes(item.toLowerCase()));
}

function findSpecialist(value) {
  const normalized = normalizeName(value);
  for (const specialist of Object.values(SPECIALIST_REGISTRY)) {
    if (specialist.aliases.some((alias) => normalizeName(alias) === normalized)) return specialist;
  }
  throw new Error('Unknown specialist "' + String(value) + '". Use Architecture, Data / Catalog, UI, Marketplace or Verification.');
}

function resolveAgentContext(primarySpecialist, secondarySpecialists, requestedSkills) {
  if (!String(primarySpecialist ?? '').trim()) {
    throw new Error('Primary Specialist is required.');
  }

  const specialists = [findSpecialist(primarySpecialist)];
  for (const name of splitSpecialists(secondarySpecialists)) {
    const specialist = findSpecialist(name);
    if (!specialists.includes(specialist)) specialists.push(specialist);
  }

  const requested = Array.isArray(requestedSkills)
    ? requestedSkills
    : String(requestedSkills ?? '').split(/[;,]/);
  const unknownSkills = requested.map((skill) => String(skill).trim()).filter(Boolean)
    .filter((skill) => !Object.prototype.hasOwnProperty.call(SKILL_REGISTRY, skill));
  if (unknownSkills.length > 0) {
    throw new Error('Unknown Agent Skills: ' + unknownSkills.join(', ') + '. Use only registered skill IDs from .github/skills/README.md.');
  }

  const skillIds = [];
  for (const specialist of specialists) {
    for (const skill of specialist.skills) {
      if (!skillIds.includes(skill)) skillIds.push(skill);
    }
  }
  for (const skill of requested.map((item) => String(item).trim()).filter(Boolean)) {
    if (!skillIds.includes(skill)) skillIds.push(skill);
  }

  return {
    specialistLabels: specialists.map((specialist) => specialist.label),
    contractPaths: specialists.map((specialist) => specialist.contractPath),
    skillIds,
    skillPaths: skillIds.map((skill) => SKILL_REGISTRY[skill]),
  };
}

function buildJulesPrompt(issue) {
  const context = issue.agentContext || resolveAgentContext(
    issue.primarySpecialist,
    issue.secondarySpecialist,
    issue.agentSkills || []
  );
  const readPaths = [
    'AGENTS.md',
    'CHATGPT.md (read-only context; never edit)',
    '.github/skills/README.md',
    ...context.contractPaths,
    ...context.skillPaths,
  ];
  const uniqueReadPaths = [...new Set(readPaths)];
  const isUiTask = context.specialistLabels.includes('UI') ||
    context.skillIds.includes('mobile-first-ui') ||
    context.skillIds.includes('visual-regression-evidence');
  const lines = [
    'Start Issue #' + issue.issueNumber + ' — ' + issue.title,
    '',
    'Primary Specialist: ' + issue.primarySpecialist,
    'Secondary Specialist: ' + (issue.secondarySpecialist || 'N/A'),
    'Required Agent Skills: ' + (context.skillIds.join(', ') || 'none beyond the specialist contract'),
    '',
    '## Repository context — read before planning or changing code',
    'Open and read each of these exact paths from the repository before implementation:',
    ...uniqueReadPaths.map((filePath) => '- ' + filePath),
    '',
    'The dispatcher supplies explicit paths; do not assume repository SKILL.md files are automatically loaded by Jules. Read the complete listed SKILL.md files and follow their project-specific procedures. Do not load every skill directory.',
  ];

  if (isUiTask) {
    lines.push(
      '',
      '## Mandatory UI reference check',
      'Before editing a visible surface, open docs/verification/UI_VISUAL_REFERENCE.md and docs/verification/ui-baselines/README.md. Locate and open the nearest valid screenshot(s), matching route, visible state, viewport and theme. The owner-supplied images are directional references unless the register explicitly marks a capture as an approved baseline. If no exact baseline exists, say so, identify the nearest valid reference and record the missing capture as a follow-up; never claim a baseline was checked when it was not.'
    );
  }

  lines.push(
    '',
    '## Governing Issue',
    'The complete Issue body below is the execution contract. Stay within its scope, acceptance criteria, non-goals and safety boundaries.',
    '',
    String(issue.body || '')
  );
  return lines.join('\n');
}

module.exports = {
  SKILL_REGISTRY,
  SPECIALIST_REGISTRY,
  resolveAgentContext,
  buildJulesPrompt,
};
