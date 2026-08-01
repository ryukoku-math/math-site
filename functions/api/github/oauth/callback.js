import { exchangeCodeForToken, getAuthenticatedUser } from "../../../lib/github-client.js";
import { parseCookies, serializeCookie, signSession } from "../../../lib/cookie.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request.headers.get("Cookie"));
  const clearStateCookie = serializeCookie("gh_oauth_state", "", { maxAge: 0 });

  if (!code || !state || !cookies.gh_oauth_state || state !== cookies.gh_oauth_state) {
    return new Response("Invalid OAuth state — please try logging in again.", {
      status: 400,
      headers: { "Set-Cookie": clearStateCookie },
    });
  }

  const redirectUri = `${url.origin}/api/github/oauth/callback`;

  let token;
  try {
    token = await exchangeCodeForToken({
      clientId: env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirectUri,
    });
  } catch (err) {
    return new Response(`GitHub OAuth exchange failed: ${err.message}`, {
      status: 400,
      headers: { "Set-Cookie": clearStateCookie },
    });
  }

  const user = await getAuthenticatedUser(token);
  if (!user) {
    return new Response("Failed to fetch the authenticated GitHub user.", {
      status: 502,
      headers: { "Set-Cookie": clearStateCookie },
    });
  }

  const session = await signSession(
    { token, login: user.login, avatarUrl: user.avatarUrl, iat: Date.now() },
    env.SESSION_COOKIE_SECRET,
  );

  const headers = new Headers();
  headers.append("Location", "/admin/news");
  headers.append("Set-Cookie", clearStateCookie);
  headers.append("Set-Cookie", serializeCookie("gh_session", session, { maxAge: 60 * 60 * 24 * 30 }));

  return new Response(null, { status: 302, headers });
}
