# BriefDesk 📄

Summarize PDFs, articles, and long emails into a short summary, key points, and action items — powered by AI (Claude).

## What it does

Upload a PDF or `.txt` file, or paste an article/email directly, choose how long you want the summary to be, and BriefDesk returns:
- a plain-language summary
- 4-8 key points
- action items / deadlines found in the text (optional)

## Project structure

```
briefdesk/
├── server.js           # Express server, extracts text and calls the Anthropic API
├── package.json
├── .env.example         # template for environment variables
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
└── README.md
```

## Installation

1. You'll need [Node.js](https://nodejs.org/) version 18 or newer.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Add your Anthropic API key to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   Get a key from [console.anthropic.com](https://console.anthropic.com/) → Settings → API Keys.
5. Start the server:
   ```bash
   npm start
   ```
6. Open [http://localhost:3001](http://localhost:3001) in your browser.

> ⚠️ The `.env` file is ignored by Git (see `.gitignore`) — never push your API key to GitHub.
>
> Note: this app runs on port **3001** by default (not 3000), so it can run alongside another local project like FridgeChef without a conflict. Change `PORT` in `.env` if you'd like a different port.

## Features — MVP

- Upload a PDF or `.txt` file, or paste text directly
- Adjustable summary length (short / medium / detailed)
- Optional extraction of action items and deadlines
- Clear separation of summary vs. key points vs. action items

## Features — Extensions (already included, simple version)

- **Saved briefings** — bookmark a summary to keep it (stored in `localStorage`)
- **History** — your last 20 summaries, with a "View" button to bring one back up
- **Copy** and **Download as .txt** for any summary

## Ideas for next steps (not included yet)

- Support for `.docx` files
- OCR for scanned/image-based PDFs
- Summarizing a public article directly from a URL
- Exporting saved briefings as a single PDF
- Authentication + database storage for multi-device access

## Pushing to GitHub

```bash
cd briefdesk
git init
git add .
git commit -m "Initial commit: BriefDesk MVP"
git branch -M main
git remote add origin <your_github_repo_url>
git push -u origin main
```

`.env` won't be pushed (it's in `.gitignore`) — that's correct, your key stays local only.
