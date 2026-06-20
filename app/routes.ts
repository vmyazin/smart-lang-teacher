import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("session", "routes/session.tsx"),
] satisfies RouteConfig;
