# ขึ้นแอป QMS บน Azure (App Service แบบ Container)

เขียนสำหรับ IT สถานะ: เขียนจาก `Dockerfile` ที่ราก repo **ยังไม่เคย build หรือรันบน Azure จริง** (เครื่องผู้พัฒนาไม่มี Docker) รอบแรกให้ถือว่าเป็นการทดสอบ

## ภาพรวม
Container เดียวทำทั้ง API และหน้าเว็บ (API เปิดไฟล์เว็บเองจากที่อยู่เดียวกัน) จึงไม่ต้องมีโฮสต์เว็บแยก

## 1. Build image
```
docker build --build-arg VITE_API_URL=https://<ที่อยู่ที่คนเปิดใช้> -t qms .
```
- `VITE_API_URL` ต้องเป็น https ไม่มี `/` ท้าย และตรงกับ `ALLOWED_ORIGIN` ทุกตัวอักษร ที่อยู่นี้ถูกฝังในหน้าเว็บ **เปลี่ยนที่อยู่ต้อง build ใหม่**
- ตัว build ปรับรายการที่เบราว์เซอร์เรียกได้ (`connect-src` ใน `apps/web/public/_headers`) ให้เป็นที่อยู่นี้เอง ไม่ต้องแก้ไฟล์ด้วยมือ ถ้าที่อยู่ผิดรูป build จะหยุดพร้อมข้อความ

## 2. Application settings ของ App Service
| ชื่อ | ค่า |
|---|---|
| `WEBSITES_PORT` | `8080` |
| `DATABASE_URL` | ดู [azure-database-setup.md](azure-database-setup.md) (ต้องมี `?sslmode=require`) |
| `JWT_SECRET` | สุ่มอย่างน้อย 32 ตัวอักษร เก็บเป็นความลับ |
| `ALLOWED_ORIGIN` | ที่อยู่ที่คนเปิดใช้ (ตัวเดียวกับ `VITE_API_URL`) |
| `AZURE_STORAGE_ACCOUNT` | ชื่อ Storage account (ให้ Managed Identity ของแอปมีสิทธิ์ **Storage Blob Data Contributor**) |
| `AZURE_STORAGE_CONTAINER` | ค่าตั้งต้น `qms-files` (ต้องสร้างไว้ก่อน) |
| `AUTH_MODE` และ `ENTRA_*` | ดู [azure-entra-signin.md](azure-entra-signin.md) |
| `CLIENT_IP_HEADER` | `X-Forwarded-For` (ดูหมายเหตุ) |

ตัวเลือกอื่นอ่านจาก `apps/api/src/node/config.js` ถ้าตั้งผิดหรือไม่ครบ แอปจะไม่เริ่มและบอกสาเหตุใน log

## 3. ก่อนเปิดแอปครั้งแรก
รัน migration กับฐานข้อมูลก่อน (แอปจะไม่เริ่มถ้าโครงสร้างตารางไม่ตรงกับโค้ด):
```
pnpm --dir apps/api run db:migrate:pg
```
ย้ายข้อมูลเดิมตอน cut-over ด้วย `db:move:pg` และ `scripts/migrate-files-to-blob.js` (ดู handoff)

## 4. ตรวจหลังขึ้น
- `GET /healthz` ตอบ 200 (503 ถ้าต่อฐานข้อมูลไม่ได้) ใช้เป็น health check ของ App Service
- ดู Log stream ต้องเห็น `api_started` และไม่มี `database_set_up_wrong`, `file_store_unavailable`
- ปิดแอป (Stop) แล้ว log ต้องมี `api_stopping` (ยืนยันการปิดแบบเรียบร้อยบน Linux)

## หมายเหตุที่ต้องยืนยันตอน UAT
- **`CLIENT_IP_HEADER`**: ใช้จำกัดจำนวนครั้งที่ใส่รหัสผิดต่อที่อยู่ ในโหมด `AUTH_MODE=entra` ไม่มีการใส่รหัสผ่านอยู่แล้ว จึงแทบไม่มีผล โค้ดรับ `X-Forwarded-For` (ใช้ค่าท้ายสุด ตัดพอร์ตให้) ถ้าแอปอยู่หลัง Front Door ให้ตรวจว่าค่าท้ายสุดคือ Front Door ไม่ใช่ที่อยู่ผู้ใช้ และถ้าไม่แน่ใจให้เว้นว่าง (ระบบข้ามการจำกัดนี้ ไม่ใช่ข้อผิดพลาด)
- Container ใช้ `pnpm` ผ่าน corepack ตามเวอร์ชันใน `package.json` ถ้า build พังตรงขั้นนี้ แจ้งผู้พัฒนา
