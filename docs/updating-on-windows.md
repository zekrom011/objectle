# Update your downloaded copy on Windows

1. Stop Objectle in PowerShell with Ctrl+C.
2. Download the latest ZIP from GitHub: https://github.com/zekrom011/objectle → Code → Download ZIP.
3. Extract it into a **new folder**, keeping your old folder as a backup.
4. Copy your old `.env` file into the new project folder.
5. To keep player progress, copy the entire old `data` folder into the new project folder while the app is stopped. Keep using the same browser and site address so its session cookie remains available.
6. Open PowerShell in the new folder containing `package.json` and `package-lock.json`.
7. Run `npm.cmd ci`.
8. Run `npm.cmd run content:validate`.
9. Run `npm.cmd run dev` and open http://localhost:5173.

The included daily schedule is already generated. Do not regenerate it merely to update the interface. The separate October 2026 bonus archive is included in the source and does not require changing LAUNCH_DATE or your daily schedule.

Development uses unreviewed content from `.env.example`. Production continues to require reviewed content.
