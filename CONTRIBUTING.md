# Contributing

## Branch strategy (GitFlow-lite)

| Branch | หน้าที่ | Merge เข้าได้จาก |
|---|---|---|
| `main` | Production โดย tag ทุก release (`v1.2.0`) | `release/*` และ `hotfix/*` |
| `uat` | ใช้ทดสอบ UAT กับ user | `release/*` |
| `develop` | รวมงานที่พร้อมทดสอบ | `feature/*` และ `fix/*` |
| `feature/<module>-<desc>` | งานใหม่ เช่น `feature/dcc-external-doc-renewal` | แตกจาก `develop` |
| `fix/<module>-<desc>` | แก้บั๊กที่ยังไม่ขึ้น production | แตกจาก `develop` |
| `release/<version>` | เตรียมปล่อย release: ผ่าน UAT แล้วเข้า `main` | แตกจาก `develop` |
| `hotfix/<desc>` | แก้บั๊กด่วนบน production | แตกจาก `main` แล้ว merge กลับทั้ง `main` และ `develop` |

```
feature/* ──PR──► develop ──► release/x.y.z ──► uat (ทดสอบ) ──► main (tag vx.y.z)
                     ▲                                             │
                     └──────────────── hotfix/* ◄──────────────────┘
```

- ห้าม push ตรงเข้า `main`, `uat` และ `develop` ทุกงานต้องผ่าน PR และ CI ต้องผ่าน
- branch ควรมีอายุสั้น (ไม่เกิน 1–3 วัน) และ rebase หรือ merge จาก `develop` บ่อยๆ
- ชื่อ branch ให้ขึ้นต้นด้วยชื่อ module (`dcc`, `vcc`, `portal`, `api`, `shared`) เพื่อให้รู้ทันทีว่างานนั้นแตะส่วนไหน

## Commit message (Conventional Commits)

```
<type>(<scope>): <สรุปสั้นๆ>

type:  feat | fix | refactor | test | docs | chore | perf
scope: dcc | vcc | portal | shared | web | api | db
```

ตัวอย่าง: `feat(dcc): add external doc renewal reminder`, `fix(api): reject self-approval on DAR`

## Pull request

1. ก่อนเปิด PR ให้รัน `npm run check` ที่ root ให้ผ่าน (lint + test + build)
2. กรอก PR template และระบุ module ที่งานนั้นแตะ
3. ต้องมี reviewer approve อย่างน้อย 1 คนก่อน merge ใช้ **Squash merge** เข้า `develop` และใช้ **Merge commit** เมื่อ merge `release/*` เข้า `main`
4. ถ้ามีการเปลี่ยน database ต้องเพิ่ม migration ใหม่ใน `database/migrations/` พร้อมไฟล์ `_down.sql` ห้ามแก้ migration ที่เคยรันไปแล้ว

## ตั้งค่า GitHub (ทำครั้งเดียว)

- เปิด branch protection ให้ `main`, `uat` และ `develop`: บังคับ PR และบังคับให้ CI (`web`, `e2e`, `api`) ผ่านก่อน merge
- ตั้ง default branch เป็น `develop`
