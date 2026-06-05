# How to Get Your TeraBox Cookies

The Cloudflare Worker needs at minimum **one** cookie: `ndus`. The other TeraBox cookies (`browserid`, `ndut_fmt`, `ndut_fmv`, `csrfToken`) are either fetched dynamically by the worker or are not enforced by the API endpoints we use.

## When You Need It

You'll see one of these errors if your session is missing or expired:

```
TeraBox errno 400141 on ...: TeraBox session needs verification. Open
https://dm.1024tera.com in a browser, complete the CAPTCHA/SMS
verification, then re-extract the cookies and update .env.local.

TeraBox errno 400210 on ...: TeraBox verify_v2 required. The cookies in
.env.local have aged out — log in to TeraBox in a browser and re-extract.
```

## What's Actually Required

| Cookie          | Required? | Where it comes from                                              |
| --------------- | --------- | ---------------------------------------------------------------- |
| `ndus`          | **Yes**   | You — from a logged-in TeraBox browser session                   |
| `browserid`     | No        | Worker fetches it on every session request from the share page   |
| `ndut_fmt`      | No        | Not enforced by the API endpoints we use                          |
| `ndut_fmv`      | No        | Not enforced by the API endpoints we use                          |
| `csrfToken`     | No        | Not enforced by the API endpoints we use                          |

So the minimum `.env.local` looks like:

```bash
TERABOX_WORKER_URL=https://your-worker.your-subdomain.workers.dev
TERABOX_NDUS=your_ndus_value_here
```

## Steps to Get the Cookie

### 1. Log in to TeraBox in a browser
- Go to https://www.terabox.com (or https://dm.1024tera.com)
- Click **Login** → **Continue with Google** (or Facebook)
- Complete the OAuth flow

### 2. Open DevTools and extract the `ndus` cookie
- Press `F12` to open Developer Tools
- Go to **Application** → **Cookies** → **`https://dm.1024tera.com`** (the API host, not the web host)
- Find the `ndus` cookie and copy its value
  - It looks like `YSUCgBNpeHuiQmtO2YHamfRgkGLnLDKWbG5XrOlT`

> The API host is `dm.1024tera.com`, not the share page host. Make sure you select the right domain in the Cookies list, or you'll be looking at empty session cookies.

### 3. Add to `.env.local`
```bash
TERABOX_WORKER_URL=https://your-worker.your-subdomain.workers.dev
TERABOX_NDUS=your_ndus_value_here
```

**Do NOT commit this file to git.** It should already be in `.gitignore`.

### 4. Restart your dev server
```bash
npm run dev
```

## When `ndus` Stops Working

TeraBox sessions typically last a few days. When you see `errno 400141` or `errno 400210`:

1. Open https://dm.1024tera.com in your browser
2. If TeraBox shows a verification prompt (CAPTCHA / SMS), complete it
3. Re-extract the `ndus` cookie from DevTools
4. Update `.env.local`
5. Restart `npm run dev`

If the verification prompt keeps appearing immediately, TeraBox may be flagging your account. Wait a few hours, or try a different TeraBox account (sign in with a different Google account).

## Cookie Rotation (Optional - for production scale)

If you're running a high-volume resolver, maintain a pool of 5–10 guest sessions and rotate them. With only `ndus` required, rotation is simple:

```typescript
const cookies = ["ndus=cookie1", "ndus=cookie2", "ndus=cookie3"];
// Pick a random cookie on each request, rotate if you get errno 400141/400210
```

Refresh the pool weekly via headless browser login.

## Troubleshooting

| Error                        | Solution                                                |
| ---------------------------- | ------------------------------------------------------- |
| `errno 400141 need verify`   | TeraBox wants CAPTCHA verification. Open in browser, verify, re-extract `ndus`. |
| `errno 400210 verify_v2`     | Same as above but stronger verification (SMS/email).    |
| `errno 2 / 110 / 111`        | Rate limit hit. The worker's edge cache should help.    |
| `Worker error: fetch failed` | The worker can't reach TeraBox. Check Cloudflare logs.  |
| `Missing TERABOX_WORKER_URL` | Add it to `.env.local`.                                 |
