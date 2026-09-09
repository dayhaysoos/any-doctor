export function normalize(value: string): string {
  const cleaned = value.trim().toLowerCase();
  return cleaned.replace(/\s+/g, "_");
}
