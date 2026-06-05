# How to Get Your TERABOX_COOKIE

The `TERABOX_COOKIE` environment variable is **only needed if TeraBox returns `errno 400210`** (verify_v2 required). For most public share links, the app works without it.

## When You Need It

You'll see this error if you hit a share that requires authentication:

```
Error: verify_v2 required: Please set TERABOX_COOKIE in your .env.local with a valid BDUSS session token
```

## Steps to Get the Cookie

### 1. Log in to TeraBox (or create a guest account)
- Go to https://www.terabox.com
- Sign up / log in

### 2. Open DevTools and extract the cookie
- Press `F12` to open Developer Tools
- Go to **Application** → **Cookies** → **https://www.terabox.com**
- Copy these values (at minimum, you need `BDUSS`):
  - `BDUSS` ← **most important**
  - `BAIDUID`
  - `ndus`
  - `csrfToken`

### 3. Format as a single string
Combine them separated by `; `:

```
BDUSS=your_bduss_value_here; BAIDUID=your_baiduid_value; ndus=your_ndus_value; csrfToken=your_csrf_value
```

### 4. Add to `.env.local`
Create or edit `.env.local` in your project root:

```
TERABOX_COOKIE="BDUSS=your_value; BAIDUID=your_value; ndus=your_value; csrfToken=your_value"
```

**Do NOT commit this file to git.** Add to `.gitignore` if not already there.

### 5. Restart your dev server
```bash
npm run dev
```

## Example

```
# .env.local
TERABOX_COOKIE="BDUSS=CNQzQzVGRkE4MTQzODEzMjZEM0RGEjExMzI0MjI=; BAIDUID=8F8F8F8F8F8F8F8F; ndus=Dl3xOjJiN; csrfToken=abc123def456"
```

## Cookie Rotation (Optional - for production scale)

If you're running a high-volume resolver, maintain a pool of 5–10 guest sessions and rotate them:

```typescript
const cookies = [
  "BDUSS=cookie1; ...",
  "BDUSS=cookie2; ...",
  "BDUSS=cookie3; ...",
];

// On each request, pick a random cookie and rotate if you get errno:2 or errno:429
```

Refresh cookies weekly via headless browser login.

## Troubleshooting

- **"Invalid session"** → Cookie has expired. Get a fresh one.
- **"Still getting verify_v2"** → Make sure `BDUSS` is the most recent one (cookies expire).
- **"Cookie not being used"** → Restart the dev server after adding `.env.local`.

