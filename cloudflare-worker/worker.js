/**
 * TeraLink — Cloudflare Worker
 *
 * Endpoints:
 *   GET  /resolve?code=xxx              — Resolves share URL, returns dlink + fast_stream_url
 *   GET  /stream?url=<b64>&cookies=<b64> — HLS/segment proxy with Cookie + Range forwarding
 *   GET  /fast_stream?code=xxx          — Synthetic full-video M3U8 built from dlink byte-ranges
 *   GET  /segment?url=<b64>&cookies=<b64>&range=<start>-<end> — Byte-range segment proxy
 *
 * Sign algorithm: HMAC-SHA1("iuuPc64E4Fhn0rTXEzrnbLph0o5qyEEa", clienttype + channel + browserid + timestamp)
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const SIGN_KEY = 'iuuPc64E4Fhn0rTXEzrnbLph0o5qyEEa';
const CLIENTTYPE = '0';
const CHANNEL = 'dubox';

const DOMAINS = [
  'dm.1024tera.com',
  'www.1024tera.com',
  'www.terabox.app',
  'www.mirrobox.com',
  'www.nephobox.com',
  'momerybox.com',
  'terabox.fun',
  'freeterabox.com',
  '4funbox.com',
  'www.terabox.com',
];

// Approximate bytes per second at each quality level
// Used to decide chunk size when we don't know exact segment length
const BYTES_PER_CHUNK = 4 * 1024 * 1024; // 4 MB per segment ≈ ~10s at 360p

// ── Crypto ────────────────────────────────────────────────────────────────────

async function hmacSha1(key, message) {
  const keyData = new TextEncoder().encode(key);
  const msgData = new TextEncoder().encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Encoding ──────────────────────────────────────────────────────────────────

function b64Encode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64Decode(str) {
  try {
    return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return decodeURIComponent(str);
  }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

function parseCookies(setCookieHeaders) {
  return setCookieHeaders.map(c => c.split(';')[0]).join('; ');
}

function getCookieValue(cookieStr, name) {
  const match = cookieStr.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? match[1] : '';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isVideo(filename) {
  return /\.(mp4|mkv|webm|avi|mov|flv|m4v|ts|3gp)$/i.test(filename);
}
function isAudio(filename) {
  return /\.(mp3|aac|ogg|flac|wav|m4a|opus)$/i.test(filename);
}
function isImage(filename) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename);
}

function formatSize(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes, i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(2)} ${units[i]}`;
}

function mapFile(f) {
  return {
    fs_id:     String(f.fs_id ?? ''),
    filename:  f.server_filename || f.filename || '',
    size:      Number(f.size) || 0,
    md5:       f.md5 || '',
    dlink:     f.dlink || '',
    thumbnail: f.thumbs?.url3 || f.thumbs?.url2 || null,
    isDir:     f.isdir === '1' || f.isdir === 1,
    path:      f.path || '',
  };
}

function extractJsToken(html) {
  const evalMatch = html.match(/decodeURIComponent\(`([^`]+)`\)/);
  if (evalMatch) {
    try {
      const decoded = decodeURIComponent(evalMatch[1]);
      const tok = decoded.match(/fn\("([A-F0-9a-f]+)"\)/i);
      if (tok) return tok[1];
    } catch {}
  }
  const plain = html.match(/jsToken["'\s:=]+["']([A-F0-9a-f]{20,})["']/i);
  return plain ? plain[1] : '';
}

function extractBdstoken(html) {
  const m = html.match(/bdstoken["'\s:=]+["']([a-f0-9]{32})["']/i);
  return m ? m[1] : '';
}

function mergeCookieStrings(baseStr, overrideStr) {
  const map = new Map();
  const parse = (str) => {
    if (!str) return;
    str.split(';').forEach(p => {
      const part = p.trim();
      if (!part) return;
      const eq = part.indexOf('=');
      if (eq > 0) {
        map.set(part.substring(0, eq).trim(), part.substring(eq + 1).trim());
      }
    });
  };
  parse(baseStr);
  parse(overrideStr);
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── Guest session ─────────────────────────────────────────────────────────────

async function getSession(domain, shortCode, premiumCookies = '') {
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (premiumCookies) {
    headers['Cookie'] = premiumCookies;
  }

  const resp = await fetch(`https://${domain}/sharing/link?surl=${shortCode}`, {
    headers,
    signal: AbortSignal.timeout(12000),
  });
  const setCookies = resp.headers.getSetCookie?.() ?? [];
  const cookies = parseCookies(setCookies);
  const html = await resp.text();
  const jsToken = extractJsToken(html);
  const bdstoken = extractBdstoken(html);
  const browserid = getCookieValue(cookies, 'browserid');
  return { cookies, jsToken, bdstoken, browserid, domain };
}

// ── File list via /api/shorturlinfo ───────────────────────────────────────────

async function callShorturlinfo(domain, shortCode, jsToken, cookies, dir = '') {
  // If shortCode starts with '1' and has length 23 (1 + 22 char key),
  // strip the leading '1' to get the raw shortCode.
  // TeraBox's /share/list requires the raw shortCode (without '1' prefix),
  // whereas /api/shorturlinfo accepts or expects the prefix.
  const rawShortCode = (shortCode.startsWith('1') && shortCode.length === 23)
    ? shortCode.substring(1)
    : shortCode;

  // If dir is specified (subfolder traversal), query /share/list directly
  // since /api/shorturlinfo does not return contents for subfolders.
  if (dir) {
    const listParams = new URLSearchParams({
      app_id: '250528', web: '1', clienttype: CLIENTTYPE,
      channel: CHANNEL, clientfrom: 'h5',
      shorturl: rawShortCode, root: '0', scene: '',
      page: '1', num: '20', by: 'name', order: 'asc',
      jsToken: jsToken || '',
      dir,
    });
    const listQueryString = listParams.toString().replace(/\+/g, '%20');
    const listResp = await fetch(`https://${domain}/share/list?${listQueryString}`, {
      headers: {
        'User-Agent': UA,
        'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(12000),
    });
    const listJson = await listResp.json();
    if (listJson.errno) throw new Error(`errno ${listJson.errno} on ${domain}`);
    if (!listJson.list?.length) throw new Error('empty list');
    return {
      list: listJson.list,
      shareid: listJson.shareid ?? listJson.share_id,
      uk: listJson.uk,
      shareInfo: listJson.share_info,
    };
  }

  // Otherwise (root folder query), try /api/shorturlinfo first
  const surlVariants = ['1' + shortCode, shortCode];
  for (const shorturl of surlVariants) {
    const params = new URLSearchParams({
      app_id: '250528', web: '1', clienttype: CLIENTTYPE,
      channel: CHANNEL, clientfrom: 'h5',
      shorturl, root: '1', scene: '',
      jsToken: jsToken || '',
    });
    const queryString = params.toString().replace(/\+/g, '%20');
    const resp = await fetch(`https://${domain}/api/shorturlinfo?${queryString}`, {
      headers: {
        'User-Agent': UA,
        'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(12000),
    });
    const json = await resp.json();
    if (!json.errno && json.list?.length) return json;
  }

  // Fallback for root folder: use /share/list
  const listParams = new URLSearchParams({
    app_id: '250528', web: '1', clienttype: CLIENTTYPE,
    channel: CHANNEL, clientfrom: 'h5',
    shorturl: rawShortCode, root: '1', scene: '',
    page: '1', num: '20', by: 'name', order: 'asc',
    jsToken: jsToken || '',
  });
  const listQueryString = listParams.toString().replace(/\+/g, '%20');
  const listResp = await fetch(`https://${domain}/share/list?${listQueryString}`, {
    headers: {
      'User-Agent': UA,
      'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookies,
    },
    signal: AbortSignal.timeout(12000),
  });
  const listJson = await listResp.json();
  if (listJson.errno) throw new Error(`errno ${listJson.errno} on ${domain}`);
  if (!listJson.list?.length) throw new Error('empty list');
  return {
    list: listJson.list,
    shareid: listJson.shareid ?? listJson.share_id,
    uk: listJson.uk,
    shareInfo: listJson.share_info,
  };
}

// ── Get dlink with authentication ─────────────────────────────────────────────
// TeraBox requires bdstoken (extracted from the sharing page HTML) + ndus cookie
// for /share/download to work.

async function getDlink(domain, fsId, uk, shareId, shortCode, jsToken, bdstoken, cookies) {
  // Call /share/download with bdstoken from page HTML
  const dlParams = new URLSearchParams({
    app_id: '250528', web: '1', clienttype: CLIENTTYPE,
    channel: CHANNEL, clientfrom: 'h5',
    jsToken: jsToken || '',
    fid_list: JSON.stringify([Number(fsId)]),
    uk, shareid: shareId,
  });
  if (bdstoken) dlParams.set('bdstoken', bdstoken);

  const dlResp = await fetch(`https://${domain}/share/download?${dlParams}`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': `https://${domain}`,
    },
    signal: AbortSignal.timeout(12000),
  });

  try {
    const j = await dlResp.json();
    console.log(`[worker] share/download errno: ${j.errno} on ${domain}`);
    if (j.list?.[0]?.dlink) return j.list[0].dlink;
    if (j.dlink) return j.dlink;
  } catch {}

  // Fallback — /api/filemetas
  try {
    const fmParams = new URLSearchParams({
      app_id: '250528', web: '1', clienttype: CLIENTTYPE,
      channel: CHANNEL, clientfrom: 'h5',
      target: JSON.stringify([`/0/${fsId}`]),
      dlink: '1', jsToken: jsToken || '',
    });
    const fmResp = await fetch(`https://${domain}/api/filemetas?${fmParams}`, {
      headers: {
        'User-Agent': UA,
        'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(12000),
    });
    const fmJson = await fmResp.json();
    if (!fmJson.errno && fmJson.info?.[0]?.dlink) return fmJson.info[0].dlink;
  } catch {}

  return '';
}

// ── Resolve actual CDN download link (follow redirects) ───────────────────────

async function resolveRedirect(dlink, cookies) {
  if (!dlink) return '';
  // Follow redirect to get the real CDN URL with valid signed params
  try {
    const resp = await fetch(dlink, {
      method: 'HEAD',
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.1024tera.com/',
        'Cookie': cookies,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });

    // If redirect, grab the location
    if (resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) {
      return resp.headers.get('location') || dlink;
    }

    // If 200 or 206, the dlink itself is the real CDN URL
    if (resp.ok || resp.status === 206) return dlink;
  } catch (e) {
    console.log('[redirect] Failed to follow dlink redirect:', e?.message);
  }

  return dlink;
}

// ── Get file size from CDN URL ────────────────────────────────────────────────

async function getFileSize(cdnUrl, cookies) {
  try {
    const resp = await fetch(cdnUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.1024tera.com/',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(10000),
    });
    const cl = resp.headers.get('content-length');
    if (cl) return parseInt(cl, 10);
    // If HEAD doesn't return content-length, try with Range
    const r = await fetch(cdnUrl, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.1024tera.com/',
        'Cookie': cookies,
        'Range': 'bytes=0-0',
      },
      signal: AbortSignal.timeout(10000),
    });
    const cr = r.headers.get('content-range');
    if (cr) {
      const m = cr.match(/\/(\d+)$/);
      if (m) return parseInt(m[1], 10);
    }
  } catch (e) {
    console.log('[size] Failed to get file size:', e?.message);
  }
  return 0;
}

// ── Generate synthetic M3U8 from byte ranges ──────────────────────────────────

function buildM3U8(workerBase, encodedUrl, encodedCookies, fileSize, filename) {
  const chunkSize = BYTES_PER_CHUNK;
  const segments = [];
  let offset = 0;

  while (offset < fileSize) {
    const end = Math.min(offset + chunkSize - 1, fileSize - 1);
    segments.push({ start: offset, end });
    offset = end + 1;
  }

  const duration = 10; // nominal segment duration for player compatibility
  const lines = [
    '#EXTM3U',
    `#PATH:/${filename}`,
    `#EXT-X-TARGETDURATION:${duration}`,
    '#EXT-X-DISCONTINUITY',
  ];

  for (const seg of segments) {
    const encodedRange = b64Encode(`${seg.start}-${seg.end}`);
    const segUrl = `${workerBase}/segment?url=${encodedUrl}&cookies=${encodedCookies}&range=${encodedRange}`;
    lines.push(`#EXTINF:${duration},`);
    lines.push(segUrl);
  }

  lines.push('#EXT-X-ENDLIST');
  return lines.join('\n');
}

// ── Compute streaming sign ────────────────────────────────────────────────────

async function computeStreamSign(browserid, timestamp) {
  return hmacSha1(SIGN_KEY, CLIENTTYPE + CHANNEL + browserid + timestamp);
}

// ── /share/streaming → HLS m3u8 (30s preview, kept for backwards compat) ──────

async function getStreamingUrl(domain, shareId, uk, fsId, jsToken, browserid, cookies, qualityType = 'M3U8_AUTO_360') {
  const cookieBrowserid = getCookieValue(cookies, 'browserid') || browserid;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = await hmacSha1(SIGN_KEY, CLIENTTYPE + CHANNEL + cookieBrowserid + timestamp);

  const params = new URLSearchParams({
    uk,
    shareid:    shareId,
    fid:        fsId,
    sign,
    timestamp,
    jsToken:    jsToken || '',
    type:       qualityType,
    esl:        '1',
    isplayer:   '1',
    ehps:       '1',
    clienttype: CLIENTTYPE,
    app_id:     '250528',
    web:        '1',
    channel:    CHANNEL,
  });

  const resp = await fetch(`https://${domain}/share/streaming?${params}`, {
    headers: {
      'User-Agent': UA,
      'Referer': `https://${domain}/sharing/link?surl=`,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/plain, */*',
      'Cookie': cookies,
    },
    signal: AbortSignal.timeout(15000),
  });

  const contentType = resp.headers.get('content-type') || '';
  let finalUrl = '';

  if (contentType.includes('mpegurl') || contentType.includes('m3u8')) {
    finalUrl = `https://${domain}/share/streaming?${params}`;
  } else if (contentType.includes('json')) {
    const json = await resp.json();
    if (json.errno) throw new Error(`streaming errno ${json.errno}: ${json.show_msg || ''}`);
    finalUrl = json.m3u8_url || json.url || json.hls_mp4_url;
  } else {
    const text = await resp.text().catch(() => '');
    if (text.startsWith('#EXTM3U')) {
      finalUrl = `https://${domain}/share/streaming?${params}`;
    } else if (text.includes('errno')) {
      const j = JSON.parse(text);
      throw new Error(`streaming errno ${j.errno}: ${j.show_msg || ''}`);
    } else {
      throw new Error(`Unknown streaming response (${resp.status}): ${text.substring(0, 100)}`);
    }
  }

  if (finalUrl) {
    const encodedUrl = b64Encode(finalUrl);
    const encodedCookies = b64Encode(cookies);
    return `/stream?url=${encodedUrl}&cookies=${encodedCookies}`;
  }

  throw new Error('No valid stream URL resolved');
}

// ── Main resolve ──────────────────────────────────────────────────────────────

async function resolveFull(shortCode, auth = {}, workerBase = '', dir = '') {
  console.log(`[worker] Resolving: ${shortCode}`);

  // Construct premium cookies string if provided
  let premCookiesStr = '';
  if (auth && auth.ndus) {
    const premParts = [];
    premParts.push(`ndus=${auth.ndus}`);
    if (auth.ndut_fmt) premParts.push(`ndut_fmt=${auth.ndut_fmt}`);
    if (auth.ndut_fmv) premParts.push(`ndut_fmv=${auth.ndut_fmv}`);
    if (auth.csrf)     premParts.push(`csrfToken=${auth.csrf}`);
    if (auth.browserid) premParts.push(`browserid=${auth.browserid}`);
    premCookiesStr = premParts.join('; ');
  }

  // Step 1: Get guest/premium session from multiple domains in parallel
  const sessionResults = await Promise.allSettled(
    DOMAINS.map(d => getSession(d, shortCode, premCookiesStr))
  );

  let bestCookies = premCookiesStr || '', bestJsToken = '', bestBdstoken = '', bestBrowserid = auth.browserid || '', bestDomain = DOMAINS[0];
  let maxCookiesLen = -1;

  for (const r of sessionResults) {
    if (r.status !== 'fulfilled') continue;
    const { cookies, jsToken, bdstoken, browserid, domain } = r.value;
    
    // Merge guest/session cookies with our premium/base cookies cleanly (deduplicated)
    const merged = mergeCookieStrings(premCookiesStr, cookies);
    
    if (merged.length > maxCookiesLen) {
      bestCookies   = merged;
      bestJsToken   = jsToken || bestJsToken;
      bestBdstoken  = bdstoken || bestBdstoken;
      bestBrowserid = auth.browserid || browserid || bestBrowserid;
      bestDomain    = domain;
      maxCookiesLen = merged.length;
      console.log(`[worker] Best session from ${domain}, bdstoken: ${bdstoken ? 'found' : 'none'}, jsToken: ${jsToken ? 'found' : 'none'}`);
    }
  }

  // Ensure browserid is explicitly set and deduplicated in the final cookies
  if (bestBrowserid) {
    bestCookies = mergeCookieStrings(bestCookies, `browserid=${bestBrowserid}`);
  }

  if (!bestBrowserid && !auth.ndus) {
    return { success: false, error: 'Could not get guest session from any domain.' };
  }

  // Step 2: Get file list
  let files = [], shareId = '', uk = '';

  try {
    const api = await callShorturlinfo(bestDomain, shortCode, bestJsToken, bestCookies, dir);
    files   = (api.list ?? []).map(mapFile);
    shareId = String(api.shareid ?? '');
    uk      = String(api.uk ?? '');
    console.log(`[worker] Got ${files.length} file(s) from bestDomain ${bestDomain}, uk=${uk}, shareid=${shareId}`);
  } catch (err) {
    console.log(`[worker] Failed callShorturlinfo on bestDomain ${bestDomain}: ${err?.message}. Trying fallbacks...`);
    const fallbackDomains = DOMAINS.filter(d => d !== bestDomain);
    const apiResults = await Promise.allSettled(
      fallbackDomains.map(d => callShorturlinfo(d, shortCode, bestJsToken, bestCookies, dir))
    );
    for (const r of apiResults) {
      if (r.status === 'fulfilled') {
        const api = r.value;
        files   = (api.list ?? []).map(mapFile);
        shareId = String(api.shareid ?? '');
        uk      = String(api.uk ?? '');
        console.log(`[worker] Got ${files.length} file(s) from fallback, uk=${uk}, shareid=${shareId}`);
        break;
      }
    }
  }

  if (!files.length) {
    return { success: false, error: 'Could not fetch file list from any domain.' };
  }

  // Step 3: For each video file, get streaming URL + dlink + fast_stream_url
  const qualitiesToFetch = {
    '360': 'M3U8_AUTO_360',
    '480': 'M3U8_AUTO_480',
    '720': 'M3U8_AUTO_720',
    '1080': 'M3U8_AUTO_1080'
  };

  for (const f of files) {
    if (f.isDir) continue;
    f.sizeFormatted = formatSize(f.size);
    f.hlsUrl        = '';
    f.qualities     = {};
    f.fastStreamUrl = '';
    f.dlinkResolved = f.dlink || '';

    // 3a: Try to get authenticated dlink from best domain first
    if (!f.dlink) {
      try {
        const dl = await getDlink(bestDomain, f.fs_id, uk, shareId, shortCode, bestJsToken, bestBdstoken, bestCookies);
        if (dl) {
          f.dlinkResolved = dl;
          console.log(`[worker] Got dlink for ${f.filename} from bestDomain`);
        }
      } catch (err) {
        console.log(`[worker] Failed getDlink on bestDomain: ${err?.message}. Trying fallbacks...`);
        const fallbackDomains = DOMAINS.filter(d => d !== bestDomain);
        const dlinkResults = await Promise.allSettled(
          fallbackDomains.map(d => getDlink(d, f.fs_id, uk, shareId, shortCode, bestJsToken, bestBdstoken, bestCookies))
        );
        for (const r of dlinkResults) {
          if (r.status === 'fulfilled' && r.value) {
            f.dlinkResolved = r.value;
            console.log(`[worker] Got dlink for ${f.filename} from fallback`);
            break;
          }
        }
      }
    }

    // 3b: Build fast_stream M3U8 from dlink byte-ranges (full video!)
    if (f.dlinkResolved && workerBase) {
      try {
        // Resolve any redirect on the dlink to get the real CDN URL
        const cdnUrl = await resolveRedirect(f.dlinkResolved, bestCookies);
        console.log(`[worker] CDN URL resolved for fast_stream`);

        // Get actual file size
        let fileSize = f.size || 0;
        if (!fileSize) {
          fileSize = await getFileSize(cdnUrl, bestCookies);
        }

        if (fileSize > 0) {
          const encodedUrl = b64Encode(cdnUrl);
          const encodedCookies = b64Encode(bestCookies);
          // Generate synthetic M3U8
          const m3u8Content = buildM3U8(workerBase, encodedUrl, encodedCookies, fileSize, f.filename);
          // Store the fast_stream URL as an endpoint path on this worker
          const fastStreamParams = new URLSearchParams({
            url:     encodedUrl,
            cookies: encodedCookies,
            size:    String(fileSize),
            name:    f.filename,
          });
          f.fastStreamUrl = `${workerBase}/fast_stream?${fastStreamParams}`;
          console.log(`[worker] fast_stream URL built, size=${fileSize}, segments=${Math.ceil(fileSize / BYTES_PER_CHUNK)}`);
        }
      } catch (e) {
        console.log(`[worker] fast_stream build failed: ${e?.message}`);
      }
    }

    // 3c: Get HLS qualities (30-second preview — kept for compatibility)
    if (shareId && uk) {
      f.debugInfo = { streamErrors: [] };
      const qKeys = Object.keys(qualitiesToFetch);
      await Promise.all(qKeys.map(async (qKey) => {
        const qType = qualitiesToFetch[qKey];
        
        // Try bestDomain first
        try {
          const streamUrl = await getStreamingUrl(bestDomain, shareId, uk, f.fs_id, bestJsToken, bestBrowserid, bestCookies, qType);
          if (streamUrl) {
            f.qualities[qKey] = streamUrl;
            if (qKey === '360') {
              f.hlsUrl = streamUrl;
            }
            return;
          }
        } catch (err) {
          f.debugInfo.streamErrors.push({
            domain: bestDomain,
            quality: qKey,
            error: err?.message ?? 'Failed on bestDomain'
          });
        }

        // Fallback to other domains
        const fallbackDomains = DOMAINS.filter(d => d !== bestDomain);
        const streamResults = await Promise.allSettled(
          fallbackDomains.map(d =>
            getStreamingUrl(d, shareId, uk, f.fs_id, bestJsToken, bestBrowserid, bestCookies, qType)
          )
        );

        streamResults.forEach((r, idx) => {
          if (r.status === 'rejected') {
            f.debugInfo.streamErrors.push({
              domain: fallbackDomains[idx],
              quality: qKey,
              error: r.reason?.message ?? 'Unknown error'
            });
          }
        });

        const ok = streamResults.find(r => r.status === 'fulfilled' && r.value);
        if (ok?.value) {
          f.qualities[qKey] = ok.value;
          if (qKey === '360') {
            f.hlsUrl = ok.value;
          }
        }
      }));

      if (!f.hlsUrl) {
        const resolvedQualities = Object.keys(f.qualities);
        if (resolvedQualities.length > 0) {
          f.hlsUrl = f.qualities[resolvedQualities[0]];
        }
      }
    }
  }

  const filesList = [];
  let totalFiles = 0;
  let totalFolders = 0;

  for (const f of files) {
    if (f.isDir) {
      totalFolders++;
    } else {
      totalFiles++;
    }

    const type = isVideo(f.filename) ? 'video' : isAudio(f.filename) ? 'audio' : isImage(f.filename) ? 'image' : 'file';
    
    // Map qualities to fast_stream_url matching "360p", "480p", etc.
    const fastStreamUrlMap = {};
    if (f.qualities) {
      for (const qKey of Object.keys(f.qualities)) {
        fastStreamUrlMap[`${qKey}p`] = `${workerBase}${f.qualities[qKey]}`;
      }
    }
    if (f.dlinkResolved) {
      fastStreamUrlMap['Original (Full)'] = `${workerBase}/stream?url=${b64Encode(f.dlinkResolved)}&cookies=${b64Encode(bestCookies)}`;
    }

    filesList.push({
      fs_id: f.fs_id,
      name: f.filename,
      file_path: f.path || `/${f.filename}`,
      size: f.size,
      size_formatted: f.sizeFormatted,
      type,
      is_dir: f.isDir ? "1" : "0",
      duration: "00:00:00",
      quality: f.qualities && Object.keys(f.qualities).length > 0 ? `${Object.keys(f.qualities)[0]}p` : "360p",
      normal_dlink: f.dlinkResolved ? `${workerBase}/stream?url=${b64Encode(f.dlinkResolved)}&cookies=${b64Encode(bestCookies)}&dl=1` : "",
      stream_url: f.hlsUrl ? `${workerBase}${f.hlsUrl}` : (f.dlinkResolved ? `${workerBase}/stream?url=${b64Encode(f.dlinkResolved)}&cookies=${b64Encode(bestCookies)}` : ""),
      fast_stream_url: fastStreamUrlMap,
      subtitle_url: "",
      thumbnail: f.thumbnail,
      folder: "root",
      debugInfo: f.debugInfo
    });
  }

  return {
    status: "success",
    total_files: totalFiles,
    total_folders: totalFolders,
    list: filesList
  };
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const workerBase = `${url.protocol}//${url.host}`;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Health check
    if (url.pathname === '/') {
      return jsonResp({ status: 'ok', message: 'TeraLink Worker is running' });
    }

    // GET /resolve?code=xxx&dir=yyy
    if (url.pathname === '/resolve') {
      const code = url.searchParams.get('code');
      const dir  = url.searchParams.get('dir') || '';
      if (!code) return jsonResp({ error: 'Missing ?code=' }, 400);
      try {
        const auth = {
          ndus:      url.searchParams.get('ndus') || '',
          ndut_fmt:  url.searchParams.get('ndut_fmt') || '',
          ndut_fmv:  url.searchParams.get('ndut_fmv') || '',
          csrf:      url.searchParams.get('csrf') || '',
          browserid: url.searchParams.get('browserid') || '',
        };
        const result = await resolveFull(code, auth, workerBase, dir);
        return jsonResp(result, result.status === 'success' ? 200 : 500);
      } catch (err) {
        return jsonResp({ error: err?.message ?? 'Worker error' }, 500);
      }
    }

    // GET /fast_stream?url=<b64>&cookies=<b64>&size=<bytes>&name=<filename>
    // Generates and returns a synthetic M3U8 pointing to /segment for each chunk
    if (url.pathname === '/fast_stream') {
      const encodedUrl     = url.searchParams.get('url');
      const encodedCookies = url.searchParams.get('cookies') || '';
      const size           = parseInt(url.searchParams.get('size') || '0', 10);
      const name           = url.searchParams.get('name') || 'video.mp4';

      if (!encodedUrl) return new Response('Missing ?url=', { status: 400 });
      if (!size)       return new Response('Missing ?size=', { status: 400 });

      const m3u8 = buildM3U8(workerBase, encodedUrl, encodedCookies, size, name);
      return new Response(m3u8, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-mpegURL',
          'Cache-Control': 'no-store',
          ...CORS,
        },
      });
    }

    // GET /segment?url=<b64>&cookies=<b64>&range=<b64-encoded "start-end">
    // Proxies a byte-range slice of the CDN video file (each TS-like chunk)
    if (url.pathname === '/segment') {
      const encodedUrl     = url.searchParams.get('url');
      const encodedCookies = url.searchParams.get('cookies') || '';
      const encodedRange   = url.searchParams.get('range');

      if (!encodedUrl || !encodedRange) {
        return new Response('Missing required params', { status: 400 });
      }

      let targetUrl, rangeStr;
      try {
        targetUrl = b64Decode(encodedUrl);
        rangeStr  = b64Decode(encodedRange); // "start-end"
      } catch {
        return new Response('Invalid params', { status: 400 });
      }

      let cookiesStr = '';
      if (encodedCookies) {
        try { cookiesStr = b64Decode(encodedCookies); } catch {}
      }

      const fetchHeaders = {
        'User-Agent': UA,
        'Referer': 'https://www.1024tera.com/',
        'Accept': '*/*',
        'Range': `bytes=${rangeStr}`,
      };
      if (cookiesStr) fetchHeaders['Cookie'] = cookiesStr;

      try {
        let upstream = await fetch(targetUrl, {
          headers: fetchHeaders,
          redirect: 'manual',
          signal: AbortSignal.timeout(30000),
        });

        // Handle redirects manually to preserve headers
        if (upstream.status === 301 || upstream.status === 302 ||
            upstream.status === 307 || upstream.status === 308) {
          const redirUrl = upstream.headers.get('location');
          if (redirUrl) {
            upstream = await fetch(redirUrl, { headers: fetchHeaders, signal: AbortSignal.timeout(30000) });
          }
        }

        const resHeaders = {
          'Content-Type': 'video/mp2t',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'max-age=86400',
          ...CORS,
        };
        const cl = upstream.headers.get('content-length');
        if (cl) resHeaders['Content-Length'] = cl;
        const cr = upstream.headers.get('content-range');
        if (cr) resHeaders['Content-Range'] = cr;

        return new Response(upstream.body, {
          status: upstream.status === 206 ? 206 : 200,
          headers: resHeaders,
        });
      } catch (err) {
        return new Response(`Segment fetch failed: ${err?.message}`, { status: 502, headers: CORS });
      }
    }

async function refreshStreamingUrl(targetUrl, cookies) {
  try {
    if (!targetUrl.includes('/share/streaming')) {
      return targetUrl;
    }
    const urlObj = new URL(targetUrl);
    const browserid = getCookieValue(cookies, 'browserid');
    if (!browserid) return targetUrl;
    
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = await hmacSha1(SIGN_KEY, CLIENTTYPE + CHANNEL + browserid + timestamp);
    
    urlObj.searchParams.set('timestamp', timestamp);
    urlObj.searchParams.set('sign', sign);
    
    console.log(`[worker] Refreshed streaming URL signature for quality ${urlObj.searchParams.get('type')}`);
    return urlObj.toString();
  } catch (e) {
    console.log(`[worker] Failed to refresh streaming URL signature: ${e.message}`);
    return targetUrl;
  }
}

    // GET /stream?url=<b64>&cookies=<b64> — proxy with Range + Cookie support
    if (url.pathname === '/stream') {
      const encoded = url.searchParams.get('url');
      if (!encoded) return new Response('Missing ?url=', { status: 400 });

      let targetUrl;
      try {
        targetUrl = b64Decode(encoded);
      } catch {
        targetUrl = decodeURIComponent(encoded);
      }

      const encodedCookies = url.searchParams.get('cookies') || '';
      let cookiesStr = '';
      if (encodedCookies) {
        try { cookiesStr = b64Decode(encodedCookies); } catch {}
      }

      // Refresh signature dynamically if it is a manifest streaming URL
      targetUrl = await refreshStreamingUrl(targetUrl, cookiesStr);

      // Check if this is an HLS playlist (.m3u8) or has type=M3U8
      const isPlaylist = targetUrl.includes('.m3u8') || targetUrl.includes('type=M3U8');

      if (isPlaylist) {
        const headers = {
          'User-Agent': UA,
          'Referer': 'https://www.terabox.app/',
          'Accept': '*/*',
        };
        if (cookiesStr) headers['Cookie'] = cookiesStr;

        let upstream = await fetch(targetUrl, { headers, redirect: 'manual' });

        if (upstream.status === 301 || upstream.status === 302 ||
            upstream.status === 307 || upstream.status === 308) {
          const redirUrl = upstream.headers.get('location');
          if (redirUrl) {
            upstream = await fetch(redirUrl, { headers });
          }
        }

        const text = await upstream.text();
        if (text.trim().startsWith('{') || text.includes('"errno"')) {
          return new Response(text, {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...CORS }
          });
        }

        // Rewrite segment paths to point DIRECTLY to the absolute TeraBox CDN URLs.
        // This bypasses the Cloudflare worker proxy for segments entirely, delivering maximum speed.
        const lines = text.split('\n');
        const rewrittenLines = lines.map(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            let absoluteSegUrl = trimmed;
            if (!trimmed.startsWith('http')) {
              try {
                if (trimmed.startsWith('/')) {
                  const urlObj = new URL(targetUrl);
                  absoluteSegUrl = `${urlObj.protocol}//${urlObj.host}${trimmed}`;
                } else {
                  absoluteSegUrl = new URL(trimmed, targetUrl).toString();
                }
              } catch {}
            }
            return absoluteSegUrl;
          }
          return line;
        });

        return new Response(rewrittenLines.join('\n'), {
          status: upstream.status,
          headers: {
            'Content-Type': 'application/x-mpegURL',
            ...CORS,
          }
        });
      }

      // Otherwise, it is a progressive download/stream: redirect the browser directly
      // to the target signed CDN URL for maximum speed, saving massive worker bandwidth.
      const dl = url.searchParams.get('dl');
      if (dl === '1') {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': targetUrl,
            'Content-Disposition': 'attachment',
            ...CORS
          }
        });
      }

      return new Response(null, {
        status: 302,
        headers: {
          'Location': targetUrl,
          ...CORS
        }
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
