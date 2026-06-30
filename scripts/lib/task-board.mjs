/**
 * task-board.mjs
 *
 * Shared TASK_BOARD parsing helpers used by startup, blocker, and queue flows.
 */

const STATUS_MAP = [
  { pattern: /✅|done|complete|shipped/i, status: 'done' },
  { pattern: /🔄|in progress|active/i, status: 'unblocked' },
  { pattern: /🔜|next sprint|todo|planned|open/i, status: 'unblocked' },
  { pattern: /blocked|waiting|human action|required|founder/i, status: 'human-blocked' },
];

function cleanMarkdown(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim();
}

function classifyStatus(value = '') {
  const text = cleanMarkdown(value);
  const match = STATUS_MAP.find((entry) => entry.pattern.test(text));
  return match?.status || 'unblocked';
}

export function extractSection(markdown, heading) {
  const parts = String(markdown || '').split(/^## /m);
  const match = parts.find((part) => part.startsWith(heading));
  if (!match) return '';
  const nl = match.indexOf('\n');
  return nl === -1 ? '' : match.slice(nl + 1);
}

function parseUnifiedGeniusSection(section) {
  const items = [];
  for (const line of section.split(/\r?\n/)) {
    if (!/^\|\s*[\d.]+\s*\|/.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 6 || cells[0] === '#') continue;
    const [rank, tier, category, status, effort, item] = cells;
    const titleMatch = item.match(/\*\*(.+?)\*\*/);
    items.push({
      rank,
      rankNumber: parseFloat(rank),
      tier,
      category,
      status,
      effort,
      item: item.replace(/\*\*/g, ''),
      rawItem: item,
      title: (titleMatch ? titleMatch[1] : item).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(),
    });
  }
  return items;
}

function parseTableRows(markdown = '') {
  const rows = [];
  let currentHeading = 'General';
  for (const rawLine of String(markdown || '').split(/\r?\n/)) {
    const heading = rawLine.match(/^#{2,4}\s+(.+)/);
    if (heading) {
      currentHeading = cleanMarkdown(heading[1]);
      continue;
    }
    if (!/^\|/.test(rawLine) || /^\|\s*-/.test(rawLine) || /Item\s*\|\s*Status/i.test(rawLine)) continue;
    const cells = rawLine.split('|').slice(1, -1).map(cleanMarkdown);
    if (cells.length < 2) continue;
    const [maybeRank, maybeTitle, maybeStatus] = cells.length >= 3 ? cells : ['', cells[0], cells[1]];
    const title = maybeTitle || maybeRank;
    if (!title || /^#$/i.test(title) || /^item$/i.test(title)) continue;
    rows.push({
      rank: Number.parseInt(maybeRank, 10) || rows.length + 1,
      rankNumber: Number.parseInt(maybeRank, 10) || rows.length + 1,
      tier: '',
      category: currentHeading,
      title,
      description: '',
      statusText: maybeStatus || '',
      status: classifyStatus(maybeStatus || title),
      effort: '',
      item: title,
      rawItem: rawLine,
    });
  }
  return rows;
}

function parseChecklistRows(markdown = '') {
  const rows = [];
  let currentHeading = 'General';
  for (const rawLine of String(markdown || '').split(/\r?\n/)) {
    const heading = rawLine.match(/^#{2,4}\s+(.+)/);
    if (heading) {
      currentHeading = cleanMarkdown(heading[1]);
      continue;
    }
    const item = rawLine.match(/^\s*-\s+\[( |x|X)\]\s+(.+)/);
    if (!item) continue;
    const text = cleanMarkdown(item[2]);
    const [title, ...rest] = text.split(/\s+[-–—]\s+/);
    rows.push({
      rank: rows.length + 1,
      rankNumber: rows.length + 1,
      tier: '',
      category: currentHeading,
      title: cleanMarkdown(title),
      description: cleanMarkdown(rest.join(' - ')),
      statusText: item[1].toLowerCase() === 'x' ? 'Done' : 'Open',
      status: item[1].toLowerCase() === 'x' ? 'done' : classifyStatus(`${currentHeading} ${text}`),
      effort: '',
      item: text,
      rawItem: rawLine,
    });
  }
  return rows;
}

export function parseUnifiedItems(markdown) {
  const unified = extractSection(markdown, 'Unified Genius List');
  const items = unified ? parseUnifiedGeniusSection(unified) : [...parseTableRows(markdown), ...parseChecklistRows(markdown)];
  return items.map((item, index) => ({
    ...item,
    id: item.id || `task-${String(index + 1).padStart(3, '0')}`,
    rank: item.rank || index + 1,
  }));
}

export function parseHumanItems(markdown) {
  const section = extractSection(markdown, 'Human Action Required');
  const explicit = section
    ? section
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
            raw: description ? `**${title}** — ${description}` : title,
            ageSessions,
          };
        })
    : [];

  if (explicit.length) return explicit;

  return parseUnifiedItems(markdown).filter((item) => {
    if (item.status === 'done') return false;
    return item.status === 'human-blocked' || /founder|secret|dashboard|billing|signup/i.test(`${item.title} ${item.description || ''}`);
  });
}

export function extractCurrentSessionIntent(markdown) {
  const match = String(markdown || '').match(/## Current Session Intent: Session \d+\n([\s\S]*?)(?=\n## |\n---|$)/);
  if (!match) return '';
  return match[1].trim().replace(/\r?\n+/g, ' ');
}