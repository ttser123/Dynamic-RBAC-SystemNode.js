// db.js
const mysql = require('mysql');
const dotenv = require('dotenv');

dotenv.config();

// สร้าง Connection Pool (ดีกว่า createConnection สำหรับ production)
const pool = mysql.createPool({
    connectionLimit: 10, // ปรับตามความเหมาะสม
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// ตรวจสอบการเชื่อมต่อครั้งแรก
pool.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('Database connection was closed.');
        }
        if (err.code === 'ER_CON_COUNT_ERROR') {
            console.error('Database has too many connections.');
        }
        if (err.code === 'ECONNREFUSED') {
            console.error('Database connection was refused.');
        }
        console.error('Error connecting to MySQL:', err.stack);
        return;
    }
    if (connection) connection.release();
    console.log('Connected to MySQL Pool.');
});

// ส่งออก "pool" เพื่อให้ routes สามารถ query ได้
module.exports = pool;