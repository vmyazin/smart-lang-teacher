import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("session", "routes/session.tsx"),
  route("session/progress", "routes/session.progress.tsx"),
  route("audio/:name", "routes/audio.tsx"),
  route("profile", "routes/profile.tsx"),
  route("settings/keys", "routes/settings.keys.tsx"),
  route("history", "routes/history.tsx"),
  route("history/:turnId", "routes/history.turn.tsx"),
  route("about", "routes/about.tsx"),
] satisfies RouteConfig;
