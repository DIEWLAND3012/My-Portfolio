# ตั้งค่า Gallery ดึงรูปจาก Instagram อัตโนมัติ

ภาพรวม: เว็บ → Cloudflare Worker (เก็บ Token) → Instagram API → ได้รูปทุกโพสต์ แบ่งตามปีที่โพสต์
บัญชี `v.k_dl` เป็น Professional อยู่แล้ว จึงใช้ **Instagram API with Instagram Login** ได้เลย (ไม่ต้องผูก Facebook Page)

> สิ่งที่ต้องทำเองทั้งหมดคือการล็อกอินและกดยืนยันบนเว็บ Meta / Cloudflare — ห้ามส่ง Token ให้ใคร

---

## ขั้นที่ 1 — สร้าง App และขอ Token (Meta)

1. เข้า https://developers.facebook.com → **My Apps → Create App**
2. Use case เลือก **"Manage messaging & content on Instagram"** (หรือ Other → Business) แล้วสร้าง App
3. ในเมนู App ไปที่ **Instagram → API setup with Instagram login**
4. หัวข้อ **"Generate access tokens"** → **Add account** → ล็อกอิน IG `v.k_dl` แล้วกดอนุญาต
   - ถ้าขึ้นว่าต้องเพิ่มเป็นผู้ทดสอบ: ไปที่ **App roles → Roles → Add People → Instagram Tester** ใส่ `v.k_dl`
     แล้วกดยอมรับคำเชิญในแอป IG (Settings → Website permissions / Apps and websites → Tester invites)
5. กด **Generate token** → คัดลอก Token ที่ได้ (เป็น Long-lived token อายุ 60 วัน — Worker จะต่ออายุให้เอง)
6. ทดสอบ: เปิดลิงก์นี้ในเบราว์เซอร์ (แทน TOKEN) ต้องเห็นรายการโพสต์
   `https://graph.instagram.com/me/media?fields=id,media_type,timestamp&access_token=TOKEN`

> โหมด Development ใช้กับบัญชีตัวเองได้เลย ไม่ต้องส่ง App Review

---

## ขั้นที่ 2 — Deploy Worker (Cloudflare, ฟรี)

1. สมัคร/ล็อกอิน https://dash.cloudflare.com
2. เปิด Terminal ที่โฟลเดอร์ `api` แล้วรันทีละคำสั่ง:

```bash
npx wrangler login
```

```bash
npx wrangler kv namespace create IG_KV
```
   คัดลอก `id` ที่ได้ ไปแทน `PUT_KV_NAMESPACE_ID_HERE` ใน `wrangler.toml`

```bash
npx wrangler secret put IG_TOKEN
```
   วาง Token จากขั้นที่ 1 แล้วกด Enter

```bash
npx wrangler deploy
```
3. จะได้ URL เช่น `https://vk-ig-gallery.<ชื่อ>.workers.dev` — เปิดดูต้องเห็น JSON ที่มี `years`

---

## ขั้นที่ 3 — เชื่อมกับเว็บ

ใน `site/js/data.js` ใส่ URL ของ Worker:

```js
const WORKER_URL = "https://vk-ig-gallery.<ชื่อ>.workers.dev";
```

เมื่อ deploy เว็บจริงแล้ว แนะนำให้แก้ `ALLOWED_ORIGIN` ใน `wrangler.toml` เป็นโดเมนเว็บ แล้ว `npx wrangler deploy` อีกครั้ง

---

## ขั้นที่ 4 — เปิดใช้หน้าแก้ไข (admin.html)

ในโฟลเดอร์ `api` รัน:

```bash
npx wrangler secret put ADMIN_PASSWORD
```
   ตั้งรหัสผ่านยาวๆ (แนะนำ 16 ตัวขึ้นไป) — รหัสนี้ตรวจที่ Worker ไม่ได้อยู่ในโค้ดหน้าเว็บ

```bash
npx wrangler deploy
```

จากนั้นเปิด `admin.html` (เช่น `http://localhost:5501/admin.html` หรือ `https://<โดเมน>/admin.html`) แล้วใส่รหัสผ่าน

ทำอะไรได้บ้าง
- **Gallery**: ซ่อน/แสดงรูป IG ทีละรูป, ซ่อนปก Reels ทั้งหมดในคลิกเดียว (เปิดไว้เป็นค่าเริ่มต้น), แก้คำอธิบาย, อัปโหลดรูปเพิ่มตามปี, ลบรูปที่อัปโหลด
- **Films**: เพิ่ม/ลบ/แก้/เรียงลำดับหนัง วางลิงก์ YouTube ได้ทุกแบบ
- กด **บันทึก** แล้วหน้าเว็บอัปเดตภายใน ~1 นาที

ความปลอดภัยเพิ่มเติม (แนะนำเมื่อขึ้นเว็บจริง): ใช้ **Cloudflare Access** (Zero Trust, ฟรี 50 คน) ล็อก path `/admin*` ของ Worker
และ `admin.html` ให้เข้าได้เฉพาะอีเมลคุณ

---

## การทำงาน
- โพสต์ใหม่บน IG จะขึ้นเว็บภายใน ~1 ชั่วโมง (Cache) — แก้ได้ที่ `CACHE_SECONDS`
- โพสต์แบบอัลบั้ม → แตกเป็นทุกรูป, วิดีโอ/Reels → ใช้ภาพปก
- แบ่งปีตามวันที่โพสต์ ชื่อการ์ดใช้บรรทัดแรกของแคปชัน
- ถ้า Worker ล่ม/Token หมดอายุ เว็บจะกลับไปใช้รูปในโฟลเดอร์ `site/assets/images/gallery/<ปี>/` อัตโนมัติ
- Token ต่ออายุเองทุกวันจันทร์ (cron) — ถ้าเว็บไม่ได้เปิดนานเกิน 60 วันแล้ว Token หมด ให้ทำขั้นที่ 1 ข้อ 5 และ `wrangler secret put IG_TOKEN` ใหม่
