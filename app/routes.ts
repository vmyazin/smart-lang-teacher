import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("session", "routes/session.tsx"),
  route("session/progress", "routes/session.progress.tsx"),
  route("audio/:name", "routes/audio.tsx"),
] satisfies RouteConfig;
