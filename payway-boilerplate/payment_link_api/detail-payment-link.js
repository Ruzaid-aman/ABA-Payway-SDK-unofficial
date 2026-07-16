const axios = require('axios');
const { merchant_id, api_key, encryption } = require('./helper');

async function getPaymentLinkDetail(paymentLinkId = 'T+ErECeC9uCGj90ylqGUvw==') {
    const url = "https://checkout-sandbox.payway.com.kh/api/merchant-portal/merchant-access/payment-link/detail";

    const request_time = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '').slice(0, 14);
    const merchant_auth = {
        'mc_id': merchant_id,
        'id': paymentLinkId,
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
                'Content-Type': 'application/x-www-form-urlencoded'
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
        console.error('Error getting payment link detail:', error.response ? error.response.data : error.message);
        throw error;
    }
}

module.exports = getPaymentLinkDetail;