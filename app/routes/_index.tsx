import type { Route } from "./+types/_index";
import { Welcome } from "../welcome/welcome";
import { valueFromExpressContext } from "~/context";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Smart Lang Teacher" },
    { name: "description", content: "Your personalized language tutor" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.get(valueFromExpressContext) };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return <Welcome message={loaderData.message} />;
}
