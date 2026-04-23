# Brickworks — LEGO Builder Website

A full-stack website for designing custom LEGO creations in 3D, generating printable step-by-step instructions, and sharing your builds with the community.

## Features

- **3D Brick Builder** — Drag-and-drop editor built with Three.js. Place, paint, rotate, and delete bricks on a baseplate with full orbit/zoom controls, undo/redo, and layer visibility.
- **Extended Brick Library** — Bricks, plates, tiles, slopes, round pieces, and a 15-color classic LEGO palette.
- **Instruction Manuals** — Automatically generate a step-by-step manual from any build and download it as a PDF.
- **Community Gallery** — Homepage with featured creations, browse page with search, and individual creation pages.
- **Clone & Remix** — Clone any creation into the builder and edit your own version.
- **Save & Load** — Creations are persisted to a hosted database (Turso) so they survive refreshes and deploys.

## Tech Stack

- **Runtime:** Node.js 18+ on Vercel (serverless functions)
- **Backend:** Express routed through a single Vercel serverless function
- **Database:** [Turso](https://turso.tech) (hosted libSQL / SQLite-compatible)
- **Frontend:** Vanilla HTML/CSS/JS with Three.js (CDN) and jsPDF (CDN) — no build step

## Project layout

```
Lego Builder Website/
├── api/
│   └── index.js          # Express app — exported as a Vercel function
├── lib/
│   └── db.js             # Turso (libSQL) client + query helpers
├── scripts/
│   └── seed.js           # Seed the Turso DB with demo creations
├── public/               # Static assets (served by Vercel)
│   ├── index.html        # Homepage
│   ├── browse.html
│   ├── builder.html
│   ├── creation.html
│   ├── my-creations.html
│   ├── css/styles.css
│   └── js/
│       ├── bricks.js         # Brick catalog + geometry
│       ├── builder.js        # 3D editor
│       ├── viewer.js         # Read-only 3D viewer
│       ├── instructions.js   # Step-by-step PDF generator
│       ├── api.js            # Fetch wrapper
│       ├── home.js, browse.js, creation.js, my-creations.js
│       └── user.js           # Local username handling
├── package.json          # Root — deps live here now
├── vercel.json           # Rewrites + cleanUrls
├── .env.example          # Copy to .env for local dev
└── README.md
```

## Deploying to Vercel

### 1. Create a Turso database

Install the Turso CLI and sign in:

```bash
# macOS / Linux
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup            # or: turso auth login
```

Create a database and grab its URL and a long-lived auth token:

```bash
turso db create brickworks
turso db show brickworks --url
turso db tokens create brickworks
```

Save both — you'll paste them into Vercel's Environment Variables page.

### 2. Seed the database (optional but recommended)

Seeding is done from your machine against the hosted database. Copy the example env file and fill in the two values you got above:

```bash
cp .env.example .env
# edit .env and paste TURSO_DATABASE_URL + TURSO_AUTH_TOKEN

npm install
npm run seed
```

You should see six demo creations inserted.

### 3. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
# Create a repo at github.com/new, then:
git remote add origin https://github.com/<you>/brickworks.git
git push -u origin main
```

### 4. Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import your GitHub repo.
2. Leave the framework preset as **Other** — `vercel.json` already handles everything.
3. Under **Environment Variables**, add:
   - `TURSO_DATABASE_URL` — the `libsql://…` URL from step 1
   - `TURSO_AUTH_TOKEN` — the token from step 1
4. Click **Deploy**.

That's it. Every push to `main` redeploys; pull requests get preview URLs automatically.

## Running locally

```bash
npm install
cp .env.example .env     # fill in your Turso credentials
npm run dev              # starts http://localhost:3000
```

Local dev uses the same Turso database as production by default. If you want a separate dev DB, create a second one with `turso db create brickworks-dev` and point `.env` at that instead.

## Leftover `server/` directory

Earlier versions of this project had a standalone Express/SQLite server in `server/`. It's been replaced by `api/index.js` + `lib/db.js` + `scripts/seed.js`. The old directory is kept locally for reference but is ignored by git (see `.gitignore`) and should not be deployed. Feel free to delete it: `rm -rf server/`.

## Not yet implemented (intentional)

- **Ordering / physical production** — download-instructions-only for now, since there is no production pipeline. The codebase is structured so an "Order" button can be added later without touching the builder.
- **Real user accounts** — users are identified by a locally-chosen nickname stored in `localStorage`. Switching to proper accounts later is a localized change.
- **Custom STL pieces** — the brick catalog is parametric (dimensions in studs). Once you design STL pieces, replace the geometry generators in `public/js/bricks.js`.
