/** Query joins may return a single object or an array depending on inference */
export function unwrapRelation<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

export function servicePrice(services: unknown): number {
  const s = unwrapRelation(services as { price?: number } | { price?: number }[] | null);
  return Number(s?.price ?? 0);
}
