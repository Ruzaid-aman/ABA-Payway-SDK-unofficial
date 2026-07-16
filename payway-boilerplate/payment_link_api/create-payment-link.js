const axios = require('axios');
const { merchant_id, api_key, encryption } = require('./helper');

async function createPaymentLink(options = {}) {
    const url = "https://checkout-sandbox.payway.com.kh/api/merchant-portal/merchant-access/payment-link/create";

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

    const request_params = {
        "request_time": request_time,
        "merchant_id": merchant_id,
        "merchant_auth": merchant_auth_encrypted,
        "hash": hash
    };

    try {
        const response = await axios.post(url, request_params, {
            headers: {
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: new (require('https').Agent)({
                rejectUnauthorized: false
            })
        });
        return {
            request_time,
            merchant_auth_json,
            merchant_auth_encrypted,
            hash,
            response: response.data
        };
    } catch (error) {
        console.error('Error creating payment link:', error.response ? error.response.data : error.message);
        throw error;
    }
}

module.exports = createPaymentLink;