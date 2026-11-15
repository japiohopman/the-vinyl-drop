import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skillIds = [
  'mobile-first-ui',
  'visual-regression-evidence',
  'express-route-asset-audit',
  'performance-investigation',
  'listing-photo-pipeline',
  'safe-migration-rollout',
] as const;

const specialistContracts = [
  '.github/agents/architecture.md',
  '.github/agents/data-catalog.md',
  '.github/agents/ui.md',
  '.github/agents/marketplace.md',
  '.github/agents/verification.md',
] as const;

describe('The Vinyl Drop task-skill portfolio', () => {
  test('every skill has a matching directory and valid standard SKILL.md frontmatter', () => {
    for (const skillId of skillIds) {
      const relativePath = '.github/skills/' + skillId + '/SKILL.md';
      expect(fs.existsSync(path.join(root, relativePath))).toBe(true);
      const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
      const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      expect(frontmatter).not.toBeNull();
      expect(frontmatter?.[1]).toMatch(new RegExp('^name:\\s*' + skillId + '$', 'm'));
      expect(frontmatter?.[1]).toMatch(/^description:\s*\S+/m);
      expect(content.length).toBeGreaterThan(250);
    }
  });

  test('the catalogue maps all five roles and six focused skills', () => {
    const catalogue = fs.readFileSync(path.join(root, '.github/skills/README.md'), 'utf8');
    for (const skillId of skillIds) expect(catalogue).toContain(skillId);
    for (const role of ['Architecture', 'Data / Catalog', 'UI', 'Marketplace', 'Verification']) {
      expect(catalogue).toContain(role);
    }
    expect(catalogue).toContain('cross-specialist capability');
    expect(catalogue).not.toContain('Jules');
  });

  test('all five specialist contracts exist and identify their task skills', () => {
    for (const relativePath of specialistContracts) {
      const contract = fs.readFileSync(path.join(root, relativePath), 'utf8');
      expect(contract.length).toBeGreaterThan(500);
      expect(contract).toMatch(/Skill routing/);
      expect(contract).toContain('.github/skills/');
    }
    const uiContract = fs.readFileSync(path.join(root, '.github/agents/ui.md'), 'utf8');
    expect(uiContract).toContain('docs/verification/UI_VISUAL_REFERENCE.md');
    expect(uiContract).toContain('relevant screenshot(s)');
    expect(uiContract).toContain('no exact baseline exists');
  });

  test('performance remains cross-specialist and covers the actual TVD performance layers', () => {
    const skill = fs.readFileSync(
      path.join(root, '.github/skills/performance-investigation/SKILL.md'),
      'utf8'
    );
    for (const layer of ['Browser', 'Node', 'PostgreSQL', 'Render', 'Sharp', 'Supabase Storage']) {
      expect(skill).toContain(layer);
    }
    expect(skill).toContain('Shared Pooler Egress');
    expect(skill).toContain('Issue #377');
    expect(skill).toContain('Issue #388');
    expect(skill.toLowerCase()).toContain('read-only');
  });

  test('listing photo guidance distinguishes square cover output from portrait additional-photo output', () => {
    const skill = fs.readFileSync(
      path.join(root, '.github/skills/listing-photo-pipeline/SKILL.md'),
      'utf8'
    );
    expect(skill).toContain('1536×1536');
    expect(skill).toContain('additional roles preserve the corrected framing aspect');
    expect(skill).toContain('listing-photo-originals');
    expect(skill).toContain('Never submit a form');
  });

  test('canonical documentation and source paths referenced by the skill set exist', () => {
    const referencedPaths = [
      'docs/AGENT_GUIDE.md',
      'docs/PAGE_MAP.md',
      'docs/UX_UI.md',
      'docs/PRODUCT_VISION.md',
      'docs/verification/UI_VISUAL_REFERENCE.md',
      'docs/verification/ui-baselines/README.md',
      'docs/DATA_ARCHITECTURE.md',
      'docs/DOMAIN_MODEL.md',
      'docs/CATALOGUE_SEARCH.md',
      'docs/SECURITY_PRIVACY.md',
      'src/app/routes/listingRoutes.ts',
      'src/app/controllers/listingController.ts',
      'src/app/services/listingService.ts',
      'src/app/repositories/listingPhotoRepository.ts',
      'src/app/utils/imageProcessor.ts',
      'src/app/services/storageService.ts',
      'src/db/',
      'drizzle/meta/_journal.json',
      'test/squarePhotoCropper.test.ts',
    ];
    for (const relativePath of referencedPaths) {
      expect(fs.existsSync(path.join(root, relativePath))).toBe(true);
    }
  });

  test('feature, bug and phase issue templates require complete visual context for UI work', () => {
    for (const templateName of ['feature.md', 'bug.md', 'phase.md']) {
      const template = fs.readFileSync(
        path.join(root, '.github/ISSUE_TEMPLATE', templateName),
        'utf8'
      );
      expect(template).toContain('## Visual reference (complete for visible UI work');
      for (const field of [
        'Route and HTTP method',
        'User and UI state',
        'Viewport and theme',
        'Relevant reference',
        'Intentional visual changes',
        'Evidence',
      ]) {
        expect(template).toContain(field);
      }
    }
  });

  test('Photos evidence covers four mobile widths and retains the strict overflow assertion', () => {
    const testSource = fs.readFileSync(path.join(root, 'test/squarePhotoCropper.test.ts'), 'utf8');
    expect(testSource).toContain('captures the focused listing Photos step');
    expect(testSource).toContain('const widths = [360, 375, 390, 430]');
    expect(testSource).toContain('documentWidth).toBeLessThanOrEqual(width + 1)');
    expect(testSource).toContain('never submits the form');
    expect(testSource).toContain('getComputedStyle(element).flexWrap');
    const visualIndex = fs.readFileSync(
      path.join(root, 'docs/verification/UI_VISUAL_REFERENCE.md'),
      'utf8'
    );
    expect(visualIndex).toContain('Focused listing Photos step (Issue #416)');
    expect(visualIndex).toContain('issue-333-photo-editor-playwright-evidence');
  });

  test('root instructions and contributor guide describe direct skill use, not Jules dispatch', () => {
    const rootInstructions = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    const contributorGuide = fs.readFileSync(path.join(root, 'docs/AGENT_GUIDE.md'), 'utf8');
    expect(rootInstructions).toContain('.github/skills/README.md');
    expect(rootInstructions).toContain('ChatGPT works directly');
    expect(rootInstructions).not.toContain('.github/scripts/agent-context.cjs');
    expect(contributorGuide).toContain('direct repository work by ChatGPT');
    expect(contributorGuide).toContain('CodeRabbit');
    expect(contributorGuide).not.toContain('Jules dispatcher adds');
  });
});
