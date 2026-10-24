# Download and run Objectle

1. Open https://github.com/zekrom011/objectle and select the `main` branch.
2. Click the green **Code** button, then **Download ZIP**.
3. Extract the ZIP. Open the extracted `objectle-main` folder in VS Code.
4. Install Node.js 24 from https://nodejs.org, then restart VS Code.
5. Choose **Terminal → New Terminal** in VS Code.
6. Run `npm ci` and wait for it to finish.
7. Copy `.env.example` to `.env`: use `Copy-Item .env.example .env` in Windows PowerShell, or `cp .env.example .env` on macOS/Linux.
8. Run `npm run content:validate`.
9. Run `npm run schedule:build`. The local `.env` enables draft content; production never permits it.
10. Run `npm run dev` and leave the terminal open.
11. Open http://localhost:5173 in your own browser.
12. Press Ctrl+C in the terminal to stop the app.

If npm reports an error, keep the exact error text. Do not share `.env` secrets or player recovery tokens.

The development schedule begins on LAUNCH_DATE in `.env` and contains 180 days. Choose the intended launch date before regenerating a new schedule. Do not silently regenerate dates on a live deployment: existing players may already have answered its scenarios.

Public deployment requires legal review of the content, production configuration, HTTPS, and persistent storage. See README.md for deployment instructions. Downloading source code does not publish a website.
