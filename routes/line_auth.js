// routes/line_auth.js
// LINE OAuth integration for registration
const axios = require('axios');

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_REDIRECT_URI = process.env.LINE_REDIRECT_URI || 'http://localhost:3000/auth/line/callback';

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

            // Check if this LINE User ID already exists in member_details
            const checkSql = 'SELECT user_id FROM member_details WHERE line_user_id = ?';
            db.query(checkSql, [lineUserId], (err, results) => {
                if (err) {
                    console.error('DB check error:', err);
                    return res.status(500).send('Database error');
                }

                if (results.length > 0) {
                    // User already registered via LINE, log them in
                    const userId = results[0].user_id;
                    const userSql = 'SELECT * FROM users WHERE id = ?';
                    db.query(userSql, [userId], (err, users) => {
                        if (err) {
                            console.error('DB select error:', err);
                            return res.status(500).send('Database error');
                        }

                        if (users.length > 0) {
                            const user = users[0];

                            // Fetch profile (member_details or staff_details) so we can populate first_name/last_name
                            const profileSql = (user.role === 'member') ? 'SELECT * FROM member_details WHERE user_id = ?' : 'SELECT * FROM staff_details WHERE user_id = ?';
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
                                        permissions: userPermissions
                                    };

                                    return res.redirect('/dashboard');
                                });
                            });

                        } else {
                            return res.status(404).send('User not found');
                        }
                    });
                } else {
                    // New LINE user - store LINE user ID in session and redirect to member registration form
                    req.session.lineUserId = lineUserId;
                    req.session.lineDisplayName = lineDisplayName;
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
            lineUserId: req.session.lineUserId
        });
    });

    // Step 4: Submit member details and create user account
    router.post('/line/register', async (req, res) => {
        const { username, password, confirm_password, first_name, last_name, address, phone_number } = req.body;
        const lineUserId = req.session.lineUserId;

        if (!lineUserId) {
            return res.status(400).json({ success: false, message: 'LINE session expired' });
        }

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
                    conn.query(userSql, [username, hashedPassword, 'member'], (err, userResult) => {
                        if (err) {
                            return conn.rollback(() => {
                                conn.release();
                                const msg = (err.code === 'ER_DUP_ENTRY') ? `Username '${username}' ถูกใช้แล้ว` : 'เกิดข้อผิดพลาดในการสร้าง User';
                                return res.status(400).json({ success: false, message: msg });
                            });
                        }

                        const newUserId = userResult.insertId;

                        // Insert member details with LINE user ID
                        const detailsSql = 'INSERT INTO member_details (user_id, first_name, last_name, address, phone_number, line_user_id) VALUES (?, ?, ?, ?, ?, ?)';
                        conn.query(detailsSql, [newUserId, first_name, last_name, address || null, phone_number || null, lineUserId], (err) => {
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

                                // Log in the new user (include profile names)
                                req.session.loggedin = true;
                                req.session.user = {
                                    id: newUserId,
                                    username: username,
                                    role: 'member',
                                    first_name: first_name,
                                    last_name: last_name,
                                    permissions: []
                                };

                                // Clear temp registration data
                                delete req.session.lineUserId;
                                delete req.session.lineDisplayName;
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

        } catch (error) {
            console.error('Error hashing password (line-register):', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้ารหัส' });
        }
    });

    return router;
};
