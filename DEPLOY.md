# Deploying Fulcrum POS to GitHub + Netlify

This is a brand-new, self-contained project in `~/fulcrum-pos`. It does **not** touch any
of your other projects.

## 1. Put it on GitHub

You already have the GitHub CLI (`gh`) installed. From the project folder:

```bash
cd ~/fulcrum-pos
git init
git add .
git commit -m "Fulcrum POS — Phase 1 MVP"

# Create a new private repo and push in one step (you'll be prompted to log in the first time):
gh auth login          # only if you've never authenticated gh on this machine
gh repo create fulcrum-pos --private --source=. --remote=origin --push
```

That creates `github.com/<you>/fulcrum-pos` and pushes `main`. Use `--public` instead of
`--private` if you want it public.

> Prefer the website? Create an empty repo at https://github.com/new (don't add a README),
> then run the `git init / add / commit` lines above plus:
> ```bash
> git remote add origin https://github.com/<you>/fulcrum-pos.git
> git branch -M main
> git push -u origin main
> ```

## 2. Deploy on Netlify (cloud build — no local Node needed)

Netlify builds the app on its own servers, so you don't need Node installed locally just to
deploy. The repo already contains `netlify.toml` with the correct settings.

1. Go to https://app.netlify.com → **Add new site → Import an existing project**.
2. Choose **GitHub** and authorize Netlify, then pick the `fulcrum-pos` repo.
3. Netlify reads `netlify.toml` and pre-fills:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Click **Deploy**. First build takes ~1–2 minutes. You'll get a URL like
   `https://fulcrum-pos-xyz.netlify.app`.

Every future `git push` to `main` auto-deploys.

### Custom domain (e.g. fulcrumcards.com)

In the Netlify site → **Domain management → Add a domain**, enter `fulcrumcards.com`, and
follow the DNS instructions (either point your registrar's nameservers at Netlify, or add
the CNAME/A records Netlify shows). HTTPS is issued automatically.

After the domain is live, set the matching **Public base URL** in the app's **Settings**
page (e.g. `https://fulcrumcards.com`) so QR codes encode the right `/i/FC-…` links.

### CLI alternative

```bash
npm i -g netlify-cli
netlify init      # links the repo + creates the site
netlify deploy --build --prod
```

## Notes

- The SPA redirect (`/* → /index.html`) is already configured in both `netlify.toml` and
  `public/_redirects`, so deep links like `/i/FC-000001` and `/inventory` work on refresh.
- Phase 1 stores data per-browser (localStorage). It's perfect for a demo and for single-device
  show use, but data does **not** sync between devices yet — that arrives with the Phase 2
  backend. Don't rely on it as the system of record until then.
