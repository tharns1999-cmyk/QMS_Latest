# ขึ้นแอป QMS บน Azure (App Service แบบ Node ไม่ใช้ Docker)

เขียนสำหรับ IT สถานะ: ขั้นตอน build ทดสอบจำลองบนเครื่องผู้พัฒนาแล้ว (แพ็กเกจติดตั้งและเริ่มทำงานได้) แต่ **ยังไม่เคยขึ้น Azure จริง** รอบแรกให้ถือว่าเป็นการทดสอบ รายการตรวจอยู่ใน [azure-uat-checklist.md](azure-uat-checklist.md)

## ภาพรวม
- แอปเดียวทำทั้ง API และหน้าเว็บ (API เปิดไฟล์เว็บเองจากที่อยู่เดียวกัน) ไม่ต้องมีโฮสต์เว็บแยก
- GitHub เป็นผู้ build และส่งขึ้น Azure (workflow `Deploy to Azure`) ไม่มีใครต้องติดตั้ง Docker หรือ build บนเครื่องตัวเอง
- ใช้ App Service **Linux แบบ Node (code)** ไม่ต้องมี Container Registry

## 1. สิ่งที่ IT สร้างใน Azure (แยก UAT กับ PROD)
- App Service (Linux, Runtime **Node 24** ตามที่ใช้ทดสอบ ถ้า Azure ยังไม่มี Node 24 ให้แจ้งผู้พัฒนา อย่าเลือกเวอร์ชันอื่นเอง)
- Azure Database for PostgreSQL ตาม [azure-database-setup.md](azure-database-setup.md)
- Storage account และ container (ชื่อตั้งต้น `qms-files`) ภูมิภาคเดียวกับแอปและฐานข้อมูล
- เปิด Managed Identity ของ App Service แล้วให้สิทธิ์ **Storage Blob Data Contributor** บน Storage account นั้น
- แจ้งผู้พัฒนา: **ที่อยู่เว็บที่ผู้ใช้จะเปิด** (เช่น `https://qms-uat.azurewebsites.net`) และชื่อ App Service

## 2. ตั้งค่า GitHub ให้ส่งงานขึ้น Azure (ทำครั้งเดียวต่อสภาพแวดล้อม)
ใช้การยืนยันตัวตนแบบ OIDC (ไม่ต้องเก็บรหัสผ่านใน GitHub)
1. ใน Entra: App registrations > New registration ตั้งชื่อ เช่น `QMS GitHub Deploy` (คนละตัวกับแอปล็อกอิน)
2. แอปนั้น > Certificates & secrets > **Federated credentials** > Add > GitHub Actions deploying Azure resources
   - Organization/Repository: ชื่อเจ้าของและ `QMS_Latest` (ดูจากที่อยู่ repo บน GitHub)
   - Entity type: **Environment** ชื่อ `uat` (ทำอีกชุดสำหรับ `production`)
3. ที่ App Service > Access control (IAM) > ให้แอปนั้นมีบทบาท **Website Contributor** (หรือ Contributor) เฉพาะ App Service ตัวนั้น
4. ใน GitHub: Settings > Environments > สร้าง `uat` (และ `production`) แล้วตั้งค่า
   | ชนิด | ชื่อ | ค่า |
   |---|---|---|
   | Secret | `AZURE_CLIENT_ID` | Application (client) ID ของ `QMS GitHub Deploy` |
   | Secret | `AZURE_TENANT_ID` | Directory (tenant) ID |
   | Secret | `AZURE_SUBSCRIPTION_ID` | Subscription ID |
   | Variable | `AZURE_WEBAPP_NAME` | ชื่อ App Service |
   | Variable | `AZURE_SITE_URL` | ที่อยู่เว็บ ขึ้นต้น `https://` **ไม่มี `/` ท้าย** ตรงกับ `ALLOWED_ORIGIN` ทุกตัวอักษร |
5. แนะนำ: ตั้ง Required reviewers ที่ environment `production` เพื่อกันการส่งขึ้นจริงโดยไม่ตั้งใจ

ที่อยู่เว็บถูกฝังในหน้าเว็บตอน build **เปลี่ยนที่อยู่ต้อง deploy ใหม่** ตัว build ปรับรายการที่เบราว์เซอร์เรียกได้ (`connect-src` ใน `apps/web/public/_headers`) ให้เป็นที่อยู่นี้เอง ไม่ต้องแก้ไฟล์ด้วยมือ ถ้าที่อยู่ผิดรูป workflow จะหยุดพร้อมข้อความ

## 3. Application settings ของ App Service
| ชื่อ | ค่า |
|---|---|
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` (แพ็กเกจ build มาครบแล้ว ห้ามให้ Azure build ซ้ำ) |
| `WEBSITES_PORT` | `8080` |
| `WEB_DIST_DIR` | `/home/site/wwwroot/web` |
| `DATABASE_URL` | ดู [azure-database-setup.md](azure-database-setup.md) (ต้องมี `?sslmode=require`) |
| `JWT_SECRET` | สุ่มอย่างน้อย 32 ตัวอักษร เก็บเป็นความลับ |
| `ALLOWED_ORIGIN` | ที่อยู่เว็บ (ตัวเดียวกับ `AZURE_SITE_URL`) |
| `AZURE_STORAGE_ACCOUNT` | ชื่อ Storage account |
| `AZURE_STORAGE_CONTAINER` | ค่าตั้งต้น `qms-files` (ต้องสร้างไว้ก่อน) |
| `AUTH_MODE` และ `ENTRA_*` | ดู [azure-entra-signin.md](azure-entra-signin.md) |
| `CLIENT_IP_HEADER` | `X-Forwarded-For` (ดูหมายเหตุท้ายเอกสาร) |

ตั้ง **Startup Command** (Configuration > General settings) เป็น:
```
node api/src/node/main.js
```
ตัวเลือกอื่นอ่านจาก `apps/api/src/node/config.js` ถ้าตั้งผิดหรือไม่ครบ แอปจะไม่เริ่มและบอกสาเหตุใน Log stream

## 4. ลำดับการขึ้นแต่ละครั้ง
1. ถ้ารุ่นนี้มีไฟล์ใหม่ใน `apps/api/migrations-pg/` ให้รัน migration กับฐานข้อมูลก่อน: `pnpm --dir apps/api run db:migrate:pg` (ตั้ง `DATABASE_URL` ในเครื่องที่รัน) แอปจะ **ไม่ยอมเริ่ม** ถ้าโครงสร้างตารางไม่ตรงกับโค้ด ถ้าลืม ให้รัน migration แล้ว Restart App Service
2. GitHub > Actions > **Deploy to Azure** > Run workflow > เลือก `uat` หรือ `production`
3. ตรวจตามหัวข้อถัดไป

ย้ายข้อมูลเดิมครั้งแรกตอน cut-over ใช้ `db:move:pg` และ `scripts/migrate-files-to-blob.js` (ดู [azure-migration-handoff.md](azure-migration-handoff.md))

## 5. ตรวจหลังขึ้น
- `GET /healthz` ตอบ 200 (503 ถ้าต่อฐานข้อมูลไม่ได้) ตั้งเป็น Health check ของ App Service ได้
- Log stream ต้องเห็น `api_started` และไม่มี `database_set_up_wrong`, `database_schema_not_current`, `file_store_unavailable`, `config_invalid`
- กด Stop แล้ว log ต้องมี `api_stopping` (ยืนยันการปิดแบบเรียบร้อยบน Linux)

## ทางเลือก: ใช้ Container
ที่ราก repo มี `Dockerfile` สำหรับกรณี IT ต้องการ container (ต้อง build ที่ใดที่หนึ่ง เช่น `az acr build` หรือ GitHub แล้วส่งเข้า Container Registry) **ไม่จำเป็นสำหรับแนวทางข้างต้น** และยังไม่เคยถูกทดสอบ build

## หมายเหตุที่ต้องยืนยันตอน UAT
- **Node 24 บน App Service** ต้องมีให้เลือกจริง
- **`CLIENT_IP_HEADER`**: ใช้จำกัดจำนวนครั้งที่ใส่รหัสผิดต่อที่อยู่ ในโหมด `AUTH_MODE=entra` ไม่มีการใส่รหัสผ่านอยู่แล้ว จึงแทบไม่มีผล โค้ดรับ `X-Forwarded-For` (ใช้ค่าท้ายสุด ตัดพอร์ตให้) ถ้าแอปอยู่หลัง Front Door ให้ตรวจว่าค่าท้ายสุดคือ Front Door ไม่ใช่ที่อยู่ผู้ใช้ ถ้าไม่แน่ใจให้เว้นว่าง (ระบบข้ามการจำกัดนี้ ไม่ใช่ข้อผิดพลาด)
- **Startup Command และ `WEB_DIST_DIR`**: ต้องชี้ถึงโฟลเดอร์ที่ workflow วางไว้ (`api/` และ `web/` ใต้ `/home/site/wwwroot`)
