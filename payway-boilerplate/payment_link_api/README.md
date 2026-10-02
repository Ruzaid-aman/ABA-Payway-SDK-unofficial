# PayWay Payment Link API Tester

A modern, stylish web application for testing PayWay payment link creation and management APIs, built with Next.js and Shadcn UI.

## Features

- **Modern UI**: Clean, responsive interface using Shadcn UI components
- **Interactive Forms**: Modify all payment link parameters with real-time validation
- **Hash Calculation Display**: See exactly how hashes are calculated before API calls
- **Real-time Testing**: Test both payment link creation and detail retrieval
- **KHQR Generator**: Server-side JavaScript QR generation with live QR preview at `/qr`
- **TypeScript Support**: Full type safety with TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone or download the project
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

### Creating Payment Links

1. Fill in the form values (title, amount, description, payment limit, return URL, merchant ref no)
2. Click **"Calculate Hash"** to see the hash calculation process
3. Click **"Create Payment Link"** to submit to the PayWay API

### Getting Payment Link Details

1. Enter the Payment Link ID
2. Click **"Calculate Hash"** to preview the hash
3. Click **"Get Details"** to retrieve payment link information

### Generating KHQR

1. Open `/qr` in the app
2. Fill in amount, currency, payment option, purchase type, QR template, and callback URL (we base64-encode this for you)
3. Click **"Generate QR"** to build the hash server-side and call the PayWay sandbox
4. Inspect the hash input, request payload, API response, and a live QR preview (if returned)

## API Endpoints

- `POST /api/calculate-create-hash` - Calculate hash for payment link creation
- `POST /api/create-payment-link` - Create a new payment link
- `POST /api/calculate-detail-hash` - Calculate hash for detail retrieval
- `POST /api/detail-payment-link` - Get payment link details
- `POST /api/generate-qr` - Generate KHQR using server-side JavaScript

## Configuration

The application uses the following configuration from `helper.js`:

- **Merchant ID**: `nearyskin`
- **API Key**: Configured in helper.js
- **RSA Public Key**: `rsa.public` file

## Technology Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn UI
- **HTTP Client**: Axios
- **Encryption**: Node.js crypto module

## Security Notes

- API keys and sensitive data are stored server-side
- Hash calculations are performed securely on the server
- RSA encryption uses the provided public key

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Project Structure

```text
src/
├── app/
│   ├── api/                 # API routes
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Main page
├── components/
│   └── ui/                 # Shadcn UI components
└── lib/
   └── utils.ts            # Utility functions
```

## Example scope

This application contains JavaScript/TypeScript payment-link and QR examples. The legacy PHP copies were removed by owner decision on 2026-10-03. Features include:

- ✅ Same encryption logic and API calls
- ✅ Interactive form-based testing
- ✅ Real-time hash calculation display
- ✅ Modern, responsive UI
- ✅ Type-safe development with TypeScript
