import type { Route } from "./+types/about";
import Nav from "../components/Nav";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "About — Smart Lang Teacher" },
    { name: "description", content: "About Smart Lang Teacher." },
  ];
}

export default function About() {
  return (
    <main className="pk-wrap">
      <Nav />
      <div className="pk-card pk-card--tilt">
        <span className="pk-pin">About</span>
        <h1 className="pk-h1">Smart Lang Teacher 🎙️</h1>
        <p className="pk-lead">
          A conversational language tutor that listens to you speak, transcribes
          what you say, and coaches you toward fluency one conversation at a time.
        </p>
        <p className="pk-lead">
          It tracks the skills you're working on, gently corrects mistakes, and
          adapts its prompts to your level and interests so practice always feels
          relevant.
        </p>
      </div>
    </main>
  );
}
