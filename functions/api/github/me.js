import { getSessionFromRequest } from "../../lib/cookie.js";

export async function onRequestGet({ request, env }) {
  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  return Response.json({ authenticated: true, login: session.login, avatarUrl: session.avatarUrl });
}
