# Security & SEO audit — Pan Africa Distributors site (2 Oct 2026)

## Security

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | **High** | Default editor PIN `panafrica` is stored in plain text in `content.json` (`settings.adminPin`), and `GET /api/content` + static serving expose `content.json` to anyone, so the PIN is public. Anyone can `PUT /api/content` or `POST /api/upload`. | Move the PIN/password to an env var, hash it, never serve it; rotate it. |
| 2 | **High** | Client-side auth in `js/admin.js`: the PIN is compared in the browser against the downloaded content, and the session flag is just `sessionStorage`. No rate limiting on the API PIN check. | Server-side login with a session cookie, rate limiting. |
| 3 | **High** | Stored XSS: `js/cms.js` writes CMS values with `innerHTML` (lines ~205, 438). Whoever can edit content (see 1) can inject script into all visitors. | Use `textContent`, or sanitise (DOMPurify) the few fields that need HTML. |
| 4 | Medium | `server.js` `/api/upload` accepts any extension (`.html`, `.svg`, `.js`) with no size cap, so it can host script/phishing pages. No body-size limit on `PUT /api/content`. | Allow-list image types, cap size. |
| 5 | Medium | `server.js` serves the entire project root: `server.js`, `package.json`, `DESIGN-*.json`, the company profile `.docx` and working files are all downloadable. Path check uses `startsWith(ROOT)` (prefix-bypass-able). | Serve only a `public/` dir; use `path.relative` check. |
| 6 | Medium | Enquiry form is fake: `index.html` ~L1237 just shows "Thank you — received" after a timeout. **No enquiry is sent anywhere**, so leads are silently lost. | Wire to a real endpoint (Formspree, email API, etc.). |
| 7 | Low | No security headers (CSP, X-Content-Type-Options, Referrer-Policy, frame protection). Fonts via Google CSS `@import`. | Add headers at host/server. |
| 8 | Low | `admin.html` is `noindex` but linked/guessable at `/admin.html`. | Don't deploy it publicly; keep CMS local or behind auth. |
| 9 | Info | Docx `PANAFRICA-…COMPANY-PROFILE-Feb.docx` has author metadata ("Soraya Latif"). | Strip metadata if it is published. |

No API keys, tokens or cloud credentials were found. No GPS EXIF in images. Contact data (`+260 211 242716`, `+260 977 783995`, Mumbwa Road address) is intentionally public.

## Anomalies / hygiene
- `Gemini_Generated_Image_….jpg` is byte-identical to `assets/story.jpg` (3.1 MB duplicate).
- Two stray `drawing-*.png` (2.8 MB) and the `.docx` sit in the web root, unused by the site.
- `story.jpg` is 3.1 MB vs ~150–400 KB for other images.
- `data-od-preview-ready` attr and `DESIGN-*` files are design-tool export leftovers.
- `<title>` says "Pan Africa", body/brand says "Panafrica": inconsistent naming hurts search.
- 2 `<img alt="">` are decorative (hero, lion) — acceptable.

## SEO audit
**Good:** unique `<title>`/description on home and team, `lang="en"`, single `<h1>` per page, sensible h2/h3 structure, descriptive alt text on content images, width/height set (no CLS), `loading="lazy"`, `fetchpriority` on hero, viewport meta.

**Missing / to fix (priority order):**
1. **Content rendered by JS** (`js/cms.js` fills text from `content.json`). Static HTML holds defaults, but any CMS edits are invisible to crawlers that don't run JS. Prefer build-time rendering.
2. No `<link rel="canonical">`, no `robots.txt`, no `sitemap.xml`.
3. No Open Graph / Twitter Card tags (poor WhatsApp/LinkedIn/Facebook previews — important in Zambia).
4. No structured data: add `Organization`/`LocalBusiness` JSON-LD (name, address, phones, areaServed Lusaka/Western/Southern, logo).
5. No favicon / apple-touch-icon.
6. Performance: `@import` of Google Fonts blocks render (use `<link rel=preconnect>` + `<link>` with `display=swap`); convert JPGs to WebP/AVIF; compress `story.jpg`; ~70 KB single-file HTML with inline CSS.
7. Single-page site: one indexable page for everything. Consider separate pages (Brands, Coverage, Contact) targeting "FMCG distributor Zambia", "Lusaka distribution company".
8. Brand names (BAT, Nestlé, Colgate…) are in `<h3>`; fine, but add descriptive internal links/anchors and a visible address/NAP in the footer text.
9. Set `robots` noindex on admin (done) and exclude from sitemap; block `/api/` in robots.txt.
10. Register Google Search Console + Google Business Profile for the Lusaka address.
