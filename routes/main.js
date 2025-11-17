// routes/main.js
const express = require('express');
const router = express.Router();
const saltRounds = 10;
// --- (เพิ่ม) ---
const upload = require('../middleware/upload'); // 1. นำเข้า Middleware

/* *
 * ====================================================================
 * การอัปโหลดไฟล์: 
 * ตอนนี้เราจะใช้ 'upload' Middleware ที่เราสร้างขึ้น
 * ====================================================================
 */

module.exports = (db, bcrypt) => {

    router.get('/', (req, res) => {
        res.redirect('/dashboard');
    });

    router.get('/dashboard', (req, res) => {
        res.render('dashboard');
    });

    router.get('/profile', (req, res) => {
        res.render('profile');
    });

    // [อัปเดต!] Route สำหรับการจัดการรูปโปรไฟล์ (ใช้ Multer)
    router.post(
        '/profile/upload-and-update', 
        upload.single('profile_picture_file'), // 2. ใช้ Middleware (ชื่อ 'profile_picture_file' ต้องตรงกับ <input>)
        async (req, res) => {
        
        const userId = req.session.user.id; 
        const userRole = req.session.user.role;
        
        // 3. ข้อมูล Text จะถูกย้ายไปอยู่ใน req.body (Multer จัดการให้)
        // (แก้ไข) - เปลี่ยน profile_picture_url เป็น existing_profile_url
        const { first_name, last_name, password, address, phone_number, employee_code, existing_profile_url } = req.body; 

        // 4. ไฟล์ที่อัปโหลดจะอยู่ใน req.file
        const uploadedFile = req.file;

        if (!first_name || !last_name) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อและนามสกุล' });
        }
        
        // -----------------------------------------------------------
        // 1. จัดการ URL รูปโปรไฟล์ (ใช้ไฟล์ที่อัปโหลด)
        // -----------------------------------------------------------
        
        // (แก้ไข) - ทำให้ Logic นี้ถูกต้อง
        // 1. เริ่มต้นด้วย URL ที่มีอยู่ (จาก hidden field หรือ session)
        let newProfilePictureUrl = existing_profile_url || req.session.user.profile_picture_url; 
        
        if (uploadedFile) {
            // 2. ถ้ามีไฟล์อัปโหลดใหม่, ให้ใช้ URL ของไฟล์นั้น
            // (เช่น /uploads/profile-1-12345.png)
            newProfilePictureUrl = `/uploads/${uploadedFile.filename}`;
        
        }
        // (ลบ) - ลบ
        
        try {
            // 2. อัปเดต Password (ถ้ามี)
            if (password) {
                const hashedPassword = await bcrypt.hash(password, saltRounds);
                const sqlPass = 'UPDATE users SET password = ? WHERE id = ?';
                db.query(sqlPass, [hashedPassword, userId], (err) => {
                    if (err) {
                        // ไม่ return เพราะต้องการให้การอัปเดตอื่นๆ ดำเนินการต่อไป
                        console.error('DB Update Password Error:', err);
                    }
                });
            }

            // 3. อัปเดต Profile Details ตาม Role (รวม profile_picture_url)
            const profileTable = (userRole === 'member') ? 'member_details' : 'staff_details';
            
            // เพิ่ม profile_picture_url ในทุก Role
            let sqlProfile = `UPDATE ${profileTable} SET first_name = ?, last_name = ?, profile_picture_url = ?`; 
            const params = [first_name, last_name, newProfilePictureUrl]; // ใช้ URL ใหม่

            // เพิ่มฟิลด์เฉพาะ Role
            if (userRole === 'member') {
                // ณ ตอนนี้ฟิลด์ address, phone_number ยังไม่ได้ถูกเพิ่มใน profile.ejs ที่คุณส่งมา
                // ดังนั้นจึงใช้ค่าเดิม (req.session.user.xxx) เป็นค่า fallback หากไม่มีใน req.body
                sqlProfile += `, address = ?, phone_number = ?`;
                params.push(address || req.session.user.address || null, phone_number || req.session.user.phone_number || null);

            } else { // staff หรือ admin
                // ณ ตอนนี้ฟิลด์ employee_code ยังไม่ได้ถูกเพิ่มใน profile.ejs ที่คุณส่งมา
                // ดังนั้นจึงใช้ค่าเดิม (req.session.user.xxx) เป็นค่า fallback 
                if (!employee_code) {
                    const existingCode = req.session.user.employee_code;
                    if (existingCode) {
                        sqlProfile += `, employee_code = ?`;
                        params.push(existingCode);
                    } else {
                        // ถ้าไม่มีทั้งใน req.body และ session และเป็น staff/admin ต้องบังคับให้มี
                        // (แต่เนื่องจากไม่มี field ใน EJS จะใช้ค่าเดิมใน session เป็นหลัก)
                        // หากมี field ใน EJS และค่าว่าง ต้องตรวจสอบที่ frontend
                    }
                } else {
                    sqlProfile += `, employee_code = ?`;
                    params.push(employee_code);
                }
            }

            sqlProfile += ` WHERE user_id = ?`;
            params.push(userId);

            db.query(sqlProfile, params, (err, result) => {
                if (err) {
                    console.error('DB Update Profile Error:', err);
                    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัปเดต Profile' });
                }
                
                // 4. อัปเดต Session ข้อมูลที่สำคัญ
                req.session.user.first_name = first_name;
                req.session.user.last_name = last_name;
                req.session.user.profile_picture_url = newProfilePictureUrl; // <-- อัปเดต URL รูปโปรไฟล์
                
                if (userRole === 'member') {
                    // อัปเดตฟิลด์อื่นๆ ที่ไม่ได้ส่งมา (ใช้ค่าเดิม)
                    req.session.user.address = address || req.session.user.address;
                    req.session.user.phone_number = phone_number || req.session.user.phone_number;
                } else {
                    req.session.user.employee_code = employee_code || req.session.user.employee_code;
                }

                res.json({ 
                    success: true, 
                    message: 'อัปเดตข้อมูลส่วนตัวสำเร็จ',
                    profile_picture_url: newProfilePictureUrl // ส่งกลับไปเผื่อการอัปเดตทันที
                });
            });

        } catch (error) {
            console.error('Error during profile update:', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้ารหัส/การประมวลผล' });
        }
    });


    return router;
};