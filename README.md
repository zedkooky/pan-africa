# Panafrica Distributors website

Static site (`index.html`, `team.html`) driven by `content.json`, deployed over FTP by
`.github/workflows/deploy-ftp.yml` on every push to `main`.

## What gets published
Only the public files are uploaded (pages, `assets/`, `icons/`, `js/cms.js`, `enquiry.php`, `robots.txt`,
`sitemap.xml`, `.htaccess`). The editor (`admin.html`, `server.js`, `js/admin.js`) is never deployed.

## Deploy settings (GitHub → Settings → Secrets and variables → Actions)
- Secrets: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`
- Variables (optional): `FTP_SERVER_DIR` (e.g. `public_html/`), `SITE_URL` (default `https://padl.co.zm`)

## Enquiry form
Posts to `enquiry.php`, which emails info@padl.co.zm. Optional backup: set `inquire.formspreeEndpoint`
in `content.json` to a Formspree URL; it is used only if the PHP route fails.

## Editing content locally
```
PAD_ADMIN_PIN="choose-a-strong-pin" npm start
# open http://127.0.0.1:3847/admin.html, edit, save, then commit content.json and push
```
The PIN is never stored in the repo. Without `PAD_ADMIN_PIN` a random one is printed at startup.
