# TeraBox Player

A minimal web app that lets users paste a TeraBox share link and play the video directly in the browser **without ads and redirects**.

## How It Works

```
1. User pastes TeraBox share link
   ↓
2. App extracts short code from URL
   ↓
3. App visits share page → extracts jsToken + bootstrap cookies
   ↓
4. App calls TeraBox internal API → gets file metadata + download link
   ↓
5. Browser streams video directly from CDN (MP4)
```

## Supported Domains

- `terabox.com`
- `terasharefile.com`
- `1024tera.com`
- `teraboxapp.com`
- `1024terabox.com`
- `terashare.com`
- `terabytez.com`
- `terabits.io`
- `teradrive.com`

## Getting Started

### 1. Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000

### 2. Paste a TeraBox link (optional: add session cookie first)

If you get an error about "verify_v2 required", see [README_COOKIE.md](README_COOKIE.md) to add a session cookie to `.env.local`.

## Environment Variables

Add these to `.env.local`:

```
# Only needed if you get "errno 400210" (verify_v2 required)
# See README_COOKIE.md for how to extract this
TERABOX_COOKIE=""

# Optional: proxy through a third-party resolver
TERABOX_RESOLVER_API=""
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| "verify_v2 required" | Add `TERABOX_COOKIE` — see [README_COOKIE.md](README_COOKIE.md) |
| "No files found" | Link might be expired or doesn't exist |
| Cannot connect | Try a different domain or set `TERABOX_COOKIE` |

## How to Get Your Session Cookie

See [README_COOKIE.md](README_COOKIE.md) for step-by-step instructions.

---

This is a [Next.js](https://nextjs.org) project. Learn more at [nextjs.org](https://nextjs.org/docs).
