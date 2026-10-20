# QMS Portal

Portal กลางของระบบบริหารคุณภาพ (ISO 9001) โดยแต่ละระบบย่อยจะเสียบเข้ามาเป็น module ของ Portal ตอนนี้มีโมดูล **DCC** (Document Control) ที่ใช้งานได้แล้ว

## โครงสร้าง (Monorepo)

```
apps/
  web/                 Frontend (React 19 + Vite + Tailwind 4 + Zustand)
    src/
      app/             App shell: routes (App.jsx), layout, route guard, shell tests
      modules/
        portal/        หน้า Portal + moduleRegistry (รายการ module บน Portal)
        dcc/           pages, components, services, utils, config, store slices, tests
      shared/          UI/hook/util กลาง ที่ไม่ผูกกับ module ใด
      store/           Root Zustand store (รวม slice ของทุก module), persist, seed
      test/            Vitest setup + test utils
    e2e/               Playwright
  api/                 Backend (Express + PostgreSQL), jest
database/migrations/   SQL migration (ทุกไฟล์ up ต้องมีไฟล์ down คู่กัน)
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
npm run install:all   # ติดตั้ง dependency ของ apps/web และ apps/api
npm run dev           # รัน frontend ที่ http://localhost:5173
npm run dev:api       # รัน backend (ต้องตั้ง DATABASE_URL)
npm run check         # lint + test + build (ให้ผ่านก่อนเปิด PR)
npm run test:e2e      # Playwright
```

แต่ละ app มี `package.json` และ lockfile แยกกัน จะเข้าไปรันคำสั่งในโฟลเดอร์นั้นตรงๆ ก็ได้ เช่น `cd apps/web && npm test`

## เพิ่ม module ใหม่ (เช่น CAPA, Audit)

1. สร้าง `apps/web/src/modules/<name>/` โดยมีโฟลเดอร์ `pages/`, `components/`, `store/` และ `tests/` เหมือนโมดูล `dcc/`
2. ลงทะเบียน module ใน `modules/portal/moduleRegistry.js` (ใส่ `moduleId`, `route` และ `status`)
3. เพิ่ม route ใต้ `<Route path="<name>">` ใน `app/App.jsx` (หน้าต่างๆ ให้ใช้ `lazy()`)
4. ถ้า module มี state ของตัวเอง ให้สร้าง slice ใน `modules/<name>/store/` แล้วนำไปรวมใน `store/useStore.js`
5. เพิ่ม override ของ `no-restricted-imports` ใน `apps/web/.oxlintrc.json` สำหรับ module ใหม่ โดยใช้ของ `dcc` เป็นแบบ

## การทำงานเป็นทีม

ดู [CONTRIBUTING.md](CONTRIBUTING.md) สำหรับ branch strategy, รูปแบบ commit และขั้นตอนการเปิด PR
