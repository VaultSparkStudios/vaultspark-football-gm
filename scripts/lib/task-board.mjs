const STATUS_MAP = [
  { pattern: /✅|done|complete|shipped/i, status: "done" },
  { pattern: /🔄|in progress|active/i, status: "unblocked" },
  { pattern: /🔜|next sprint|todo|planned|open/i, status: "unblocked" },
  { pattern: /blocked|waiting|human action|required|founder/i, status: "human-blocked" }
];

function cleanMarkdown(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function classifyStatus(value = "") {
  const text = cleanMarkdown(value);
  const match = STATUS_MAP.find((entry) => entry.pattern.test(text));
  return match?.status || "unblocked";
}

function parseTableRows(markdown = "") {
  const rows = [];
  let currentHeading = "General";
  for (const rawLine of markdown.split(/\r?\n/)) {
    const heading = rawLine.match(/^#{2,4}\s+(.+)/);
    if (heading) {
      currentHeading = cleanMarkdown(heading[1]);
      continue;
    }
    if (!/^\|/.test(rawLine) || /^\|\s*-/.test(rawLine) || /Item\s*\|\s*Status/i.test(rawLine)) continue;
    const cells = rawLine.split("|").slice(1, -1).map(cleanMarkdown);
    if (cells.length < 2) continue;
    const [maybeRank, maybeTitle, maybeStatus] = cells.length >= 3 ? cells : ["", cells[0], cells[1]];
    const title = maybeTitle || maybeRank;
    if (!title || /^#$/i.test(title) || /^item$/i.test(title)) continue;
    rows.push({
      rank: Number.parseInt(maybeRank, 10) || rows.length + 1,
      category: currentHeading,
      title,
      description: "",
      statusText: maybeStatus || "",
      status: classifyStatus(maybeStatus || title)
    });
  }
  return rows;
}

function parseChecklistRows(markdown = "") {
  const rows = [];
  let currentHeading = "General";
  for (const rawLine of markdown.split(/\r?\n/)) {
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
      category: currentHeading,
      title: cleanMarkdown(title),
      description: cleanMarkdown(rest.join(" - ")),
      statusText: item[1].toLowerCase() === "x" ? "Done" : "Open",
      status: item[1].toLowerCase() === "x" ? "done" : classifyStatus(`${currentHeading} ${text}`)
    });
  }
  return rows;
}

export function parseUnifiedItems(markdown = "") {
  const items = [...parseTableRows(markdown), ...parseChecklistRows(markdown)];
  return items.map((item, index) => ({
    ...item,
    id: item.id || `task-${String(index + 1).padStart(3, "0")}`,
    rank: item.rank || index + 1
  }));
}

export function parseHumanItems(markdown = "") {
  return parseUnifiedItems(markdown).filter((item) => {
    if (item.status === "done") return false;
    return item.status === "human-blocked" || /founder|secret|dashboard|billing|signup/i.test(`${item.title} ${item.description}`);
  });
}
