import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

// The dispatcher loads the CommonJS registry from actions/github-script.
type AgentContextModule = {
  SKILL_REGISTRY: Record<string, string>;
  SPECIALIST_REGISTRY: Record<string, { contractPath: string; skills: string[] }>;
  resolveAgentContext: (primary: string, secondary?: string, skills?: string[]) => {
    specialistLabels: string[];
    contractPaths: string[];
    skillIds: string[];
    skillPaths: string[];
  };
  buildJulesPrompt: (issue: {
    issueNumber: number;
    title: string;
    body: string;
    primarySpecialist: string;
    secondarySpecialist?: string;
    agentSkills?: string[];
  }) => string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const agentContext = require('../.github/scripts/agent-context.cjs') as AgentContextModule;
const {
  SKILL_REGISTRY,
  SPECIALIST_REGISTRY,
  resolveAgentContext,
  buildJulesPrompt,
} = agentContext;

const root = process.cwd();

describe('TVD agent skill registry and dispatcher context', () => {
  test('every registered skill has valid frontmatter and a matching directory', () => {
    for (const [skillId, relativePath] of Object.entries(SKILL_REGISTRY)) {
      expect(relativePath).toBe('.github/skills/' + skillId + '/SKILL.md');
      const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
      const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      expect(frontmatter).not.toBeNull();
      expect(frontmatter?.[1]).toMatch(new RegExp('^name:\\s*' + skillId + '$', 'm'));
      expect(frontmatter?.[1]).toMatch(/^description:\s*\S+/m);
      expect(content.length).toBeGreaterThan(250);
    }
  });

  test('every specialist contract and default skill path exists', () => {
    for (const specialist of Object.values(SPECIALIST_REGISTRY)) {
      expect(fs.existsSync(path.join(root, specialist.contractPath))).toBe(true);
      for (const skillId of specialist.skills) {
        expect(SKILL_REGISTRY[skillId]).toBeDefined();
        expect(fs.existsSync(path.join(root, SKILL_REGISTRY[skillId]))).toBe(true);
      }
    }
  });

  test('maps a UI and Verification task to explicit role contracts and baseline skills', () => {
    const context = resolveAgentContext('UI', 'Verification', []);
    expect(context.contractPaths).toEqual([
      '.github/agents/ui.md',
      '.github/agents/verification.md',
    ]);
    expect(context.skillIds).toContain('mobile-first-ui');
    expect(context.skillIds).toContain('visual-regression-evidence');
    expect(context.skillIds).toContain('express-route-asset-audit');
    expect(context.skillIds).toContain('safe-migration-rollout');
    expect(context.skillPaths.every((filePath) => fs.existsSync(path.join(root, filePath)))).toBe(true);
  });

  test('resolves the existing Architecture / Database composite to both canonical contracts', () => {
    const context = resolveAgentContext('Architecture / Database', undefined, []);
    expect(context.contractPaths).toEqual([
      '.github/agents/architecture.md',
      '.github/agents/data-catalog.md',
    ]);
    expect(context.skillIds).toContain('express-route-asset-audit');
    expect(context.skillIds).toContain('safe-migration-rollout');
  });

  test('adds the cross-specialist performance skill only when the Issue requests it', () => {
    const context = resolveAgentContext('Architecture', 'Data / Catalog', ['performance-investigation']);
    expect(context.skillIds).toContain('performance-investigation');
    expect(context.skillPaths).toContain('.github/skills/performance-investigation/SKILL.md');

    const ordinaryUiTask = resolveAgentContext('UI', undefined, []);
    expect(ordinaryUiTask.skillIds).not.toContain('performance-investigation');
  });

  test('accepts the repository metadata convention for no secondary specialist', () => {
    expect(resolveAgentContext('Architecture', 'N/A', []).specialistLabels).toEqual(['Architecture']);
    expect(resolveAgentContext('Architecture', 'none', []).specialistLabels).toEqual(['Architecture']);
  });

  test('fails closed on unknown specialists or skill IDs', () => {
    expect(() => resolveAgentContext('Unknown role', undefined, [])).toThrow(/Unknown specialist/);
    expect(() => resolveAgentContext('UI', 'Unknown secondary', [])).toThrow(/Unknown specialist/);
    expect(() => resolveAgentContext('UI', undefined, ['unknown-skill'])).toThrow(/Unknown Agent Skills/);
  });

  test('the live dispatcher workflow delegates its prompt to the tested context builder', () => {
    const workflow = fs.readFileSync(
      path.join(root, '.github/workflows/jules-issue-dispatcher.yml'),
      'utf8'
    );
    expect(workflow).toContain("require('./.github/scripts/agent-context.cjs')");
    expect(workflow).toContain('resolveAgentContext(');
    expect(workflow).toContain('prompt: buildJulesPrompt(selectedIssue)');
  });

  test('generates a UI Jules prompt with exact contract, skill and visual-reference paths', () => {
    const prompt = buildJulesPrompt({
      issueNumber: 293,
      title: 'Improve Browse presentation',
      body: 'Update the desktop Browse result route only.',
      primarySpecialist: 'UI',
      secondarySpecialist: 'Verification',
    });

    expect(prompt).toContain('- CHATGPT.md');
    expect(prompt).toContain('.github/agents/ui.md');
    expect(prompt).toContain('.github/agents/verification.md');
    expect(prompt).toContain('.github/skills/mobile-first-ui/SKILL.md');
    expect(prompt).toContain('.github/skills/visual-regression-evidence/SKILL.md');
    expect(prompt).toContain('.github/skills/express-route-asset-audit/SKILL.md');
    expect(prompt).toContain('docs/verification/UI_VISUAL_REFERENCE.md');
    expect(prompt).toContain('docs/verification/ui-baselines/README.md');
    expect(prompt).toMatch(/do not assume.*automatically loaded by Jules/i);
    expect(prompt).toContain('Update the desktop Browse result route only.');
  });

  test('the prompt accepts an explicit cross-specialist performance skill', () => {
    const prompt = buildJulesPrompt({
      issueNumber: 377,
      title: 'Database performance investigation',
      body: 'Measure query and pooler behavior.',
      primarySpecialist: 'Data / Catalog',
      agentSkills: ['performance-investigation'],
    });
    expect(prompt).toContain('.github/skills/performance-investigation/SKILL.md');
  });
});
