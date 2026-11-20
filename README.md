# Bengaluru Events Tracker

An interactive, live-synced dashboard for the [Bangalore Events Google Sheet](https://docs.google.com/spreadsheets/d/1bD7iUv2YTf8aKaoOxntbqucqKP9RN7t825NWB8aTc0Q/edit?gid=0#gid=0), hosted on GitHub Pages.

## Live Dashboard

- **GitHub Pages:** https://pranavtiwari.github.io/events-tracker/

## How Live Sync Works

- On page load (and whenever you click **Refresh**), the dashboard fetches the live `.xlsx` export directly from Google Sheets in the browser using [SheetJS](https://sheetjs.com/), dynamically locating the table header row and extracting both cell values and `=HYPERLINK(...)` booking URLs.
- If the `.xlsx` fetch is unavailable, it automatically falls back to Google Sheets' `gviz` JSON endpoint and finally to `data/fallback-events.json`.

## Features

- **Priority Zone KPI Cards:** Clickable summary cards for Priority 1 (East Bangalore), Priority 2 (Central Bangalore), and Priority 3 (Rest of Bangalore).
- **Interactive Charts:** Category breakdown (clickable to filter) and weekly event pace.
- **Multi-Facet Filtering & Search:** Instant search across titles, venues, localities, and summaries, plus filters for category, sub-genre, locality, and timeframe (`This Weekend`, `Next 7 Days`, etc.).
- **Multiple Views:** Switch between **Cards**, **Timeline** (chronological agenda), and **Table** views.
- **Shortlist & Calendar Integration:** Bookmark events locally (`localStorage`), open venue locations in Google Maps, or add events directly to Google Calendar.
