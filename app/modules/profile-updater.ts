import type { Issue, Severity, SkillItem, SkillStatus } from "../domain/types";

const SEVERITY_ORDER: Severity[] = ["low", "medium", "high"];
const STATUS_NEXT: Record<SkillStatus, SkillStatus> = {
  active: "improving",
  improving: "mastered",
  mastered: "mastered",
};

export function reviewIntervalDays(occurrences: number): number {
  const ramp = [1, 3, 7, 16, 35];
  return ramp[Math.min(Math.max(occurrences, 1) - 1, ramp.length - 1)];
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

function addDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export function issueKey(issue: Issue): string {
  const tail = (issue.tags[0] ?? issue.snippet).toLowerCase();
  return `${issue.dimension}:${tail}`;
}

function itemKey(item: SkillItem): string {
  return `${item.category}:${item.label.toLowerCase()}`;
}

export function updateProfile(
  items: SkillItem[],
  issues: Issue[],
  now: Date,
): SkillItem[] {
  const nowIso = now.toISOString();
  const byKey = new Map<string, SkillItem>();
  for (const it of items) byKey.set(itemKey(it), { ...it });
  const touched = new Set<string>();

  for (const issue of issues) {
    const key = issueKey(issue);
    touched.add(key);
    const existing = byKey.get(key);
    if (existing) {
      const occurrences = existing.occurrences + 1;
      byKey.set(key, {
        ...existing,
        description: issue.explanation,
        severity: maxSeverity(existing.severity, issue.severity),
        occurrences,
        last_seen: nowIso,
        status: "active",
        next_review_at: addDays(now, reviewIntervalDays(occurrences)),
      });
    } else {
      byKey.set(key, {
        id: 0,
        user_id: items[0]?.user_id ?? 0,
        category: issue.dimension,
        label: issue.tags[0] ?? issue.snippet,
        description: issue.explanation,
        severity: issue.severity,
        occurrences: 1,
        first_seen: nowIso,
        last_seen: nowIso,
        status: "active",
        next_review_at: addDays(now, reviewIntervalDays(1)),
      });
    }
  }

  for (const [key, item] of byKey) {
    if (touched.has(key)) continue;
    if (new Date(item.next_review_at).getTime() <= now.getTime()) {
      byKey.set(key, {
        ...item,
        status: STATUS_NEXT[item.status],
        next_review_at: addDays(now, reviewIntervalDays(item.occurrences)),
      });
    }
  }

  return [...byKey.values()];
}
