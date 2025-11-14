// routes/admin.js
const express = require('express');
const router = express.Router();
const saltRounds = 10;

module.exports = (db, bcrypt) => {

    // (GET /manage-users)
    router.get('/manage-users', (req, res) => { 
        const searchQuery = req.query.search ? `%${req.query.search}%` : '%';
        const sql = `
            SELECT 
                u.id, u.username, u.role,
                IF(u.role = 'member', m.first_name, s.first_name) AS first_name,
                IF(u.role = 'member', m.last_name, s.last_name) AS last_name
            FROM users u
            LEFT JOIN member_details m ON u.id = m.user_id AND u.role = 'member'
            LEFT JOIN staff_details s ON u.id = s.user_id AND (u.role = 'admin' OR u.role = 'staff')
            WHERE 
                u.username LIKE ? OR
                (u.role = 'member' AND (m.first_name LIKE ? OR m.last_name LIKE ?)) OR
                (u.role != 'member' AND (s.first_name LIKE ? OR s.last_name LIKE ?))
            ORDER BY u.id DESC
        `;
        const params = [searchQuery, searchQuery, searchQuery, searchQuery, searchQuery];

        db.query(sql, params, (err, users) => {
            if (err) {
                console.error(err);
                users = [];
            }
            res.render('manage_users', { 
                users: users, 
                searchQuery: req.query.search || ''
            });
        });
    });

    // [อัปเดต!] (POST /add-user) - ตอบ JSON
    router.post('/add-user', async (req, res) => {
        const { username, password, first_name, last_name, role } = req.body;
        
        if (!username || !password || !first_name || !last_name || !role) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }
        
        try {
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Use a connection from the pool for transaction
            db.getConnection((err, conn) => {
                if (err) {
                    console.error('DB getConnection error (add-user):', err);
                    return res.status(500).json({ success: false, message: 'Database connection error' });
                }

                conn.beginTransaction(txErr => {
                    if (txErr) {
                        conn.release();
                        console.error('beginTransaction error (add-user):', txErr);
                        return res.status(500).json({ success: false, message: 'Transaction error' });
                    }

                    const userSql = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
                    conn.query(userSql, [username, hashedPassword, role], (err, userResult) => {
                        if (err) {
                            return conn.rollback(() => {
                                conn.release();
                                const msg = (err.code === 'ER_DUP_ENTRY') ? `Username '${username}' ถูกใช้แล้ว` : 'เกิดข้อผิดพลาดในการสร้าง User';
                                return res.status(400).json({ success: false, message: msg });
                            });
                        }

                        const newUserId = userResult.insertId;
                        const detailsSql = (role === 'member')
                            ? 'INSERT INTO member_details (user_id, first_name, last_name) VALUES (?, ?, ?)'
                            : 'INSERT INTO staff_details (user_id, first_name, last_name) VALUES (?, ?, ?)';

                        conn.query(detailsSql, [newUserId, first_name, last_name], (err, detailsResult) => {
                            if (err) {
                                return conn.rollback(() => {
                                    conn.release();
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
                                return res.json({ 
                                    success: true, 
                                    message: `เพิ่มผู้ใช้งาน ${username} สำเร็จ`,
                                    newUser: {
                                        id: newUserId,
                                        username: username,
                                        first_name: first_name,
                                        last_name: last_name,
                                        role: role
                                    }
                                });
                            });
                        });
                    });
                });
            });
        } catch (error) {
            console.error('Error hashing password (add-user):', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้ารหัส' });
        }
    });

    // [อัปเดต!] (POST /edit-user/:id) - ตอบ JSON
    router.post('/edit-user/:id', async (req, res) => {
        const userId = req.params.id;
        const { first_name, last_name, password, role } = req.body;
        
        let userUpdateFields = ['role = ?'];
        let userQueryValues = [role];

        if (password) {
            try {
                const hashedPassword = await bcrypt.hash(password, saltRounds);
                userUpdateFields.push('password = ?');
                userQueryValues.push(hashedPassword);
            } catch (error) {
                console.error('Error hashing password (edit-user):', error);
                return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเข้ารหัส' });
            }
        }
        userQueryValues.push(userId); 
        const sqlUsers = `UPDATE users SET ${userUpdateFields.join(', ')} WHERE id = ?`;

        db.query(sqlUsers, userQueryValues, (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัปเดต Users' });
            }

            const sqlStaff = 'UPDATE staff_details SET first_name = ?, last_name = ? WHERE user_id = ?';
            db.query(sqlStaff, [first_name, last_name, userId], (err) => {
                const sqlMember = 'UPDATE member_details SET first_name = ?, last_name = ? WHERE user_id = ?';
                db.query(sqlMember, [first_name, last_name, userId], (err) => {
                    res.json({ 
                        success: true, 
                        message: `แก้ไขข้อมูลผู้ใช้งาน ID: ${userId} สำเร็จ`,
                        updatedUser: {
                            id: Number(userId),
                            first_name: first_name,
                            last_name: last_name,
                            role: role
                        }
                    });
                });
            });
        });
    });

    // [อัปเดต!] (POST /delete-user/:id) - ตอบ JSON
    router.post('/delete-user/:id', (req, res) => {
        const userId = req.params.id;
        const sql = 'DELETE FROM users WHERE id = ?';
        db.query(sql, [userId], (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งานที่ต้องการลบ' });
            }
            res.json({ success: true, message: `ลบผู้ใช้งาน ID: ${userId} สำเร็จ` });
        });
    });

    // (GET /manage-permissions)
    router.get('/manage-permissions', (req, res) => {
        const sqlPerms = "SELECT * FROM permissions ORDER BY id";
        const sqlRoles = "SELECT * FROM role_permissions";

        db.query(sqlPerms, (err, allPermissions) => {
            if (err) { /* ... */ }
            db.query(sqlRoles, (err, rolePerms) => {
                if (err) { /* ... */ }
                const currentSettings = {};
                rolePerms.forEach(row => {
                    if (!currentSettings[row.role]) { currentSettings[row.role] = []; }
                    currentSettings[row.role].push(row.permission_id);
                });

                res.render('manage_permissions', {
                    allPermissions: allPermissions,
                    currentSettings: currentSettings
                });
            });
        });
    });

    // [อัปเดต!] (POST /manage-permissions/update) - ตอบ JSON
    router.post('/manage-permissions/update', (req, res) => {
        const settings = req.body.permissions || {};
        const rolesToUpdate = ['staff', 'member']; 

        const sqlDelete = "DELETE FROM role_permissions WHERE role IN (?)";
        db.query(sqlDelete, [rolesToUpdate], (err, result) => {
            if (err) { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบสิทธิ์เดิม' }); }

            const newValues = [];
            rolesToUpdate.forEach(role => {
                if (settings[role] && Array.isArray(settings[role])) {
                    settings[role].forEach(permId => {
                        newValues.push([role, parseInt(permId)]);
                    });
                }
            });

            if (newValues.length === 0) {
                return res.json({ success: true, message: 'ลบสิทธิ์ทั้งหมดของ Staff/Member สำเร็จ' });
            }

            const sqlInsert = "INSERT INTO role_permissions (role, permission_id) VALUES ?";
            db.query(sqlInsert, [newValues], (err, result) => {
                if (err) { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์ใหม่' }); }
                res.json({ success: true, message: 'อัปเดตสิทธิ์การเข้าถึงสำเร็จ' });
            });
        });
    });

    return router;
};