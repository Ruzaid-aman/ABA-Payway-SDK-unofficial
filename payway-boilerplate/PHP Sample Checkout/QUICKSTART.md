# Quick Start Guide - PayWay Checkout

## Getting Started in 3 Steps

### Step 1: Install Dependencies

Open PowerShell in this directory and run:

```powershell
npm install
```

This will install:
- Express (web server)
- Body-parser (request parsing)
- CORS (cross-origin support)

### Step 2: Start the Server

```powershell
npm start
```

You should see:
```
PayWay Checkout Server running on http://localhost:3000
```

### Step 3: Open the Checkout Page

Open your browser and navigate to:

**Recommended (Improved Version):**
```
http://localhost:3000/checkout.html
```

**Basic Version:**
```
http://localhost:3000/index.html
```

## Testing the Checkout Flow

1. **Fill in the form** with test data (pre-filled values are provided)
2. **Review the amount** in the preview panel on the left
3. **Click "Proceed to Payment"** button
4. The system will:
   - Validate your form inputs
   - Generate a secure hash via the backend API
   - Submit to PayWay sandbox environment
   - Open PayWay checkout modal

## Demo Credentials (Pre-configured)

```javascript
Merchant ID: nie.cambodia
API Key: 34f54473-7f44-4b3b-a23b-6e4cc5a862b4
Environment: Sandbox
```

⚠️ **Note**: These are sandbox credentials. Replace with your production credentials before going live.

## Test Data

The form comes pre-filled with test data:

- **Amount**: $10.00
- **First Name**: John
- **Last Name**: Doe
- **Phone**: 012345678
- **Email**: (optional)

Feel free to modify these values!

## Features to Try

### 🌓 Dark Mode
Click the moon/sun icon in the header to toggle between light and dark themes.

### 📱 Responsive Design
Resize your browser or open on mobile to see the responsive layout.

### ✅ Form Validation
Try leaving required fields empty or entering invalid data to see validation in action.

### 🔄 Loading States
Watch the button change to a loading state while processing.

### ⚙️ Advanced Settings
Expand the "Advanced Settings" section to see merchant configuration.

## API Endpoint

The checkout page communicates with this backend endpoint:

```
POST http://localhost:3000/api/generate-hash
```

**Request:**
```json
{
  "req_time": 1702742400,
  "merchant_id": "nie.cambodia",
  "tran_id": "1702742400000",
  "amount": "10.00",
  "firstname": "John",
  "lastname": "Doe",
  "email": "",
  "phone": "012345678",
  "payment_option": "abapay_khqr"
}
```

**Response:**
```json
{
  "success": true,
  "hash": "base64_encoded_hmac_sha512_hash",
  "api_url": "https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase"
}
```

## Troubleshooting

### Server won't start
```powershell
# Make sure Node.js is installed
node --version

# If not installed, download from https://nodejs.org
```

### Can't connect to localhost
```powershell
# Check if server is running
# Look for "PayWay Checkout Server running" message

# Check if port 3000 is available
netstat -ano | findstr :3000
```

### Payment not working
1. Check browser console for errors (F12)
2. Verify server is running and accessible
3. Ensure you're using the correct URL
4. Check network tab for API call status

### Dark mode not saving
- Make sure localStorage is enabled in your browser
- Check browser privacy settings

## Development Mode

For development with auto-reload on file changes:

```powershell
npm run dev
```

This uses `nodemon` to automatically restart the server when files change.

## Next Steps

### Customize the Design
Edit `checkout.html` to modify:
- Colors (CSS variables in `:root`)
- Layout (grid settings)
- Typography (font sizes, weights)
- Spacing (padding, margins)

### Add Your Branding
1. Replace logo images in `/logos` folder
2. Update colors in CSS variables
3. Change page title and descriptions
4. Add your company information

### Configure for Production
1. Update `config.js` with production credentials
2. Change API URL to production endpoint
3. Set up HTTPS/SSL
4. Enable security headers
5. Add error logging

### Integrate with Your System
- Modify form fields to match your requirements
- Add custom validation rules
- Integrate with your database
- Add webhooks for payment notifications
- Implement receipt generation

## File Structure

```
checkout.html          ← Main improved checkout page
├─ HTML structure      (semantic, accessible)
├─ CSS (embedded)      (modern, responsive)
└─ JavaScript          (form handling, API calls)

server.js              ← Backend API server
├─ /api/generate-hash  (hash generation endpoint)
└─ Static file serving (HTML, images)

config.js              ← Configuration
├─ API credentials
├─ Merchant settings
└─ Server port
```

## Support

For PayWay API documentation and support:
- Website: https://www.payway.com.kh
- Documentation: https://payway-api-docs.payway.com.kh

For this implementation:
- Check README.md for detailed information
- Review IMPROVEMENTS.md for UI/UX details
- Examine code comments for implementation details

---

**Happy coding! 🚀**
