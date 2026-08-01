import { serializeCookie } from "../../../lib/cookie.js";

export async function onRequestPost() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin/news",
      "Set-Cookie": serializeCookie("gh_session", "", { maxAge: 0 }),
    },
  });
}
