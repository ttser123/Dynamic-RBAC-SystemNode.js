// routes/member.js
const express = require('express');
const router = express.Router();

module.exports = (db) => {

    // [แก้ไข] ลบ checkPermission(...) ออกจากตรงนี้
    router.get('/list', (req, res) => {
        // (isAuthenticated ถูกเรียกใช้ใน app.js แล้ว)
        
        const searchQuery = req.query.search || '';
        
        let sql = `
            SELECT 
                u.id, 
                u.username,
                m.first_name, 
                m.last_name
            FROM users u
            JOIN member_details m ON u.id = m.user_id
            WHERE u.role = 'member'
        `;
        const params = [];

        if (searchQuery) {
            sql += ` AND (u.username LIKE ? OR m.first_name LIKE ? OR m.last_name LIKE ?)`;
            const searchLike = `%${searchQuery}%`;
            params.push(searchLike, searchLike, searchLike);
        }
        sql += ` ORDER BY u.id DESC`;

        db.query(sql, params, (err, members) => {
            if (err) {
                console.error(err);
                members = [];
            }
            res.render('member_list', {
                members: members,
                searchQuery: searchQuery
            });
        });
    });

    return router;
};