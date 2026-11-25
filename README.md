# The Primegraph Chronicle

A multi-page, live-synced personal newspaper hosted on GitHub Pages (`biscope.primegraph.in`), powered directly by the 5 files in the [Google Drive source folder](https://drive.google.com/drive/folders/1cVHSyWRqsO2JVQhBGjZRvfGex4yH4EVy?usp=sharing).

## Pages & Live Sources

| Page | Section | Source File |
| :--- | :--- | :--- |
| [`index.html`](index.html) | **Front Page** | Live-synced summary of all 5 desks with links to each section |
| [`biscope.html`](biscope.html) | **Biscope** | Google Doc — Daily morning briefing, weather, inbox triage & world news |
| [`portfolio.html`](portfolio.html) | **Portfolio Advice** | Google Doc — Market overview, SIP posture, priority actions & filterable India decision table |
| [`ai-research.html`](ai-research.html) | **AI Research** | Google Doc — Weekly arXiv papers & long-form essays with keyword search and part filter |
| [`health.html`](health.html) | **Health & Longevity** | Google Doc — Vitality & Longevity Digest with clinical takeaways |
| [`events.html`](events.html) | **Bengaluru Events** | Google Sheet — Interactive live Bengaluru events tracker (Cards, Timeline & Table views) |

## How Live Sync Works

- **Google Docs desks (`biscope.html`, `portfolio.html`, `ai-research.html`, `health.html`)** render instantly from local snapshots in `data/` and fetch the latest Markdown export directly from Google Docs in the browser, with a **Refresh** button in the top bar.
- **Bengaluru Events (`events.html`)** fetches the live `.xlsx` export from Google Sheets via SheetJS, falling back to `gviz` JSON and `data/fallback-events.json`.
- **Front Page (`index.html`)** aggregates headlines, metrics, and summaries across all 5 sources automatically.
