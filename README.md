# My-Portfolio

Portfolio ของ Vasin Kaewmoragot — https://diewland-portfolio.vasin.workers.dev

## โครงสร้างโฟลเดอร์

```
My Portfolio/
├── site/                     หน้าเว็บทั้งหมด (โฟลเดอร์นี้คือสิ่งที่ขึ้นเว็บจริง)
│   ├── index.html            หน้าเว็บหลัก (Profile / Film / Gallery)
│   ├── admin.html            หน้าแก้ไขเนื้อหา (ต้องใช้รหัสผ่าน)
│   ├── _headers              security headers ของ Cloudflare
│   ├── css/
│   │   ├── style.css         สไตล์หน้าเว็บหลัก
│   │   └── admin.css         สไตล์หน้า admin
│   ├── js/
│   │   ├── data.js           ข้อมูลที่ใช้ร่วมกัน: URL ของ API, รายการหนังเริ่มต้น
│   │   ├── main.js           logic หน้าเว็บหลัก
│   │   └── admin.js          logic หน้า admin
│   └── assets/
│       ├── icons/            ไอคอน Contact
│       └── images/           รูปโปรไฟล์, รูปกล้อง, gallery/<ปี>/ (สำรองเมื่อ IG ใช้ไม่ได้)
│
├── api/                      Cloudflare Worker: ดึงรูป Instagram + เก็บข้อมูลจากหน้า admin
│   ├── ig-gallery-worker.js
│   ├── wrangler.toml         ตั้งค่า Worker (KV, rate limit, โดเมนที่อนุญาต)
│   └── SETUP.md              วิธีตั้งค่า Instagram token / รหัสผ่าน admin
│
├── design/                   ไฟล์ออกแบบ (ไม่ขึ้นเว็บ)
│   ├── design_specification.md
│   └── screenshots/          ภาพดีไซน์จาก Figma
│
└── wrangler.jsonc            ตั้งค่า deploy หน้าเว็บ (ส่งเฉพาะโฟลเดอร์ site/)
```

## คำสั่งที่ใช้บ่อย

ดูเว็บในเครื่อง แล้วเปิด http://localhost:5500

```bash
python -m http.server 5500 --directory site
```

เอาหน้าเว็บขึ้นออนไลน์ (รันที่โฟลเดอร์หลัก)

```bash
npx wrangler deploy
```

อัปเดต API (Worker)

```bash
cd api
npx wrangler deploy
```

แก้รูป / หนัง / Recommend ผ่านหน้า admin ได้เลย ไม่ต้อง deploy: https://diewland-portfolio.vasin.workers.dev/admin
