// PayWay API Configuration
module.exports = {
    // ABA PayWay API URL
    // API URL that is provided by PayWay must be required in your post form
    ABA_PAYWAY_API_URL: 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase',
    
    // ABA PayWay API KEY
    // API KEY that is generated and provided by PayWay must be required in your post form
    // IMPORTANT: Keep this secret and never expose to the client side
    ABA_PAYWAY_API_KEY: '34f54473-7f44-4b3b-a23b-6e4cc5a862b4',
    
    // ABA PayWay Merchant ID
    // Merchant ID that is generated and provided by PayWay must be required in your post form
    ABA_PAYWAY_MERCHANT_ID: 'nie.cambodia',
    
    // Server Port (can be overridden by environment variable PORT)
    PORT: process.env.PORT ? Number(process.env.PORT) : 3000
};
