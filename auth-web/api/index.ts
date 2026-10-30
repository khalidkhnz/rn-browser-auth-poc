import type { IncomingMessage, ServerResponse } from 'node:http';

const CALLBACK_URL = 'myapp://auth/callback';
// Hardcoded on purpose. See "Security" in the README.
const MOCK_CODE = 'demo123';

const LOGIN_PAGE = (query: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mock Login</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 360px; margin: 64px auto; padding: 0 16px; }
      button { display: block; width: 100%; padding: 14px; margin-top: 12px; font-size: 16px; border-radius: 8px; border: 1px solid #1a1a1a; }
      .primary { background: #1a1a1a; color: #fff; }
      .secondary { background: #fff; color: #1a1a1a; }
      .notice { color: #a33; font-size: 14px; }
    </style>
  </head>
  <body>
    <h1>Mock Login</h1>
    <p class="notice">Demo only. No credentials are checked and the code is hardcoded.</p>
    <form method="post" action="/approve${query}"><button class="primary">Mock Login</button></form>
    <form method="post" action="/cancel${query}"><button class="secondary">Cancel</button></form>
  </body>
</html>`;

// LiveContainer guests can't receive their own scheme: iOS only knows livecontainer://.
function callbackLocation(callback: string, viaLiveContainer: boolean) {
  if (!viaLiveContainer) return callback;
  return `livecontainer://open-url?url=${encodeURIComponent(btoa(callback))}`;
}

function redirect(res: ServerResponse, location: string) {
  res.writeHead(302, { Location: location });
  res.end();
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const viaLiveContainer = url.searchParams.get('via') === 'livecontainer';
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /' || route === 'GET /login') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(LOGIN_PAGE(viaLiveContainer ? '?via=livecontainer' : ''));
  } else if (route === 'POST /approve') {
    redirect(res, callbackLocation(`${CALLBACK_URL}?code=${MOCK_CODE}`, viaLiveContainer));
  } else if (route === 'POST /cancel') {
    redirect(res, callbackLocation(`${CALLBACK_URL}?error=access_denied`, viaLiveContainer));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}
