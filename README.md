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

## Production deployment

Pushes to `main` are checked, built, and deployed automatically through GitHub Actions and GitHub Pages.
The Porkbun DNS configuration points the apex domain and `www` to GitHub Pages.
GitHub Pages provides and renews the TLS certificate for both hostnames.

The production site is available at [https://aknewknowledge.com](https://aknewknowledge.com).
