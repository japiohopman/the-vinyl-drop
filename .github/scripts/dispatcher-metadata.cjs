'use strict';

const READY_VALUES = new Set(['ready', 'dispatch-ready', 'ready-for-dispatch']);
const NOT_READY_VALUES = new Set(['not ready', 'not dispatch-ready', 'not dispatch ready', 'blocked', 'unready', 'false', 'no']);
const FIELD_LABELS = '(?:dispatch\\s+readiness|readiness|primary(?:\\s+specialist)?|secondary(?:\\s+specialist)?|priority|p)';

function normalizeLine(line) {
  return line
    .replace(/^\\s{0,3}#{1,6}\\s+/, '')
    .replace(/\\*\\*/g, '')
    .replace(/`/g, '')
    .replace(/^\\s*>\\s?/, '')
    .trim();
}

function normalizeValue(value) {
  return String(value ?? '')
    .replace(/^\\s*[\\`"'*]+/, '')
    .replace(/[\\`"'*]+\\s*$/, '')
    .trim()
    .replace(/[.!]+$/, '')
    .trim();
}

/**
 * Read a metadata field from a Markdown issue body.
 *
 * Supports plain and bold labels, punctuation inside or outside bold markup,
 * and heading-style fields whose value is on the next non-empty line.
 * Matching is anchored to a field line so prose mentioning readiness cannot
 * accidentally make an issue dispatchable.
 */
function findField(body, labelPattern) {
  const lines = String(body ?? '').split(/\\r?\\n/).map(normalizeLine);
  const fieldLine = new RegExp('^(?:' + labelPattern + ')\\s*(?::\\s*(.*))?$', 'i');
  const anyFieldLine = new RegExp('^' + FIELD_LABELS + '\\s*(?::.*)?$', 'i');

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(fieldLine);
    if (!match) continue;

    if (match[1] !== undefined && match[1].trim() !== '') {
      return { found: true, value: normalizeValue(match[1]) };
    }

    // A bare field label is a Markdown-style heading. Read its next non-empty
    // line only; do not accidentally consume another field or section heading.
    for (let next = i + 1; next < lines.length; next += 1) {
      const candidate = lines[next].trim();
      if (!candidate) continue;
      if (candidate.startsWith('#') || /^[-*_]{3,}$/.test(candidate) || anyFieldLine.test(candidate)) {
        return { found: true, value: '' };
      }
      return { found: true, value: normalizeValue(candidate) };
    }

    return { found: true, value: '' };
  }

  return { found: false, value: '' };
}

function parseIssueMetadata(issue) {
  const body = issue.body || '';
  const labels = (issue.labels || []).map((label) => (typeof label === 'string' ? label : label.name).toLowerCase());
  const hasReadyLabel = labels.some((label) => ['dispatch-ready', 'ready-for-dispatch', 'ready'].includes(label));

  const readiness = findField(body, '(?:dispatch\\s+readiness|readiness)');
  let isDispatchReady = hasReadyLabel;
  let readinessProblem = null;

  if (readiness.found) {
    const value = readiness.value.toLowerCase();
    if (READY_VALUES.has(value)) {
      isDispatchReady = true;
    } else if (NOT_READY_VALUES.has(value) || value === '') {
      isDispatchReady = false;
      readinessProblem = value ? null : 'Dispatch Readiness field has no value.';
    } else {
      isDispatchReady = false;
      readinessProblem = 'Unsupported Dispatch Readiness value "' + readiness.value + '". Expected READY, DISPATCH-READY, READY-FOR-DISPATCH, NOT READY, or BLOCKED.';
    }
  } else if (!hasReadyLabel) {
    isDispatchReady = false;
    readinessProblem = 'Missing Dispatch Readiness field or approved readiness label.';
  }

  const primary = findField(body, 'primary(?:\\s+specialist)?');
  const secondary = findField(body, 'secondary(?:\\s+specialist)?');

  let priority = 3;
  const priorityMatch = body.match(/\\*\\*(?:Priority|P)\\*\\*:\\s*(?:P)?(\\d+)/i) || body.match(/Priority:\\s*(?:P)?(\\d+)/i);
  if (priorityMatch) {
    const parsedPriority = Number.parseInt(priorityMatch[1], 10);
    if (Number.isInteger(parsedPriority) && parsedPriority >= 1) priority = parsedPriority;
  }

  const dependencies = [];
  const dependencyMatch = body.match(/###\\s*Dependencies[\\s\\S]*?(?=\\n##|$)/i) || body.match(/(?:Depends\\s+on|Dependencies):\\s*([^\\r\\n]+)/i);
  if (dependencyMatch) {
    for (const match of dependencyMatch[0].matchAll(/#(\\d+)/g)) {
      const number = Number.parseInt(match[1], 10);
      if (Number.isInteger(number) && number !== issue.number && !dependencies.includes(number)) {
        dependencies.push(number);
      }
    }
  }

  return {
    issueNumber: issue.number,
    title: issue.title,
    body,
    state: issue.state,
    labels: (issue.labels || []).map((label) => typeof label === 'string' ? label : label.name),
    primarySpecialist: primary.found && primary.value ? primary.value : undefined,
    secondarySpecialist: secondary.found && secondary.value ? secondary.value : undefined,
    priority,
    dependencies,
    isDispatchReady,
    readinessProblem,
  };
}

module.exports = { findField, parseIssueMetadata };
