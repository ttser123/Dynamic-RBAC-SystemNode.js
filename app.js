// app.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const dotenv = require('dotenv');

// [แก้ไข] Import pool จาก db.js
const db = require('./db'); 

dotenv.config();

const app = express();
const port = 3000;

// --- 2. Middleware Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true })); // สำหรับ Form (แบบเก่า)
app.use(express.json()); // [สำคัญ!] สำหรับ API (AJAX/Fetch)
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'YOUR_VERY_SECURE_SECRET_KEY_DEFAULT',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 ชั่วโมง
}));

// [ลบ] connect-flash และ app.use(flash()) ทิ้งไป
// [ลบ] app.get('/favicon.ico', ...) ทิ้งไป

// --- 3. Authorization Middleware ---

const isAuthenticated = (req, res, next) => {
    if (req.session.loggedin) {
        // [คลีน] ส่งแค่ user
        res.locals.user = req.session.user;
        next();
    } else {
        // ถ้าเป็น AJAX request ที่ยังไม่ login, ให้ตอบ JSON Error
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(401).json({ success: false, message: 'Session หมดอายุ, กรุณาเข้าสู่ระบบใหม่' });
        }
        // ถ้าเป็นการเข้าหน้าปกติ, redirect
        res.redirect('/login');
    }
};

const isAdmin = (req, res, next) => {
    if (req.session.loggedin && req.session.user.role === 'admin') {
        next();
    } else {
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์ (Admin) ในการดำเนินการนี้' });
        }
        res.redirect('/dashboard'); 
    }
};

const checkPermission = (requiredPermissionKey) => {
    return (req, res, next) => {
        if (req.session.user.role === 'admin') {
            return next();
        }
        const userPermissions = req.session.user.permissions || [];
        if (userPermissions.includes(requiredPermissionKey)) {
            next();
        } else {
            if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
                return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์ในการดำเนินการนี้' });
            }
            res.redirect('/dashboard');
        }
    };
};

// --- 4. Import & Use Routes ---
const authRoutes = require('./routes/auth')(db, bcrypt);
const lineAuthRoutes = require('./routes/line_auth')(db);
const mainRoutes = require('./routes/main')(db, bcrypt);
const memberRoutes = require('./routes/member')(db);
const adminRoutes = require('./routes/admin')(db, bcrypt);
const productRoutes = require('./routes/product')(); // (ไฟล์นี้ไม่ใช้ db)

// 4.1 Routes ที่ไม่ต้อง Login
app.use('/', authRoutes); // ( /login, /logout, /auth )
app.use('/auth', lineAuthRoutes); // ( /auth/line/login, /auth/line/callback, /auth/line/register )

// 4.2 Routes ที่ต้อง Login (ใช้ isAuthenticated)
app.use('/', isAuthenticated, mainRoutes); // ( /dashboard, /profile )
app.use('/products', isAuthenticated, checkPermission('add_products'), productRoutes); // ( /products, /products/add )
app.use('/admin', isAuthenticated, isAdmin, adminRoutes); // ( /admin/manage-users, ... )
app.use('/member', isAuthenticated, checkPermission('view_member_list'), memberRoutes);

// --- 9. Server Start ---
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Login page: http://localhost:${port}/login`);
});