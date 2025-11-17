// routes/auth.js
const express = require('express');
const router = express.Router();
const saltRounds = 10;

module.exports = (db, bcrypt) => {

    router.get('/login', (req, res) => {
        res.render('auth/login'); // <-- ไม่ต้องส่ง message
    });

    // [อัปเดต!] เปลี่ยนเป็น AJAX/JSON
    router.post('/auth', (req, res) => {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'กรุณากรอก Username และ Password' });
        }

        const sql = 'SELECT * FROM users WHERE username = ?';
        db.query(sql, [username], async (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Database query error' });
            }
            if (results.length === 0) {
                return res.status(401).json({ success: false, message: 'Username ไม่ถูกต้อง' });
            }

            const user = results[0];
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (passwordMatch) {
                let profileSql = (user.role === 'member')
                    ? 'SELECT * FROM member_details WHERE user_id = ?'
                    : 'SELECT * FROM staff_details WHERE user_id = ?';

                db.query(profileSql, [user.id], (err, profileResults) => {
                    if (err || profileResults.length === 0) {
                        return res.status(500).json({ success: false, message: 'ไม่พบข้อมูล Profile ของผู้ใช้' });
                    }
                    const userProfile = profileResults[0];

                    const sqlPerms = `SELECT p.permission_key FROM role_permissions AS rp JOIN permissions AS p ON rp.permission_id = p.id WHERE rp.role = ?`;
                    db.query(sqlPerms, [user.role], (err, permResults) => {
                        if (err) {
                            return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงสิทธิ์' });
                        }
                        const userPermissions = permResults.map(p => p.permission_key);

                        req.session.loggedin = true;
                        req.session.user = {
                            id: user.id,
                            username: user.username,
                            role: user.role,
                            first_name: userProfile.first_name,
                            last_name: userProfile.last_name,
                            permissions: userPermissions,
                            
                            // ---- (เพิ่มส่วนที่ขาดหายไป) ----
                            profile_picture_url: userProfile.profile_picture_url || null,
                            address: userProfile.address || null,
                            phone_number: userProfile.phone_number || null,
                            employee_code: userProfile.employee_code || null
                        };

                        // [อัปเดต] ตอบ JSON กลับไป ให้ Client เปลี่ยนหน้าเอง
                        res.json({ success: true, redirect: '/dashboard' });
                    });
                });
            } else {
                return res.status(401).json({ success: false, message: 'Password ไม่ถูกต้อง' });
            }
        });
    });

    router.get('/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) {
                console.error('Session destruction error:', err);
            }
            res.redirect('/login');
        });
    });

    return router;
};