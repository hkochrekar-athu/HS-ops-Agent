# ⚡ Harshada Solutions — Ops Agent

Your private AI Operations Agent. Knows your full business. Runs on your own API key. Deployed on Vercel.

---

## What This Does

A secure Next.js app that gives you a personal AI assistant pre-loaded with everything about Harshada Solutions — projects, clients, pricing, deployment status, and your business context. Your API key lives safely on the server, never exposed to the browser.

---

## Project Structure

```
ops-agent/
├── pages/
│   ├── index.js          ← The chat UI
│   ├── _app.js           ← Global styles loader
│   └── api/
│       └── chat.js       ← Secure API route (API key lives here)
├── styles/
│   └── globals.css       ← Animations + fonts
├── .env.example          ← Template for your API key
├── .gitignore            ← Protects your .env.local from GitHub
├── next.config.js
└── package.json
```

---

## Step-by-Step Deployment to Vercel

### Step 1 — Get Your Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Click **API Keys** in the left menu
3. Click **Create Key** → name it "Ops Agent"
4. Copy the key (starts with `sk-ant-...`)
5. Save it somewhere safe — you only see it once

---

### Step 2 — Push to GitHub
1. Create a new repo on GitHub — name it `harshada-ops-agent` (set it to **Private**)
2. Open terminal and run:

```bash
cd ops-agent
git init
git add .
git commit -m "Initial commit — Ops Agent"
git remote add origin https://github.com/YOUR_USERNAME/harshada-ops-agent.git
git push -u origin main
```

---

### Step 3 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your `harshada-ops-agent` GitHub repo
3. Framework will auto-detect as **Next.js** ✅
4. Before clicking Deploy — click **Environment Variables**
5. Add this:
   - **Key:** `ANTHROPIC_API_KEY`
   - **Value:** paste your `sk-ant-...` key
6. Click **Deploy**

Vercel will build and deploy in about 60 seconds.

---

### Step 4 — Add Custom Domain (Optional)
To access it at `tools.harshadasolutions.com/ops-agent` or a subdomain:
1. In Vercel → **Settings → Domains**
2. Add `ops-agent.harshadasolutions.com` (or your preferred subdomain)
3. Add a CNAME record in your Hostinger DNS pointing to `cname.vercel-dns.com`

---

## Running Locally (for testing)

```bash
# Install dependencies
npm install

# Create your local env file
cp .env.example .env.local
# Edit .env.local and add your real API key

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Updating the Agent's Knowledge

When your business changes (new projects, new clients, new prices), update the system prompt in:

```
pages/api/chat.js  →  const SYSTEM_PROMPT = `...`
```

Edit, save, push to GitHub — Vercel auto-redeploys in ~60 seconds.

---

## Adding New Quick Actions

In `pages/index.js`, find the `QUICK_ACTIONS` array and add a new entry:

```js
{
  id: "your_id",
  label: "🔥 Your Button Label",
  prompt: "The full prompt you want to send when this button is clicked.",
},
```

---

## Cost Estimate

| Usage | Estimated Monthly Cost |
|-------|----------------------|
| Light (1–2 chats/day) | ~$1–2 |
| Medium (5–10 chats/day) | ~$3–6 |
| Heavy (20+ chats/day) | ~$8–15 |

Monitor usage at [console.anthropic.com](https://console.anthropic.com).

---

*Built by Harshada Solutions · Powered by Claude*
