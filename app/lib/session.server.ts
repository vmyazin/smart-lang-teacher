import { createCookieSessionStorage, redirect } from "react-router";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return "dev-secret-change-me";
}

const storage = createCookieSessionStorage({
  cookie: {
    name: "slt_session",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secrets: [sessionSecret()],
  },
});

export async function getUserId(request: Request): Promise<number | null> {
  const session = await storage.getSession(request.headers.get("Cookie"));
  const id = session.get("userId");
  return typeof id === "number" ? id : null;
}

export async function createUserSession(userId: number, redirectTo: string) {
  const session = await storage.getSession();
  session.set("userId", userId);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await storage.commitSession(session) },
  });
}

export async function logout(request: Request) {
  const session = await storage.getSession(request.headers.get("Cookie"));
  return redirect("/", {
    headers: { "Set-Cookie": await storage.destroySession(session) },
  });
}
