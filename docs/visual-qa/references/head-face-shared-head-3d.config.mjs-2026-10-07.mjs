import{defineConfig}from '@playwright/test';
import{fileURLToPath}from 'node:url';
export default defineConfig({testDir:'.',testMatch:['**/.cache/shared-head-3d.spec.mjs','**/.cache/head-grooming.spec.mjs','**/.cache/head-face.spec.mjs'],workers:1,timeout:120000,use:{baseURL:'http://localhost:4273',headless:true},webServer:{cwd:fileURLToPath(new URL('../',import.meta.url)),command:'node scripts/dev-playwright-server.mjs',url:'http://localhost:4273',env:{PORT:'4273',VSFGM_RATE_LIMIT_PER_MIN:'100000'},reuseExistingServer:false,timeout:60000}});
