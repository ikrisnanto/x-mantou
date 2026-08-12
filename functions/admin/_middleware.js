import { verifyAccess } from '../../shared/access.js';

/* Gates the /admin page itself.
 *
 * The API routes verify the Access session independently, so this is defence in
 * depth rather than the only lock — but there is no reason to serve the editor
 * UI to anyone who is not signed in.
 *
 * Until ACCESS_TEAM_DOMAIN and ACCESS_AUD are set this returns 503 for everyone,
 * including the owner. That is deliberate: an unconfigured deployment should be
 * closed, not open.
 */
export async function onRequest(context) {
  const auth = await verifyAccess(context.request, context.env);

  if (!auth.ok) {
    const setup = auth.status === 503;
    return new Response(
      `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin — sign in required</title>
<style>
  :root{color-scheme:light dark}
  body{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       max-width:34rem;margin:14vh auto;padding:0 1.5rem;background:#0A0E14;color:#EDF1F5}
  @media (prefers-color-scheme:light){body{background:#F5F7FA;color:#10151B}}
  h1{font-size:1.3rem;margin:0 0 .6rem}
  p{color:#93A1B0;margin:.6rem 0}
  code{font-size:.85em}
  a{color:#3987e5}
</style>
<h1>${setup ? 'Admin area not configured yet' : 'Sign in required'}</h1>
<p>${
  setup
    ? 'This deployment has no Cloudflare Access application in front of it yet, so the admin area is closed to everyone. Set <code>ACCESS_TEAM_DOMAIN</code> and <code>ACCESS_AUD</code> on the Pages project, then redeploy.'
    : 'This area is restricted. Sign in through Cloudflare Access to continue.'
}</p>
<p><a href="/">Back to the dashboard</a></p>`,
      {
        status: auth.status,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      }
    );
  }

  return context.next();
}
