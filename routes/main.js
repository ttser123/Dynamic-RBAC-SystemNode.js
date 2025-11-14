// routes/main.js
const express = require('express');
const router = express.Router();
const saltRounds = 10;

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

    // [อัปเดต!] เปลี่ยนเป็น AJAX/JSON
    router.post('/profile/update', async (req, res) => {
        const userId = req.session.user.id; 
        const userRole = req.session.user.role;
        const { first_name, last_name, password } = req.body;

        if (!first_name || !last_name) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อและนามสกุล' });
        }

        try {
            // 1. อัปเดต Password (ถ้ามี)
            if (password) {
                const hashedPassword = await bcrypt.hash(password, saltRounds);
                const sqlPass = 'UPDATE users SET password = ? WHERE id = ?';
                db.query(sqlPass, [hashedPassword, userId], (err) => {
                    if (err) {
                        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัปเดตรหัสผ่าน' });
                    }
                });
            }

            // 2. อัปเดต Profile
            const profileTable = (userRole === 'member') ? 'member_details' : 'staff_details';
            const sqlProfile = `UPDATE ${profileTable} SET first_name = ?, last_name = ? WHERE user_id = ?`;

            db.query(sqlProfile, [first_name, last_name, userId], (err, result) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัปเดต Profile' });
                }
                
                // อัปเดต Session
                req.session.user.first_name = first_name;
                req.session.user.last_name = last_name;

                // [อัปเดต] ตอบ JSON
                res.json({ 
                    success: true, 
                    message: 'อัปเดตข้อมูลส่วนตัวสำเร็จ',
                    updatedUser: {
                        first_name: first_name,
                        last_name: last_name
                    }
                });
            });

        } catch (error) {
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้ารหัส' });
        }
    });

    return router;
};