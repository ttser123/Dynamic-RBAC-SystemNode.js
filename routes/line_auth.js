// routes/line_auth.js
// LINE OAuth integration for registration
const axios = require('axios'); // <--- (เพิ่ม) ต้องมี axios สำหรับ n8n
const fs = require('fs'); 
const path = require('path'); 

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_REDIRECT_URI = process.env.LINE_REDIRECT_URI || 'http://localhost:3000/auth/line/callback';
// (สำคัญ!) - เปลี่ยนจาก webhook-test (สำหรับทดสอบ) เป็น /webhook/ (สำหรับใช้งานจริง)
const N8N_WEBHOOK_URL_ID_LINE_USER = process.env.N8N_WEBHOOK_URL_ID_LINE_USER || 'http://localhost:5678/webhook/4fb6ce22-497e-4962-9e32-5d975dfc8292'; 

// --- (เพิ่ม) ---
// 1. กำหนดโฟลเดอร์สำหรับบันทึกไฟล์ (เหมือนกับใน upload.js)
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true }); // สร้างโฟลเดอร์หากยังไม่มี

/**
 * (เพิ่ม)
 * 2. Helper Function สำหรับดาวน์โหลดรูปภาพจาก URL และบันทึกลง Disk
 * @param {string} url - URL รูปภาพจาก LINE
 * @param {number} userId - ID ของผู้ใช้ (สำหรับตั้งชื่อไฟล์)
 * @returns {Promise<string|null>} - URL ภายใน (เช่น /uploads/...) หรือ null หากล้มเหลว
 */
async function downloadLineImage(url, userId) {
    if (!url) {
        return null;
    }

    try {
        // 1. โหลดรูปภาพในรูปแบบ Stream
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });

        // 2. หานามสกุลไฟล์ (เช่น jpg, png)
        const contentType = response.headers['content-type'];
        let extension = 'jpg'; // ค่าเริ่มต้น
        if (contentType && contentType.startsWith('image/')) {
            extension = contentType.split('/')[1];
        }

        // 3. สร้างชื่อไฟล์ที่ไม่ซ้ำกัน
        const filename = `line-profile-${userId}-${Date.now()}.${extension}`;
        const filePath = path.join(uploadDir, filename);

        // 4. สร้าง Stream สำหรับเขียนไฟล์
        const writer = fs.createWriteStream(filePath);

        // 5. ส่งข้อมูล (Pipe) จาก Stream ที่ดาวน์โหลดไปยัง Stream ที่เขียนไฟล์
        response.data.pipe(writer);

        // 6. รอจนกว่าไฟล์จะถูกเขียนเสร็จ
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(`/uploads/${filename}`)); // คืนค่า URL ภายใน
            writer.on('error', (err) => {
                console.error('File write error:', err);
                reject(err);
            });
        });

    } catch (error) {
        console.error(`Failed to download LINE image: ${error.message}`);
        return null; // คืนค่า null หากดาวน์โหลดล้มเหลว
    }
}
// --- (สิ้นสุดส่วนที่เพิ่ม) ---


module.exports = (db) => {
    const express = require('express');
    const router = express.Router();

    // Debug: Check LINE config
    router.get('/line/debug', (req, res) => {
        res.json({
            LINE_CHANNEL_ID: LINE_CHANNEL_ID ? '✅ Set' : '❌ Missing',
            LINE_CHANNEL_SECRET: LINE_CHANNEL_SECRET ? '✅ Set' : '❌ Missing',
            LINE_REDIRECT_URI: LINE_REDIRECT_URI,
            loginUrl: `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${LINE_CHANNEL_ID}&redirect_uri=${encodeURIComponent(LINE_REDIRECT_URI)}&state=test&scope=openid%20profile%20email`
        });
    });

    // Step 1: Redirect user to LINE Login (user clicks "Register with LINE" button)
    router.get('/line/login', (req, res) => {
        const state = Math.random().toString(36).substring(7); // Simple state token
        req.session.lineState = state;
        
        // LINE Login v2.1 OAuth endpoint
        const lineLoginUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${LINE_CHANNEL_ID}&redirect_uri=${encodeURIComponent(LINE_REDIRECT_URI)}&state=${state}&scope=openid%20profile%20email`;
        
        res.redirect(lineLoginUrl);
    });

    // Step 2: LINE OAuth Callback (LINE redirects here with auth code)
    router.get('/line/callback', async (req, res) => {
        const { code, state } = req.query;

        // Verify state token
        if (state !== req.session.lineState) {
            return res.status(400).send('Invalid state token');
        }

        try {
            // Exchange code for access token using LINE API
            const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token', {
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: LINE_REDIRECT_URI,
                client_id: LINE_CHANNEL_ID,
                client_secret: LINE_CHANNEL_SECRET
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const accessToken = tokenResponse.data.access_token;

            // Get user profile from LINE using ID Token or Profile API
            const profileResponse = await axios.get('https://api.line.me/v2/profile', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const lineUserData = profileResponse.data;
            const lineUserId = lineUserData.userId;
            const lineDisplayName = lineUserData.displayName;
            const linePictureUrl = lineUserData.pictureUrl || null; // <--- ดึงรูปโปรไฟล์

            // Check if this LINE User ID already exists in member_details
            const checkSql = 'SELECT user_id FROM member_details WHERE line_user_id = ?';
            
            // (เพิ่ม async)
            db.query(checkSql, [lineUserId], async (err, results) => {
                if (err) {
                    console.error('DB check error:', err);
                    return res.status(500).send('Database error');
                }

                if (results.length > 0) {
                    // User already registered via LINE, log them in
                    const userId = results[0].user_id;

                    // --- (แก้ไข) 3. ดาวน์โหลดรูปภาพและอัปเดต DB ---
                    let profileUrlToUse = linePictureUrl; // ใช้ URL เดิมจาก LINE เป็นค่าเริ่มต้น
                    try {
                        const localUrl = await downloadLineImage(linePictureUrl, userId);
                        if (localUrl) {
                            profileUrlToUse = localUrl; // ถ้าสำเร็จ, ใช้ URL ภายใน
                        }
                    } catch (downloadErr) {
                        console.error("LINE Pic Download Failed (Login):", downloadErr);
                        // หากล้มเหลว, profileUrlToUse จะยังคงเป็น URL จาก LINE
                    }

                    // อัปเดต DB (ไม่ว่าการดาวน์โหลดจะสำเร็จหรือไม่)
                    const updatePicSql = `UPDATE member_details SET line_user_id = ?, profile_picture_url = ? WHERE user_id = ?`;
                    db.query(updatePicSql, [lineUserId, profileUrlToUse, userId], (err) => {
                        if (err) console.error('DB update profile picture error:', err);
                    });
                    // --- (สิ้นสุดการแก้ไข) ---


                    const userSql = 'SELECT * FROM users WHERE id = ?';
                    db.query(userSql, [userId], (err, users) => {
                        if (err) {
                            console.error('DB select error:', err);
                            return res.status(500).send('Database error');
                        }

                        if (users.length > 0) {
                            const user = users[0];

                            // Fetch profile (member_details or staff_details) so we can populate first_name/last_name/profile_picture_url
                            const profileTableDetails = (user.role === 'member') ? 'member_details' : 'staff_details';
                            // SQL: ต้องมั่นใจว่า Profile Picture ถูก SELECT มาด้วย
                            const profileSql = `SELECT * FROM ${profileTableDetails} WHERE user_id = ?`;
                            
                            db.query(profileSql, [user.id], (err, profileResults) => {
                                if (err) {
                                    console.error('DB profile select error:', err);
                                    return res.status(500).send('Database error');
                                }

                                const userProfile = (profileResults && profileResults.length > 0) ? profileResults[0] : {};

                                // Fetch permissions
                                const sqlPerms = `SELECT p.permission_key FROM role_permissions AS rp JOIN permissions AS p ON rp.permission_id = p.id WHERE rp.role = ?`;
                                db.query(sqlPerms, [user.role], (err, permResults) => {
                                    const userPermissions = (!err && permResults) ? permResults.map(p => p.permission_key) : [];

                                    req.session.loggedin = true;
                                    req.session.user = {
                                        id: user.id,
                                        username: user.username,
                                        role: user.role,
                                        first_name: userProfile.first_name || null,
                                        last_name: userProfile.last_name || null,
                                        profile_picture_url: userProfile.profile_picture_url || null, // <--- มีอยู่แล้ว
                                        permissions: userPermissions,

                                        // ---- (เพิ่มส่วนที่ขาดหายไป - Login) ----
                                        address: userProfile.address || null,
                                        phone_number: userProfile.phone_number || null,
                                        employee_code: userProfile.employee_code || null
                                        // ---- (สิ้นสุดส่วนที่เพิ่ม) ----
                                    };

                                    return res.redirect('/dashboard');
                                });
                            });

                        } else {
                            return res.status(404).send('User not found');
                        }
                    });
                } else {
                    // New LINE user - store LINE user ID, display name, AND picture URL in session
                    req.session.lineUserId = lineUserId;
                    req.session.lineDisplayName = lineDisplayName;
                    req.session.linePictureUrl = linePictureUrl; // <--- เก็บ URL ภายนอกไว้ชั่วคราว
                    req.session.tempRegistration = true;

                    res.redirect('/auth/line/register');
                }
            });

        } catch (error) {
            console.error('LINE OAuth error:', error.response?.data || error.message);
            res.status(500).send(`LINE authentication failed: ${error.message}`);
        }
    });

    // Step 3: Show member registration form
    router.get('/line/register', (req, res) => {
        if (!req.session.lineUserId) {
            return res.redirect('/login');
        }

        res.render('auth/line_member_register', {
            lineDisplayName: req.session.lineDisplayName,
            lineUserId: req.session.lineUserId,
            linePictureUrl: req.session.linePictureUrl // <--- ส่ง URL รูปโปรไฟล์ไปที่หน้า Register
        });
    });

    // Step 4: Submit member details and create user account
    router.post('/line/register', async (req, res) => {
        const { username, password, confirm_password, first_name, last_name, address, phone_number } = req.body;
        const lineUserId = req.session.lineUserId;
        const linePictureUrl = req.session.linePictureUrl; // <--- ดึง URL ภายนอกจาก Session

        if (!lineUserId) {
            return res.status(400).json({ success: false, message: 'LINE session expired' });
        }
        
        // ... (validation remains the same)

        if (!username || !password || !first_name || !last_name) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        if (!confirm_password) {
            return res.status(400).json({ success: false, message: 'กรุณายืนยันรหัสผ่าน' });
        }

        if (password !== confirm_password) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านไม่ตรงกัน' });
        }


        try {
            const bcrypt = require('bcrypt');
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Get connection from pool for transaction
            db.getConnection((err, conn) => {
                if (err) {
                    console.error('DB getConnection error:', err);
                    return res.status(500).json({ success: false, message: 'Database connection error' });
                }

                conn.beginTransaction(txErr => {
                    if (txErr) {
                        conn.release();
                        console.error('beginTransaction error:', txErr);
                        return res.status(500).json({ success: false, message: 'Transaction error' });
                    }

                    // Insert user
                    const userSql = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
                    const userRole = 'member';
                    
                    // (เพิ่ม async)
                    conn.query(userSql, [username, hashedPassword, userRole], async (err, userResult) => {
                        if (err) {
                            return conn.rollback(() => {
                                conn.release();
                                const msg = (err.code === 'ER_DUP_ENTRY') ? `Username '${username}' ถูกใช้แล้ว` : 'เกิดข้อผิดพลาดในการสร้าง User';
                                return res.status(400).json({ success: false, message: msg });
                            });
                        }

                        const newUserId = userResult.insertId;

                        // --- (แก้ไข) 4. ดาวน์โหลดรูปภาพสำหรับผู้ใช้ใหม่ ---
                        let finalProfileUrl = linePictureUrl; // ค่าเริ่มต้น (URL ภายนอก)
                        try {
                            const localUrl = await downloadLineImage(linePictureUrl, newUserId);
                            if (localUrl) {
                                finalProfileUrl = localUrl; // ใช้ URL ภายในถ้าสำเร็จ
                            }
                        } catch (downloadErr) {
                            console.error("LINE Pic Download Failed (Register):", downloadErr);
                        }
                        // --- (สิ้นสุดการแก้ไข) ---

                        // Insert member details with LINE user ID and Profile Picture URL
                        const detailsSql = 'INSERT INTO member_details (user_id, first_name, last_name, address, phone_number, line_user_id, profile_picture_url) VALUES (?, ?, ?, ?, ?, ?, ?)';
                        
                        // (แก้ไข) ใช้ finalProfileUrl
                        conn.query(detailsSql, [newUserId, first_name, last_name, address || null, phone_number || null, lineUserId, finalProfileUrl], (err) => { 
                            if (err) {
                                return conn.rollback(() => {
                                    conn.release();
                                    console.error('Insert member_details error:', err);
                                    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสร้าง Profile' });
                                });
                            }

                            conn.commit(commitErr => {
                                if (commitErr) {
                                    return conn.rollback(() => {
                                        conn.release();
                                        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการ Commit' });
                                    });
                                }

                                conn.release();

                                // Fetch Permissions for the new user's role before setting the session
                                const sqlPerms = `SELECT p.permission_key FROM role_permissions AS rp JOIN permissions AS p ON rp.permission_id = p.id WHERE rp.role = ?`;

                                db.query(sqlPerms, [userRole], (err, permResults) => {
                                    const userPermissions = (!err && permResults) ? permResults.map(p => p.permission_key) : [];
                                    
                                    // Log in the new user (include profile names and fetched permissions)
                                    req.session.loggedin = true;
                                    req.session.user = {
                                        id: newUserId,
                                        username: username,
                                        role: userRole,
                                        first_name: first_name,
                                        last_name: last_name,
                                        profile_picture_url: finalProfileUrl, 
                                        permissions: userPermissions,
                                        
                                        // ---- (เพิ่มส่วนที่ขาดหายไป - Register) ----
                                        address: address || null,
                                        phone_number: phone_number || null
                                    };

                                    // ---n8n Webhook ---
                                    if (N8N_WEBHOOK_URL_ID_LINE_USER) {
                                        const newUserData = {
                                            userId: newUserId,
                                            username: username,
                                            firstName: first_name,
                                            lastName: last_name,
                                            lineUserId: lineUserId, // <--- นี่คือ ID ที่คุณต้องการ
                                            phone: phone_number || null,
                                            address: address || null,
                                            timestamp: new Date().toISOString() // (เพิ่ม) เวลาที่ลงทะเบียน
                                        };
                                        
                                        // --- (DEBUG) เพิ่ม console.log เพื่อตรวจสอบ ---
                                        console.log(`[Debug] Attempting to send data to n8n at: ${N8N_WEBHOOK_URL_ID_LINE_USER}`);
                                        console.log(`[Debug] Data:`, JSON.stringify(newUserData));
                                        // --- (END DEBUG) ---


                                        // ยิง Webhook ไปที่ n8n (ไม่ต้องรอ)
                                        axios.post(N8N_WEBHOOK_URL_ID_LINE_USER, newUserData)
                                            .catch(err => {
                                                // --- (DEBUG) เพิ่ม console.error เพื่อดูข้อผิดพลาด ---
                                                console.error("==============================================");
                                                console.error("[Non-blocking] n8n Webhook error:", err.message);
                                                if(err.code) console.error("[Debug] Error Code:", err.code); // เช่น ECONNREFUSED
                                                if(err.response) console.error("[Debug] Response Status:", err.response.status);
                                                console.error("==============================================");
                                                // --- (END DEBUG) ---
                                            });
                                    } else {
                                        console.warn("[Warning] N8N_WEBHOOK_URL_ID_LINE_USER is not set. Skipping sheet write.");
                                    }
                                    // --- (สิ้นสุดส่วนที่แก้ไข) ---

                                    // Clear temp registration data
                                    delete req.session.lineUserId;
                                    delete req.session.lineDisplayName;
                                    delete req.session.linePictureUrl; // <--- ลบ URL รูปโปรไฟล์ออกจาก Session
                                    delete req.session.tempRegistration;

                                    return res.json({
                                        success: true,
                                        message: `สมัครสมาชิกสำเร็จ ${username}`,
                                        redirect: '/dashboard'
                                    });
                                });
                            });
                        });
                    });
                });
            });

        } catch (error) {
            console.error('Error hashing password (line-register):', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้ารหัส' });
        }
    });

    return router;
};