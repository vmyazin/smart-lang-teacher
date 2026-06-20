/** Final path segment, handling both "/" and "\" — pure and browser-safe (no node:path). */
export function fileBasename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}
