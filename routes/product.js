// routes/product.js
const express = require('express');
const router = express.Router();
const axios = require('axios'); 

module.exports = () => {

    router.get('/', (req, res) => {
        res.render('products/products_list');
    });

    // [อัปเดต!] (POST /add) - ตอบ JSON
    router.post('/add', async (req, res) => {
        const { productName, price } = req.body;
        const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/d5fa26ee-9be9-48c9-bf91-03b0cf8fcb94'; 
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