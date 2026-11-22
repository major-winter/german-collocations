// The collocation queries return one row per example sentence (or one row
// with null example fields when there is none), because the examples come
// from a LATERAL or LEFT join. This folds such rows back into one item per
// key, examples attached, keeping the rows' order. Decision #68: the row
// shape is a storage detail, so the adapter undoes it before anything
// crosses the CollocationStore port.
export function foldRows<Row, Item extends { examples: Example[] }, Example>(
  rows: Row[],
  keyOf: (row: Row) => string,
  itemOf: (row: Row) => Item,
  exampleOf: (row: Row) => Example | null,
): Item[] {
  const items = new Map<string, Item>();
  for (const row of rows) {
    const key = keyOf(row);
    let item = items.get(key);
    if (!item) {
      item = itemOf(row);
      items.set(key, item);
    }
    const example = exampleOf(row);
    if (example) item.examples.push(example);
  }
  return Array.from(items.values());
}
