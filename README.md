# QMS Portal

Portal กลางของระบบบริหารคุณภาพ (ISO 9001) โดยแต่ละระบบย่อยจะเสียบเข้ามาเป็น module ของ Portal ตอนนี้มีโมดูล **DCC** (Document Control) และ **VCC** (Verify and Calibration Center) รวมถึงหน้า System Administration

## โครงสร้าง (Monorepo)

```
apps/
  web/                 Frontend (React 19 + Vite + Tailwind 4 + Zustand)
    src/
      app/             App shell: routes (App.jsx), layout, route guard, shell tests
      modules/
        portal/        หน้า Portal + moduleRegistry (รายการ module บน Portal)
        dcc/           pages, components, services, utils, config, store slices, tests
        vcc/           api, components, pages, utils, tests
        admin/         System Administration
      shared/          UI/hook/util กลาง ที่ไม่ผูกกับ module ใด
      store/           Root Zustand store (รวม slice ของทุก module), persist, seed
      test/            Vitest setup + test utils
    e2e/               Playwright
  api/                 Backend (Cloudflare Workers + Hono + D1 + R2), Vitest
    src/               index.js (auth, DCC, master data), vcc*.js (VCC)
    migrations/        D1 migration เรียงเลข (เพิ่มไฟล์ใหม่เท่านั้น ห้ามแก้ไฟล์เดิม)
    scripts/           seed (local เท่านั้น), backup, preflight, deploy guard
database/migrations/   ของเดิมยุค PostgreSQL ไม่ได้ใช้แล้ว (เก็บไว้อ้างอิง)
docs/                  Handoff, UAT
scripts/               สคริปต์ช่วยงาน (เช่น สร้างชุดเอกสาร UAT)
```

### กฎการ import (oxlint บังคับ)

```
app  ──►  modules/*  ──►  shared
            │
            └──►  store
```

- `shared/` ห้าม import จาก `app/`, `modules/` และ `store/`
- module ห้าม import ข้ามกัน และห้าม import จาก `app/` โค้ดที่หลาย module ใช้ร่วมกันให้ย้ายไปไว้ที่ `shared/`

## เริ่มต้นใช้งาน

```bash
pnpm run install:all   # ติดตั้ง dependency ของ apps/web และ apps/api
pnpm run dev           # รัน frontend ที่ http://localhost:5173
pnpm run dev:api       # รัน API ด้วย wrangler dev (D1 ในเครื่อง)
pnpm run check         # lint + test + build (ให้ผ่านก่อนเปิด PR)
pnpm run test:e2e      # Playwright
```

แต่ละ app มี `package.json` และ lockfile (pnpm-lock.yaml) แยกกัน จะเข้าไปรันคำสั่งในโฟลเดอร์นั้นตรงๆ ก็ได้ เช่น `cd apps/web && pnpm test`

## เพิ่ม module ใหม่ (เช่น CAPA, Audit)

1. สร้าง `apps/web/src/modules/<name>/` โดยมีโฟลเดอร์ `pages/`, `components/`, `store/` และ `tests/` เหมือนโมดูล `dcc/`
2. ลงทะเบียน module ใน `modules/portal/moduleRegistry.js` (ใส่ `moduleId`, `route` และ `status`)
3. เพิ่ม route ใต้ `<Route path="<name>">` ใน `app/App.jsx` (หน้าต่างๆ ให้ใช้ `lazy()`)
4. ถ้า module มี state ของตัวเอง ให้สร้าง slice ใน `modules/<name>/store/` แล้วนำไปรวมใน `store/useStore.js`
5. เพิ่ม override ของ `no-restricted-imports` ใน `apps/web/.oxlintrc.json` สำหรับ module ใหม่ โดยใช้ของ `dcc` เป็นแบบ

## กติกาสำหรับ AI

ดู [AGENTS.md](AGENTS.md) (ใช้ร่วมกันทุก AI) ก่อนแก้โค้ดให้ใช้ skill `qms-module-development`

## การทำงานเป็นทีม

ดู [CONTRIBUTING.md](CONTRIBUTING.md) สำหรับ branch strategy, รูปแบบ commit และขั้นตอนการเปิด PR
