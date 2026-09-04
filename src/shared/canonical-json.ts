/** Stable JSON for content hashes, including values round-tripped through JSONB. */
export function canonicalJson(value: unknown): string {
  const normalized = JSON.parse(JSON.stringify(value));
  const order = (item: any): any => Array.isArray(item) ? item.map(order) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, order(item[key])])) : item;
  return JSON.stringify(order(normalized));
}
