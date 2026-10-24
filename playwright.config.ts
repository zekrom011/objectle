import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',workers:1,use:{baseURL:'http://127.0.0.1:5173',launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}},webServer:{command:'ALLOW_UNREVIEWED=true npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:120000}});
