const express = require('express');
const mysql = require('mysql');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const flash = require('connect-flash');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = 3000;
const saltRounds = 10; 

// --- 1. Database Connection ---
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'crud_db'
});

db.connect(err => {
    if (err) {
        console.error('Error connecting to MySQL:', err.stack);
        return;
    }
    console.log('Connected to MySQL as id ' + db.threadId);
});

// --- 2. Middleware Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true })); 
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'YOUR_VERY_SECURE_SECRET_KEY_DEFAULT',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 ชั่วโมง
}));

app.use(flash()); 

// --- 3. Authorization Middleware (ตรวจสอบสิทธิ์) ---

// 3.1 ตรวจสอบว่า Login แล้วหรือยัง (ทุกหน้าที่ถูกป้องกันต้องใช้)
const isAuthenticated = (req, res, next) => {
    if (req.session.loggedin) {
        // ส่งข้อมูล user และ flash messages ไปยังทุกหน้า EJS
        res.locals.user = req.session.user;
        res.locals.messages = {
            success: req.flash('success'),
            error: req.flash('error')
        };
        next();
    } else {
        res.redirect('/login');
    }
};

// 3.2 ตรวจสอบสิทธิ์ Admin 
const isAdmin = (req, res, next) => {
    if (req.session.loggedin && req.session.user.role === 'admin') {
        next();
    } else {
        req.flash('error', 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะ Admin)');
        res.redirect('/dashboard'); 
    }
};

/**
 * 3.3 Middleware ตรวจสอบสิทธิ์การเข้าถึง (Permission Key)
 * @param {string} requiredPermissionKey - คีย์ของสิทธิ์ที่ต้องการสำหรับหน้านี้ 
 */
const checkPermission = (requiredPermissionKey) => {
    return (req, res, next) => {
        // Admin เข้าได้ทุกหน้า (Bypass)
        if (req.session.user.role === 'admin') {
            return next();
        }

        // ตรวจสอบสิทธิ์ใน Session (ที่ดึงมาตอน Login)
        const userPermissions = req.session.user.permissions || [];
        
        if (userPermissions.includes(requiredPermissionKey)) {
            next(); // <-- มีสิทธิ์
        } else {
            // ไม่มีสิทธิ์
            req.flash('error', 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
            res.redirect('/dashboard');
        }
    };
};

// --- 4. Authentication Routes (Login/Logout) ---

app.get('/login', (req, res) => {
    res.render('login', { message: req.flash('error')[0] });
});

app.post('/auth', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        req.flash('error', 'กรุณากรอก Username และ Password');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE username = ?';
    db.query(sql, [username], async (err, results) => {
        if (err) {
            console.error(err);
            req.flash('error', 'เกิดข้อผิดพลาดของระบบ');
            return res.redirect('/login');
        }
        if (results.length === 0) {
            req.flash('error', 'Username ไม่ถูกต้อง');
            return res.redirect('/login');
        }

        const user = results[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (passwordMatch) {
            
            // [สำคัญ] ดึง "permission_key" (String) ไม่ใช่ "permission_id" (Number)
            const sqlPerms = `
                SELECT p.permission_key 
                FROM role_permissions AS rp
                JOIN permissions AS p ON rp.permission_id = p.id
                WHERE rp.role = ?
            `;
            
            db.query(sqlPerms, [user.role], (err, permResults) => {
                if (err) {
                    req.flash('error', 'เกิดข้อผิดพลาดในการดึงสิทธิ์');
                    return res.redirect('/login');
                }

                // แปลงผลลัพธ์ [ {permission_key: '...'}, ... ] -> ['...', '...']
                const userPermissions = permResults.map(p => p.permission_key);

                req.session.loggedin = true;
                req.session.user = {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    permissions: userPermissions // <-- เก็บสิทธิ์เป็น String Keys
                };
                
                res.redirect('/dashboard');
            });
        } else {
            req.flash('error', 'Password ไม่ถูกต้อง');
            res.redirect('/login');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
        }
        res.redirect('/login');
    });
});

// --- 5. Main Application Routes ---
app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

// ทุก Route ด้านล่างนี้ต้อง Login ก่อน (ใช้ isAuthenticated)
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.session.user });
});

// ตรวจสอบสิทธิ์ว่ามี 'edit_own_profile' หรือไม่
app.get('/profile', isAuthenticated, checkPermission('edit_own_profile'), (req, res) => {
    res.render('profile', { user: req.session.user });
});

app.post('/profile/update', isAuthenticated, checkPermission('edit_own_profile'), async (req, res) => {
    const userId = req.session.user.id; 
    const { first_name, last_name, password } = req.body;

    if (!first_name || !last_name) {
        req.flash('error', 'กรุณากรอกชื่อและนามสกุล');
        return res.redirect('/profile');
    }

    let updateFields = ['first_name = ?', 'last_name = ?'];
    let queryValues = [first_name, last_name];

    try {
        if (password) {
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            updateFields.push('password = ?');
            queryValues.push(hashedPassword);
        }
        
        queryValues.push(userId); 
        const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;

        db.query(sql, queryValues, (err, result) => {
            if (err) {
                console.error(err);
                req.flash('error', 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล');
                return res.redirect('/profile');
            }

            // อัปเดตข้อมูลใน Session ด้วย
            req.session.user.first_name = first_name;
            req.session.user.last_name = last_name;

            req.flash('success', 'อัปเดตข้อมูลส่วนตัวสำเร็จ');
            res.redirect('/profile');
        });

    } catch (error) {
        console.error(error);
        req.flash('error', 'เกิดข้อผิดพลาดในการเข้ารหัสรหัสผ่าน');
        res.redirect('/profile');
    }
});

// --- 6. Staff Routes ---
app.get('/member-list', isAuthenticated, checkPermission('view_member_list'), (req, res) => {
    // ... Logic ...
    res.render('member_list', { user: req.session.user }); 
});


// --- 7. Admin Routes ---

// 7.1 Admin CRUD Users
app.get('/admin/manage-users', isAuthenticated, isAdmin, (req, res) => { 
    const searchQuery = req.query.search ? `%${req.query.search}%` : '%';
    const sql = `
        SELECT id, username, first_name, last_name, role 
        FROM users 
        WHERE first_name LIKE ? OR last_name LIKE ? OR username LIKE ?
        ORDER BY id DESC`;

    db.query(sql, [searchQuery, searchQuery, searchQuery], (err, users) => {
        if (err) {
            console.error(err);
            req.flash('error', 'เกิดข้อผิดพลาดในการดึงข้อมูล');
            users = [];
        }
        
        res.render('manage_users', { 
            user: req.session.user, 
            users: users, 
            searchQuery: req.query.search || '',
            messages: { // ส่ง Flash message แบบที่ EJS คาดหวัง
                success: req.flash('success')[0],
                error: req.flash('error')[0]
            }
        });
    });
});

app.post('/admin/add-user', isAuthenticated, isAdmin, async (req, res) => {
    const { username, password, first_name, last_name, role } = req.body;
    
    if (!username || !password || !first_name || !last_name || !role) {
        req.flash('error', 'กรุณากรอกข้อมูลให้ครบถ้วน');
        return res.redirect('/admin/manage-users');
    }
    
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const sql = 'INSERT INTO users (username, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)';
        
        db.query(sql, [username, hashedPassword, first_name, last_name, role], (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    req.flash('error', `ไม่สามารถเพิ่มผู้ใช้ได้: Username '${username}' ถูกใช้แล้ว`);
                } else {
                    console.error(err);
                    req.flash('error', 'เกิดข้อผิดพลาดในการเพิ่มข้อมูล');
                }
            } else {
                req.flash('success', `เพิ่มผู้ใช้งาน **${username}** (Role: ${role.toUpperCase()}) สำเร็จแล้ว`);
            }
            res.redirect('/admin/manage-users');
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'เกิดข้อผิดพลาดในการเข้ารหัสรหัสผ่าน');
        res.redirect('/admin/manage-users');
    }
});

app.post('/admin/edit-user/:id', isAuthenticated, isAdmin, async (req, res) => {
    const userId = req.params.id;
    const { first_name, last_name, password, role } = req.body;

    let updateFields = ['first_name = ?', 'last_name = ?', 'role = ?'];
    let queryValues = [first_name, last_name, role];

    if (password) {
        try {
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            updateFields.push('password = ?');
            queryValues.push(hashedPassword);
        } catch (error) {
            console.error(error);
            req.flash('error', 'เกิดข้อผิดพลาดในการเข้ารหัสรหัสผ่าน');
            return res.redirect('/admin/manage-users');
        }
    }
    
    queryValues.push(userId); // เพิ่ม ID ไว้ท้ายสุดสำหรับเงื่อนไข WHERE

    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;

    db.query(sql, queryValues, (err, result) => {
        if (err) {
            console.error(err);
            req.flash('error', 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
        } else {
            req.flash('success', `แก้ไขข้อมูลผู้ใช้งาน ID: **${userId}** สำเร็จแล้ว`);
        }
        res.redirect('/admin/manage-users');
    });
});

app.post('/admin/delete-user/:id', isAuthenticated, isAdmin, (req, res) => {
    const userId = req.params.id;

    const sql = 'DELETE FROM users WHERE id = ?';
    db.query(sql, [userId], (err, result) => {
        if (err) {
            console.error(err);
            req.flash('error', 'เกิดข้อผิดพลาดในการลบข้อมูล');
        } else if (result.affectedRows === 0) {
            req.flash('error', 'ไม่พบผู้ใช้งานที่ต้องการลบ');
        } else {
            req.flash('success', `❌ ลบผู้ใช้งาน ID: **${userId}** สำเร็จแล้ว`);
        }
        res.redirect('/admin/manage-users');
    });
});


// 7.2 Admin Manage Permissions (หน้า Checkbox)
app.get('/admin/manage-permissions', isAuthenticated, isAdmin, (req, res) => {
    
    // 1. ดึงสิทธิ์ทั้งหมดที่มีในระบบ
    const sqlPerms = "SELECT * FROM permissions ORDER BY id";
    
    // 2. ดึงสิทธิ์ที่ตั้งค่าไว้
    const sqlRoles = "SELECT * FROM role_permissions";

    db.query(sqlPerms, (err, allPermissions) => {
        if (err) {
            console.error(err);
            req.flash('error', 'ไม่สามารถดึงข้อมูลสิทธิ์ได้');
            return res.redirect('/dashboard');
        }
        
        db.query(sqlRoles, (err, rolePerms) => {
            if (err) {
                console.error(err);
                req.flash('error', 'ไม่สามารถดึงข้อมูล Role ได้');
                return res.redirect('/dashboard');
            }

            // แปลงข้อมูล [ {role: 'staff', permission_id: 1}, ... ]
            // ให้เป็น { staff: [1, 4], member: [1] }
            const currentSettings = {};
            rolePerms.forEach(row => {
                if (!currentSettings[row.role]) {
                    currentSettings[row.role] = [];
                }
                currentSettings[row.role].push(row.permission_id);
            });

            res.render('manage_permissions', {
                user: req.session.user,
                allPermissions: allPermissions,
                currentSettings: currentSettings
                // messages ถูกส่งไปโดย isAuthenticated
            });
        });
    });
});

app.post('/admin/manage-permissions/update', isAuthenticated, isAdmin, (req, res) => {
    // req.body.permissions จะหน้าตาแบบนี้: { staff: ['1', '4'], member: ['1'] }
    const settings = req.body.permissions || {}; // ป้องกันกรณีส่งค่าว่าง
    const rolesToUpdate = ['staff', 'member']; // Role ที่เราอนุญาตให้อัปเดต

    // 1. ลบค่าเก่าของ Role ที่อัปเดต
    const sqlDelete = "DELETE FROM role_permissions WHERE role IN (?)";
    db.query(sqlDelete, [rolesToUpdate], (err, result) => {
        if (err) {
            console.error(err);
            req.flash('error', 'เกิดข้อผิดพลาดในการลบสิทธิ์เดิม');
            return res.redirect('/admin/manage-permissions');
        }

        // 2. สร้างข้อมูลใหม่
        const newValues = [];
        rolesToUpdate.forEach(role => {
            // ตรวจสอบว่ามี key นี้ใน settings หรือไม่
            if (settings[role] && Array.isArray(settings[role])) {
                settings[role].forEach(permId => {
                    newValues.push([role, parseInt(permId)]); // [ ['staff', 1], ['staff', 4], ['member', 1] ]
                });
            }
        });

        if (newValues.length === 0) {
            req.flash('success', 'ลบสิทธิ์ทั้งหมดของ Staff/Member สำเร็จ (ไม่มีสิทธิ์ใดถูกเลือก)');
            return res.redirect('/admin/manage-permissions');
        }

        // 3. บันทึกค่าใหม่
        const sqlInsert = "INSERT INTO role_permissions (role, permission_id) VALUES ?";
        db.query(sqlInsert, [newValues], (err, result) => {
            if (err) {
                console.error(err);
                req.flash('error', 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์ใหม่');
                return res.redirect('/admin/manage-permissions');
            }

            req.flash('success', 'อัปเดตสิทธิ์การเข้าถึงสำเร็จ');
            res.redirect('/admin/manage-permissions');
        });
    });
});


// --- 8. Server Start ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Login page: http://localhost:${port}/login`);
});