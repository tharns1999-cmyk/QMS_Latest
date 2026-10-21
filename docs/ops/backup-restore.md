# คู่มือ Backup, กู้คืน และ Rollback (QMS Portal)

เอกสารนี้ใช้เป็นหลักฐานสำหรับการตรวจประเมินประจำปี และเป็นคู่มือปฏิบัติของผู้ดูแลระบบ

## 1. สรุปมาตรการ

| ข้อมูล | วิธีป้องกัน | เก็บที่ไหน | เก็บนานเท่าไร |
|---|---|---|---|
| ฐานข้อมูล (ผู้ใช้, DAR, ทะเบียนเอกสาร, Audit log) | Backup อัตโนมัติทุกคืน 02:00 + ตรวจว่ากู้คืนได้จริงทุกครั้ง | Google Drive (เข้ารหัสก่อนอัปโหลด) | รายวัน 35 วัน, ชุดแรกของทุกเดือนเก็บไม่ลบอัตโนมัติ (ต้องเก็บอย่างน้อย **5 ปี**) |
| ไฟล์ PDF ควบคุม | คัดลอกทุกคืน แบบเพิ่มอย่างเดียว ไม่ลบไฟล์ที่เคยสำรองไว้ | Google Drive (เข้ารหัส) | ไม่ลบอัตโนมัติ |
| ย้อนข้อมูลไปเวลาใดก็ได้ | D1 Time Travel ของ Cloudflare | Cloudflare | 30 วัน (แพ็กเสียเงิน) หรือ 7 วัน (แพ็กฟรี) ตรวจในหน้า Cloudflare Dashboard |
| Audit log | แก้ไขและลบไม่ได้ที่ระดับฐานข้อมูล (trigger) และอยู่ในทุก backup | ฐานข้อมูล + Google Drive | ไม่ลบ |
| โค้ดและเวอร์ชัน | Git (GitHub) + Worker versions ของ Cloudflare | GitHub / Cloudflare | ตลอด |

เป้าหมาย: ข้อมูลสูญหายได้ไม่เกิน **24 ชั่วโมง** กรณีใช้ไฟล์ใน Drive (หรือไม่เกินไม่กี่นาทีถ้าใช้ Time Travel) และกู้ฐานข้อมูลเสร็จภายใน **1 ชั่วโมง** (เวลาจริงให้บันทึกจากการซ้อมกู้คืนในหัวข้อ 6)

ทุกคืน workflow จะ: ส่งออกฐานข้อมูล → กู้ลงฐานข้อมูลจำลองเพื่อตรวจ (foreign key, migration ครบ, trigger ของ audit log, จำนวนแถวไม่น้อยกว่าก่อน export และไม่มากกว่าหลัง export) → อัปโหลดแบบเข้ารหัส → ดาวน์โหลดกลับมาเทียบ checksum → คัดลอก PDF และเทียบจำนวนไฟล์ ถ้าขั้นตอนใดล้มเหลว job จะแดงและ GitHub ส่งอีเมลแจ้ง

## 2. ตั้งค่าครั้งแรก (ทำครั้งเดียว หลังสร้าง Cloudflare resources แล้ว)

ใช้ค่าจากขั้นตอนใน GitHub: Settings → Secrets and variables → Actions → New repository secret

1. **BACKUP_PASSWORD** รหัสผ่านเข้ารหัส backup สร้างแบบสุ่มยาว 32 ตัวอักษรขึ้นไป
   **เก็บสำเนาไว้ที่ปลอดภัยอย่างน้อย 2 ที่ และอย่างน้อย 2 คนรู้ว่าอยู่ที่ไหน ถ้ารหัสนี้หาย backup ทั้งหมดจะเปิดอ่านไม่ได้อีก**
2. **CLOUDFLARE_ACCOUNT_ID** ดูที่หน้า Cloudflare Dashboard (ด้านขวาของหน้า Workers & Pages)
3. **CLOUDFLARE_API_TOKEN** My Profile → API Tokens → Create Token → Custom → Permission: *Account · D1 · Edit* (เฉพาะบัญชีนี้)
4. **R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY** R2 → Manage API Tokens → Create → *Object Read only* เฉพาะ bucket `qms-files`
5. **GDRIVE_FOLDER_ID** สร้างโฟลเดอร์ใน Google Drive ของบริษัท (เช่น `QMS-Backup`) เปิดแล้วคัดลอกรหัสท้าย URL ให้เข้าถึงได้เฉพาะผู้ดูแลระบบและ QMR
6. **GDRIVE_TOKEN** บนเครื่องที่ติดตั้ง rclone (`winget install Rclone.Rclone`) รัน `rclone authorize "drive"` ล็อกอินด้วยบัญชี Google ที่เป็นเจ้าของโฟลเดอร์ แล้วคัดลอกข้อความ JSON ที่ขึ้นมาทั้งก้อน
   - ถ้าองค์กร Google Workspace บล็อกแอปภายนอก ให้ฝ่าย IT อนุญาต หรือสร้าง OAuth client ของบริษัทเอง แล้วใส่ **GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET** ด้วย (และตั้งสถานะแอปเป็น In production ไม่เช่นนั้น token หมดอายุใน 7 วัน)
7. ไฟล์ [apps/api/wrangler.jsonc](../../apps/api/wrangler.jsonc) ต้องมี `database_id` จริง (ไม่ใช่ศูนย์ล้วน) และ commit เข้า repo แล้ว
8. สร้างตัวแปร (Variables ไม่ใช่ Secrets) ชื่อ **BACKUP_ENABLED** ค่า `true`
9. ทดสอบ: Actions → Nightly backup → Run workflow รอให้เขียว แล้วเปิดโฟลเดอร์ใน Drive ต้องเห็น `daily/<วันที่>/qms.sql.bin`, `counts.json`, และโฟลเดอร์ `files/`

ความเป็นเจ้าของ: เมื่อผู้ดูแลระบบเปลี่ยนคน ให้ย้าย token ทั้งหมดและสิทธิ์เข้าถึงโฟลเดอร์ Drive ไปยังคนใหม่ และออก token ที่ผูกกับคนเก่าใหม่

## 3. ตรวจสอบเป็นประจำ

- ทุกสัปดาห์: ดูแท็บ Actions ว่ารอบ Nightly backup เขียวต่อเนื่อง และมีโฟลเดอร์วันล่าสุดใน Drive
- GitHub จะปิด workflow ตามตารางเวลาถ้า repo ไม่มีความเคลื่อนไหว 60 วัน ถ้าเห็นว่าถูกปิดให้กด Enable ใหม่
- ทุกต้นเดือน: ตรวจว่ามีโฟลเดอร์ `monthly/<yyyy-mm-01>` ของเดือนนั้น

## 4. การกู้คืน

เตรียมเครื่อง: ติดตั้ง Node.js, โคลน repo, `cd apps/api && npm ci`, ล็อกอิน `npx wrangler login`
สำหรับ backup ใน Drive ติดตั้ง rclone แล้วรัน `rclone config` สร้าง 2 remote: `gdrive` (ประเภท drive, root_folder_id = GDRIVE_FOLDER_ID) และ `safe` (ประเภท crypt ชี้ไป `gdrive:`, filename_encryption = off, directory_name_encryption = false, ใส่ BACKUP_PASSWORD)

### A. ข้อมูลผิดพลาดและรู้เวลาโดยประมาณ → ย้อนเวลา (เร็วที่สุด)
```
cd apps/api
npx wrangler d1 time-travel info DB                                  # ดู bookmark ปัจจุบัน จดไว้ก่อน
npx wrangler d1 time-travel restore DB --timestamp=2026-10-21T02:00:00Z
```
ฐานข้อมูลจะย้อนกลับไปเวลานั้นทันที คำสั่งจะแสดง bookmark ก่อนย้อน ให้เก็บไว้ ถ้าต้องการยกเลิกการย้อน ใช้ `--bookmark=<ค่านั้น>`
ใช้ได้เฉพาะภายในช่วงเวลาที่ Cloudflare เก็บให้ (หัวข้อ 1)

### B. ฐานข้อมูลเสียหายหรือเก่าเกินช่วง Time Travel → กู้จากไฟล์ใน Drive
```
rclone ls safe:daily                                    # เลือกวันที่ต้องการ
rclone copy "safe:daily/2026-10-21/qms.sql" .
cd apps/api
node scripts/backup-tools.js verify ../../qms.sql        # ต้องขึ้น "Backup verification passed."
npx wrangler d1 create qms-restored                      # สร้างฐานข้อมูลใหม่ที่ว่างเปล่า
npx wrangler d1 execute qms-restored --remote --file ../../qms.sql
```
จากนั้นแก้ `database_id` ใน wrangler.jsonc เป็นรหัสของ `qms-restored` แล้ว `npx wrangler deploy` ทดสอบล็อกอินและเปิดทะเบียนเอกสาร ให้เก็บฐานข้อมูลเก่าไว้จนมั่นใจว่าข้อมูลครบ ห้ามลบทันที
(ไฟล์ของเดือนเก่าอยู่ที่ `safe:monthly/<วันที่>`)

### C. ไฟล์ PDF หาย
```
rclone copy safe:files r2:qms-files --transfers 8
```
คำสั่งนี้ไม่เขียนทับไฟล์ที่มีอยู่แล้วที่ปลายทางโดยไม่จำเป็น และไม่ลบอะไร ต้องตั้ง remote `r2` ใน rclone ด้วย Access Key ที่มีสิทธิ์เขียน

### D. ปล่อยเวอร์ชันใหม่แล้วมีปัญหา → Rollback โค้ด API
```
cd apps/api
npx wrangler versions list                 # หา version ก่อนหน้า
npx wrangler rollback <version-id>
```
Rollback ไม่ย้อน migration ของฐานข้อมูล จึงมีกฎ: migration ต้อง **เพิ่มอย่างเดียว** (เพิ่มตาราง/คอลัมน์ที่มีค่า default) เพื่อให้โค้ดเวอร์ชันเก่าทำงานกับฐานข้อมูลใหม่ได้ ส่วนการลบหรือเปลี่ยนชื่อคอลัมน์ให้ทำในรอบ release ถัดไปหลังยืนยันแล้ว ถ้า migration ทำข้อมูลเสียหาย ใช้ข้อ A ย้อนกลับไปที่ bookmark ที่จดไว้ก่อน deploy

### E. Rollback หน้าเว็บ
Deploy คอมมิตเวอร์ชันก่อนหน้าอีกครั้ง (checkout tag ของ release ก่อนหน้า แล้ว build และ deploy) หรือใช้ปุ่ม Rollback ในหน้า Deployments ของ Cloudflare ถ้าโฮสต์บน Cloudflare Pages

## 5. เช็กลิสต์ก่อน deploy ทุกครั้ง

1. CI เขียวทั้ง web, e2e, api บน branch ที่จะ deploy
2. `npx wrangler d1 time-travel info DB` แล้วจด bookmark ลงบันทึกการปล่อย
3. สั่ง Nightly backup ด้วยมือ (Run workflow) และรอให้เขียว
4. ตรวจว่า migration ใหม่เป็นแบบเพิ่มอย่างเดียว (หัวข้อ 4 ข้อ D)
5. ปล่อยเวอร์ชัน:
   - API: `cd apps/api` แล้ว `npm run db:migrate:remote` ตามด้วย `npm run deploy`
   - เว็บ: `cd apps/web` ตั้ง `VITE_API_URL=https://qms-api.qms-api.workers.dev` แล้ว `npm run build` ตามด้วย `npx wrangler@4.151.3 deploy`
   - ที่อยู่ระบบ: เว็บ https://qms-web.qms-api.workers.dev, API https://qms-api.qms-api.workers.dev
6. ติด tag ใน git (เช่น `v1.0.0`) และบันทึกวันที่ ผู้ปล่อย และ bookmark

## 6. บันทึกการซ้อมกู้คืน (อย่างน้อยปีละ 2 ครั้ง)

ซ้อมโดยทำข้อ B ลงฐานข้อมูลชื่ออื่น (ไม่แตะฐานข้อมูลจริง) ล็อกอินและเปิดทะเบียนเอกสารเพื่อยืนยัน แล้วบันทึกเวลาที่ใช้

| วันที่ | ผู้ทำ | วิธี | ผล | เวลาที่ใช้ | หมายเหตุ |
|---|---|---|---|---|---|
| 2026-10-21 | ผู้พัฒนา (Claude) | ส่งออก-กู้คืน-ตรวจ บนเครื่องพัฒนา (`backup-tools.js verify`) | ผ่าน: ตารางและ trigger ครบ จำนวนแถวตรงกับต้นทาง สคริปต์ตรวจจับ dump ที่ trigger หาย, จำนวนแถวผิดช่วง และไฟล์ที่ไม่ใช่ SQL ได้ | ไม่กี่วินาที | ข้อมูลทดสอบ ยังไม่ใช่ระบบจริง |
| 2026-10-21 | ผู้พัฒนา (Claude) | รัน Nightly backup จริงบน GitHub Actions แล้วดาวน์โหลดจาก Google Drive มาถอดรหัสและกู้ลงฐานข้อมูลจำลองบนเครื่อง (`backup-tools.js verify`) | ผ่าน: ไฟล์บน Drive อ่านไม่ออกถ้าไม่มีรหัส ถอดรหัสแล้วกู้ได้ users=1, audit_log=2, migrations=6, trigger=2 | 4 วินาที (ขั้นกู้) | ฐานข้อมูลจริงยังมีข้อมูลน้อย ยังไม่ได้ซ้อมขั้นกู้ลงฐานข้อมูลจริงบน Cloudflare (ข้อ B ขั้นสุดท้าย) |
| | | | | | |

## 7. ข้อจำกัดที่ทราบ

- Workflow สำรองข้อมูลรันกับบัญชีจริงสำเร็จเมื่อ 2026-10-21 (ฐานข้อมูล, Drive, การอ่านกลับ) ส่วนการคัดลอก PDF ทดสอบได้เพียงกรณีที่เก็บไฟล์ว่าง จะยืนยันกับไฟล์จริงเมื่อมี PDF ชุดแรก
- ระบบใช้ OAuth client ของบริษัทเอง (ไม่ใช่ client กลางของ rclone) สถานะแอปใน Google Cloud เป็น In production ตรวจเมื่อ 2026-10-21 ห้ามเปลี่ยนกลับเป็น Testing เพราะ token จะหมดอายุใน 7 วัน ถ้าลบ OAuth client หรือถอนสิทธิ์ ต้องออก `GDRIVE_TOKEN` ใหม่ ไม่เช่นนั้น backup จะล้มเหลว
- Export ฐานข้อมูลของ D1 ทำให้ฐานข้อมูลไม่ตอบสนองช่วงสั้นๆ ระหว่าง export จึงตั้งเวลา 02:00
- D1 ไม่อนุญาตคำสั่ง `PRAGMA integrity_check` การตรวจจึงใช้การกู้คืนจริงลงฐานข้อมูลจำลองร่วมกับ foreign key check
- PDF ที่ถูกลบออกจาก R2 โดยตั้งใจ (เช่น ไฟล์ตกค้าง) จะยังอยู่ในชุด backup เพราะการคัดลอกไม่ลบ
