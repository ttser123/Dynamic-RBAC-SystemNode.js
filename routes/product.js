// routes/product.js
const express = require('express');
const router = express.Router();
const axios = require('axios'); 
const N8N_GET_PRODUCTS_URL = process.env.N8N_GET_PRODUCTS_URL || 'http://localhost:5678/webhook/c2258094-6d79-488f-b4ab-fbceaa77053b';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL; 

module.exports = () => {

 router.get('/', (req, res) => {
        res.render('products/products_list');
    });

    // --- (เพิ่ม Route ใหม่สำหรับ /products/all) ---
    router.get('/all', async (req, res) => {
        if (!req.session.loggedin) {
            return res.redirect('/login');
        }

        let products = [];
        let errorMessage = null;

        // 1. ตรวจสอบว่ามีสิทธิ์หรือไม่ (ตามเมนูใน header.ejs)
        if (req.session.user.role !== 'admin' && !req.session.user.permissions.includes('add_products')) {
            return res.status(403).send('Forbidden');
        }

        // 2. ตรวจสอบว่าตั้งค่า URL n8n หรือยัง
        if (!N8N_GET_PRODUCTS_URL) {
            errorMessage = "ยังไม่ได้ตั้งค่า N8N_GET_PRODUCTS_URL ในไฟล์ .env";
        } else {
            try {
                // 3. เรียก Webhook ของ n8n เพื่อดึงข้อมูลสินค้า
                console.log(`[Products] Fetching data from n8n: ${N8N_GET_PRODUCTS_URL}`);
                const response = await axios.get(N8N_GET_PRODUCTS_URL);
                
                // 4. n8n จะคืนค่าข้อมูลมา (อาจจะเป็น Array หรือ Object ที่มี key 'data')
                if (Array.isArray(response.data)) {
                    products = response.data;
                } else if (response.data && Array.isArray(response.data.data)) {
                    products = response.data.data;
                }

                console.log(`[Products] Fetched ${products.length} items from n8n.`);

            } catch (error) {
                console.error("[Products] Failed to fetch data from n8n:", error.message);
                if (error.response) {
                    console.error("[Products] n8n Response Status:", error.response.status);
                }
                errorMessage = `ไม่สามารถดึงข้อมูลสินค้าจาก n8n ได้: ${error.message}`;
            }
        }

        // 5. Render หน้า EJS ใหม่ที่เราสร้าง
        res.render('products/products_all', {
            products: products, // Array ของสินค้า
            error: errorMessage // ข้อความ Error (ถ้ามี)
        });
    });
    // --- (สิ้นสุด Route ใหม่) ---

    // [อัปเดต!] (POST /add) - ตอบ JSON
    router.post('/add', async (req, res) => {
        const { productName, price } = req.body;
        const products = [];

        if (productName && Array.isArray(productName)) {
            for (let i = 0; i < productName.length; i++) {
                if (productName[i] && price[i]) {
                    products.push({
                        productName: productName[i],
                        price: price[i]
                    });
                }
            }
        } else if (productName && price) { // รองรับแถวเดียว
             products.push({
                productName: productName,
                price: price
            });
        }

        if (products.length === 0) {
            return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลสินค้าที่จะส่ง' });
        }

        try {
            await axios.post(N8N_WEBHOOK_URL, {
                products: products 
            });
            // [อัปเดต] ตอบ JSON
            res.json({ success: true, message: `เพิ่มสินค้า ${products.length} รายการ สำเร็จ!` });
        } catch (error) {
            console.error('Error sending to n8n:', error.message);
            // [อัปเดต] ตอบ JSON
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการส่งข้อมูลไป n8n' });
        }
    });

    return router;
};