/**
 * task-board.mjs
 *
 * Shared TASK_BOARD parsing helpers used by startup, blocker, and queue flows.
 */

export function extractSection(markdown, heading) {
  const parts = String(markdown || '').split(/^## /m);
  const match = parts.find((part) => part.startsWith(heading));
  if (!match) return '';
  const nl = match.indexOf('\n');
  return nl === -1 ? '' : match.slice(nl + 1);
}

function normalizeStatus(statusText = '') {
  const text = String(statusText || '').toLowerCase();
  if (/✅|\bdone\b|\bcomplete(?:d)?\b|\bshipped\b/.test(text)) return 'done';
  if (/human|blocked|⛔|⚠/.test(text)) return 'blocked';
  if (/next|queued|todo|open|pending|🔜/.test(text)) return 'open';
  return text.trim() || 'open';
}

function cleanCell(value = '') {
  return String(value || '').replace(/\*\*/g, '').replace(/`/g, '').trim();
}

export function taskItemKey(value = '') {
  return cleanCell(value)
    .split(/\s+—\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isTableHeader(cells) {
  const first = cleanCell(cells[0]).toLowerCase();
  return !first || first === '#' || first === 'item' || first === 'rank' || /^:?-{2,}:?$/.test(first);
}

function parseTableRow(line, fallbackRank) {
  if (!/^\s*\|/.test(line)) return null;
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  if (cells.length < 2 || isTableHeader(cells)) return null;
  let rank = String(fallbackRank);
  let tier = '';
  let category = 'Task Board';
  let status = '';
  let effort = '';
  let item = '';
  if (/^[\d.]+$/.test(cells[0])) {
    rank = cells[0];
    if (cells.length >= 6) [, tier, category, status = '', effort = '', item = ''] = cells;
    else [, item = '', status = ''] = cells;
  } else {
    [item = '', status = ''] = cells;
  }
  const title = cleanCell(item).replace(/\s+/g, ' ').trim();
  if (!title) return null;
  return {
    rank,
    rankNumber: Number.parseFloat(rank) || fallbackRank,
    tier,
    category,
    status: normalizeStatus(status),
    statusText: status,
    effort,
    item: title,
    rawItem: item,
    title,
    key: taskItemKey(title)
  };
}

export function parseTaskBoardItems(markdown, { dedupe = true, includeHuman = true } = {}) {
  const rows = [];
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const parsed = parseTableRow(line, rows.length + 1);
    if (parsed) rows.push(parsed);
  }
  const normalized = dedupe
    ? [...rows.reduce((latest, item) => {
        if (item.key) latest.set(item.key, item);
        return latest;
      }, new Map()).values()]
    : rows;
  if (!includeHuman) return normalized;
  const humanItems = parseHumanItems(markdown).map((item, index) => ({
    rank: `H${index + 1}`,
    rankNumber: 1000 + index,
    tier: 'human',
    category: 'Human Action Required',
    status: 'blocked',
    statusText: 'human-blocked',
    effort: '',
    item: item.title,
    rawItem: item.raw,
    title: item.title,
    key: taskItemKey(item.title)
  }));
  return [...humanItems, ...normalized];
}

export function parseUnifiedItems(markdown) {
  return parseTaskBoardItems(markdown);
}

export function parseHumanItems(markdown) {
  const section = extractSection(markdown, 'Human Action Required');
  if (!section) return [];

  return section
    .split(/\r?\n/)
    .map((line) => line.match(/^- \[ \] (?:\*\*(.*?)\*\* — (.*)|(.*))$/))
    .filter(Boolean)
    .map((parts) => {
      const title = (parts[1] || parts[3] || '').trim();
      const description = (parts[2] || '').trim();
      const ageMatch =
        description.match(/\((~?\d+)\s+sessions?\)/i) ||
        description.match(/\((\d+)\s+sessions?\s+old\)/i);
      const ageSessions = ageMatch ? parseInt(ageMatch[1].replace('~', ''), 10) : null;
      return {
        title,
        description,
        raw: `**${title}** — ${description}`,
        ageSessions,
      };
    });
}

export function extractCurrentSessionIntent(markdown) {
  const match = String(markdown || '').match(/## Current Session Intent: Session \d+\n([\s\S]*?)(?=\n## |\n---|$)/);
  if (!match) return '';
  return match[1].trim().replace(/\r?\n+/g, ' ');
}