import { useMemo } from "react";

interface Range {
  start: number;
  end: number;
}

/**
 * Find every (case-insensitive) occurrence of each snippet in `text` and merge
 * overlapping/adjacent hits into a flat, sorted list of ranges. Snippets that
 * don't appear verbatim (e.g. the model paraphrased) simply don't match, so the
 * transcript still renders — just without that highlight.
 */
function highlightRanges(text: string, snippets: string[]): Range[] {
  const haystack = text.toLowerCase();
  const ranges: Range[] = [];
  for (const raw of snippets) {
    const snip = raw.trim();
    if (!snip) continue;
    const needle = snip.toLowerCase();
    let from = 0;
    for (;;) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + needle.length });
      from = idx + needle.length;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/** Renders `text`, wrapping the parts matching any `snippets` in a highlighter mark. */
export default function HighlightedText({
  text,
  snippets,
}: {
  text: string;
  snippets: string[];
}) {
  const ranges = useMemo(() => highlightRanges(text, snippets), [text, snippets]);
  if (ranges.length === 0) return <>{text}</>;

  const out: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (cursor < r.start) out.push(text.slice(cursor, r.start));
    out.push(
      <mark key={i} className="pk-mark">
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}
