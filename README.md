# A Knew Knowledge website

Fast, responsive landing page for [aknewknowledge.com](https://aknewknowledge.com).
The site promotes Samuel Anderson's book and audiobook, introduces the mission and selected projects, and links the GitHub and Discord communities.

## Development

```sh
npm install
npm run dev
```

## Verification

```sh
npm run check
npm run build
npm test
```

## Porkbun deployment

1. Run `npm run build`.
2. Open the Porkbun web hosting dashboard for `aknewknowledge.com`.
3. Upload the contents of `dist/` to the domain's document root.
4. Confirm that `index.html`, `assets/`, `favicon.svg`, `robots.txt`, and `sitemap.xml` are served from the root.
5. Enable HTTPS and redirect HTTP traffic to HTTPS in the hosting dashboard.

Only the generated `dist/` contents need to be hosted.
