const express = require('express');
const path = require('path');
const createPaymentLink = require('./create-payment-link');
const getPaymentLinkDetail = require('./detail-payment-link');
const { merchant_id, api_key, encryption } = require('./helper');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/create-payment-link', async (req, res) => {
    try {
        const options = req.body;
        const result = await createPaymentLink(options);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/calculate-create-hash', async (req, res) => {
    try {
        const options = req.body;
        const request_time = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '').slice(0, 14);
        const merchant_auth = {
            'mc_id': merchant_id,
            'title': options.title || 'Test Link 001',
            'amount': options.amount || 0.02,
            'description': options.description || 'Payment link created from curl',
            'payment_limit': options.payment_limit || 0,
            'return_url': options.return_url ? Buffer.from(options.return_url).toString('base64') : Buffer.from('https://6291d7e1cd0c91932b68dab7.mockapi.io/pushback/api/v1/response/pushbacks').toString('base64'),
            'merchant_ref_no': options.merchant_ref_no || 'ref00001',
        };

        const merchant_auth_json = JSON.stringify(merchant_auth);
        const merchant_auth_encrypted = encryption(merchant_auth_json, "public_key", 'rsa.public');
        const hash = encryption(request_time + merchant_id + merchant_auth_encrypted, "sha512_true", api_key);

        res.json({
            request_time,
            merchant_auth_json,
            merchant_auth_encrypted,
            hash
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/calculate-detail-hash', async (req, res) => {
    try {
        const { id } = req.body;
        const request_time = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '').slice(0, 14);
        const merchant_auth = {
            'mc_id': merchant_id,
            'id': id || 'T+ErECeC9uCGj90ylqGUvw==',
        };

        const merchant_auth_json = JSON.stringify(merchant_auth);
        const merchant_auth_encrypted = encryption(merchant_auth_json, "public_key", 'rsa.public');
        const hash = encryption(request_time + merchant_id + merchant_auth_encrypted, "sha512_true", api_key);

        res.json({
            request_time,
            merchant_auth_json,
            merchant_auth_encrypted,
            hash
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`PayWay Payment Link API test app listening at http://localhost:${port}`);
});