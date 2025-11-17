// middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. กำหนดตำแหน่งที่จะบันทึกไฟล์
// เราจะชี้ไปที่โฟลเดอร์ 'public/uploads' ที่อยู่นอกโฟลเดอร์ 'middleware'
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');

// 2. ตรวจสอบและสร้างโฟลเดอร์ 'public/uploads' หากยังไม่มี
// (fs.mkdirSync จะสร้างโฟลเดอร์ให้ทันที)
fs.mkdirSync(uploadDir, { recursive: true });

// 3. ตั้งค่า DiskStorage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // บันทึกไฟล์ไปยัง 'public/uploads'
    },
    filename: (req, file, cb) => {
        // 4. สร้างชื่อไฟล์ที่ไม่ซ้ำกัน
        // (เช่น profile-123456789.png)
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname); // .png
        const newFilename = `profile-${req.session.user.id}-${uniqueSuffix}${fileExtension}`;
        cb(null, newFilename);
    }
});

// 5. สร้าง Middleware
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 5 // จำกัดขนาดไฟล์ 5 MB
    },
    fileFilter: (req, file, cb) => {
        // อนุญาตเฉพาะไฟล์รูปภาพ
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น'), false);
        }
    }
});

module.exports = upload;