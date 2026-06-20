import type { Route } from "./+types/session.progress";
import { getUserId } from "../lib/session.server";
import { getProgress, PROGRESS_TOTAL } from "../lib/progress.server";

const EMPTY = { step: 0, total: PROGRESS_TOTAL, label: null as string | null };

/**
 * Resource route (no component) — returns plain JSON the client polls while a
 * turn runs. Returning a real `Response` bypasses single-fetch encoding so a
 * direct `fetch()` gets JSON, not a turbo-stream payload.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (!userId) return Response.json(EMPTY, { status: 401 });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const progress = token ? getProgress(token) : null;
  return Response.json(progress ?? EMPTY);
}
