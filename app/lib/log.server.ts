/** A scoped, elapsed-time logger for tracing a single request/turn on the server. */
export type StageLogger = (event: string, detail?: Record<string, unknown>) => void;

export function createLogger(scope: string): StageLogger {
  const start = Date.now();
  return (event, detail) => {
    const ms = String(Date.now() - start).padStart(5, " ");
    const extra = detail ? " " + JSON.stringify(detail) : "";
    console.log(`[parla] +${ms}ms ${scope} · ${event}${extra}`);
  };
}
