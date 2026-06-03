const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function sparkline(values = [], { min = null, max = null } = {}) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return "";
  const lo = min ?? Math.min(...nums);
  const hi = max ?? Math.max(...nums);
  const span = Math.max(1, hi - lo);
  return nums
    .map((value) => {
      const index = Math.max(0, Math.min(BLOCKS.length - 1, Math.round(((value - lo) / span) * (BLOCKS.length - 1))));
      return BLOCKS[index];
    })
    .join("");
}
