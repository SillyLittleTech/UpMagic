# SillyLittleTech Status Page

A decentralized, edge-computed monitoring tool built with Cloudflare Workers and a resilient static frontend.

## Testing
- Run `npm run dev` to test the UI.
- Run `npm run dev:scheduled` to test the backend.
- Run `npm run trigger:scheduled` to force a refresh of data.

## Architecture

- **Worker:** A Cloudflare Worker runs a cron trigger every minute to check the health of target services (`slt.ong`, `socks.slt.ong`, `projects.slt.ong`). It stores the state in Cloudflare KV and double-writes to a GitHub Gist.
- **Frontend:** A statically hosted HTML/CSS/JS site following the "CookieCut" design language. It dynamically fetches state from the Worker's API and automatically falls back to the GitHub Gist during a partial Cloudflare outage.
- **Notifications:** Built-in webhooks ping Slack or Discord on state changes.

## Deployment Instructions

### 1. Worker Setup
Navigate to the `worker/` directory:
```bash
cd worker
npm install
```

**Create KV Namespace:**
```bash
npx wrangler kv:namespace create "STATUS_KV"
# Follow the CLI output to update wrangler.toml with the correct IDs.
```

**Set Secrets:**
Configure the following secrets in Cloudflare (e.g. `npx wrangler secret put <NAME>`):
- `ISSUES_PAT`: A GitHub Personal Access Token to write to the Gist and read from the projecthub issues.
- `ADMIN_SECRET`: A secure password to authenticate with the Admin API dashboard.
- `NOTIFY_WEBHOOK_URL`: The Discord/Slack webhook URL for status change notifications.

**Set Variables:**
Update `wrangler.toml` or use `npx wrangler secret put` to set:
- `GITHUB_GIST_ID`: The ID of the Gist where the status will be mirrored.

**Deploy Worker:**
```bash
npx wrangler deploy
```

### 2. Frontend Setup
Once the worker is deployed, update `frontend/js/app.js` and `frontend/js/admin.js` with your production Worker URL.
Also, update the `GIST_URL` variable in `frontend/js/app.js` to point to the raw URL of your GitHub Gist.

**Deploy to Cloudflare Pages (status.slt.ong):**
```bash
cd frontend
npx wrangler pages deploy . --project-name slt-status
```

**Deploy to GitHub Pages (status2.slt.ong):**
Commit the `frontend/` directory to a branch (e.g., `gh-pages`) in your target repository and configure GitHub Pages to serve from the root.

## Admin Dashboard

Navigate to `/admin.html` on your deployed frontend to manually override service statuses or post incident updates. You will need your `ADMIN_SECRET` to authenticate.
