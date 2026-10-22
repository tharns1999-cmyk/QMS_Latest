# ย้ายระบบไปบัญชี Cloudflare ของบริษัท

ตอนนี้: UAT อยู่บัญชีส่วนตัว (Free Tier, ห้ามมีค่าใช้จ่าย) ปลายทาง: ระบบจริงบนบัญชีบริษัท ผลตรวจโค้ด 2026-10-22: โค้ดไม่ฝัง Account ID และอ่านค่าจากภายนอกแค่ 4 ตัว (`DB`, `FILES`, `JWT_SECRET`, `ALLOWED_ORIGIN`) ส่วนที่ผูกกับบัญชีจริงๆ มี 3 จุด:

| อะไร | อยู่ที่ไหน | ต้องเปลี่ยนตอนย้าย |
|---|---|---|
| `database_id` ของ D1 | [apps/api/wrangler.jsonc](../../apps/api/wrangler.jsonc) | ใส่ใน `env.production` (ไม่แตะบล็อก UAT) |
| `ALLOWED_ORIGIN` และ `VITE_API_URL` | wrangler.jsonc และตอน build เว็บ | ที่อยู่ `*.workers.dev` ขึ้นกับชื่อบัญชี จึงเปลี่ยนแน่นอน |
| `CLOUDFLARE_ACCOUNT_ID`, token, คีย์ R2 | GitHub Secrets ของ Nightly backup | ใส่ค่าของบัญชีบริษัท |

ชื่อ R2 bucket (`qms-files`) ใช้ซ้ำได้ เพราะชื่อ bucket แยกตามบัญชี

บล็อกบนสุดของ wrangler.jsonc = UAT บัญชีส่วนตัว (คำสั่งเดิมทำงานเหมือนเดิม) บล็อก `env.production` = บัญชีบริษัท ใช้เมื่อใส่ `--env production` เท่านั้น

## ขั้นตอนวันย้าย (UAT เดิมเปิดค้างไว้ตลอด ผู้ใช้ไม่สะดุด)

เตรียมล่วงหน้า (ไม่กระทบใคร)
1. ได้สิทธิ์ผู้ดูแลบัญชีบริษัท ผูกบัตร และเปิดใช้ R2 กับ Workers
2. `npx wrangler logout` แล้ว `npx wrangler login` ด้วยบัญชีบริษัท (หรือใช้ `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` ของบริษัทใน terminal นั้น) ตรวจด้วย `npx wrangler whoami` ว่าเป็นบัญชีบริษัทก่อนทำข้อต่อไป
3. `npx wrangler d1 create qms` แล้วนำ `database_id` ใส่ที่ `env.production` ใน wrangler.jsonc
4. `npx wrangler r2 bucket create qms-files`
5. ตั้งความลับใหม่: `cd apps/api && npx wrangler secret put JWT_SECRET --env production` (ค่าสุ่มยาว ไม่ใช้ซ้ำกับ UAT)
6. ผูกโดเมนบริษัท (โซนต้องอยู่บัญชีบริษัท) แล้วเปิดบรรทัด `routes` ใน `env.production` ตั้ง `ALLOWED_ORIGIN` เป็นที่อยู่เว็บบริษัท
7. สร้างโครงสร้างตาราง: `cd apps/api && npm run db:migrate:production` (คำสั่งเดียว สร้างครบ 0001–0021)

ทดสอบก่อนเปิดจริง
8. `npm run deploy:production` แล้ว build เว็บด้วย `VITE_API_URL=<ที่อยู่ API บริษัท> npm run build` ตามด้วย `npx wrangler deploy` (ล็อกอินบริษัท)
9. สร้างผู้ใช้ DCC คนแรกด้วย `scripts/create-user.js` และลอง login, อัปโหลด PDF, ผ่านขั้น 2FA

ย้ายข้อมูล (ช่วงสั้น ประกาศเวลาให้ผู้ใช้หยุดบันทึก)
10. สั่ง Nightly backup ของ UAT รอบสุดท้ายให้เขียว
11. ส่งออก D1 UAT: `npx wrangler d1 export DB --remote --output qms.sql` (ล็อกอินส่วนตัว) แล้วสลับเป็นบัญชีบริษัท นำเข้า `npx wrangler d1 execute DB --remote --env production --file qms.sql` ตรวจจำนวนแถวด้วย `node scripts/backup-tools.js counts --remote` ทั้งสองฝั่ง
12. คัดลอกไฟล์ PDF จาก R2 เก่าไปใหม่ด้วย rclone (ดู [backup-restore.md](backup-restore.md)) เทียบจำนวนไฟล์
13. ผู้ใช้ทุกคนต้อง login ใหม่ เพราะ `JWT_SECRET` ใหม่ (ตั้งใจ)

เปลี่ยนผ่าน
14. ประกาศที่อยู่ใหม่ หรือชี้โดเมนบริษัทมาที่ระบบใหม่ ปล่อย UAT เดิมอ่านอย่างเดียวไว้ 1–2 สัปดาห์เป็นทางถอย
15. ใน GitHub ตั้ง Secrets ของ Nightly backup เป็นค่าบัญชีบริษัท และเพิ่ม `--env production` ในคำสั่ง `wrangler d1` ของ workflow (ตอนนี้ยังชี้ UAT) แล้วสั่ง Run workflow ให้เขียว
16. เมื่อมั่นใจ ลบทรัพยากรบนบัญชีส่วนตัว

## ข้อควรรู้
- "ไม่มี downtime" ในที่นี้คือระบบเก่าเปิดตลอดจนกว่าระบบใหม่ผ่านทดสอบ ช่วงข้อ 10–14 ยังต้องหยุดบันทึกชั่วคราวเพื่อไม่ให้ข้อมูลหลุด
- Free Tier ของ Workers จำกัด CPU ต่อคำขอ งานประทับ PDF บนเซิร์ฟเวอร์อาจเกินเมื่อไฟล์ใหญ่ ผมยังไม่ได้วัด ให้ลองไฟล์ PDF ใหญ่จริงใน UAT ก่อน (บัญชีบริษัทแบบจ่ายเงินไม่มีข้อจำกัดนี้)
- R2 บางบัญชีต้องผูกบัตรก่อนเปิดใช้แม้ใช้ในโควตาฟรี ตรวจในหน้า R2 ของบัญชีส่วนตัวว่าเปิดไว้แล้วโดยไม่ถูกเรียกเก็บ
