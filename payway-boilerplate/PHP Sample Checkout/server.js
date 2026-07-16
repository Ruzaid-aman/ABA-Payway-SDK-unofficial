const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const config = require('./config');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

/**
 * Generate HMAC SHA512 hash for PayWay
 * For PayWay security, you must follow the way of encryption for hash.
 * 
 * @param {string} hashStr - String to hash
 * @returns {string} Base64 encoded hash
 */
function getHash(hashStr) {
    const hash = crypto
        .createHmac('sha512', config.ABA_PAYWAY_API_KEY)
        .update(hashStr)
        .digest('base64');
    return hash;
}

/**
 * API endpoint to generate payment hash
 * This endpoint receives payment data and returns the hash
 */
app.post('/api/generate-hash', (req, res) => {
    try {
        const {
            req_time,
            merchant_id,
            tran_id,
            amount,
            firstname,
            lastname,
            email,
            phone,
            payment_option
        } = req.body;

        // Validate required fields
        if (!req_time || !merchant_id || !tran_id || !amount || !firstname || !lastname || !phone || !payment_option) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }

        // Construct hash string in the same order as PHP
        const hashStr = `${req_time}${merchant_id}${tran_id}${amount}${firstname}${lastname}${email}${phone}${payment_option}`;
        
        // Generate hash
        const hash = getHash(hashStr);

        // Return payment data with hash
        res.json({
            success: true,
            hash: hash,
            api_url: config.ABA_PAYWAY_API_URL
        });
    } catch (error) {
        console.error('Error generating hash:', error);
        res.status(500).json({ 
            error: 'Internal server error' 
        });
    }
});

// Serve the improved checkout page as default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'checkout.html'));
});

// Start server
const PORT = config.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`PayWay Checkout Server running on http://127.0.0.1:${PORT}`);
});
