module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs", () => require("fs"));

module.exports = mod;
}),
"[project]/helper.js [app-route] (ecmascript)", ((__turbopack_context__, module, exports) => {

const crypto = __turbopack_context__.r("[externals]/crypto [external] (crypto, cjs)");
const fs = __turbopack_context__.r("[externals]/fs [external] (fs, cjs)");
const merchant_id = 'nearyskin';
const api_key = '[REMOVED-HISTORICAL-7d7243aa2f22]';
function abaAesEncrypt(plainText, password = '3sc3RLrpd17', iv16char = 'av3DYGLkwBsErphc', method = 'aes-256-cbc') {
    // Must be exact 32 chars (256 bit)
    const md5 = crypto.createHash('md5').update(password).digest('hex');
    const sha1 = crypto.createHash('sha1').update(password).digest('hex');
    const key = md5.substr(3, 17) + sha1.substr(7, 15);
    const cipher = crypto.createCipheriv(method, key, iv16char);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}
function opensslEncryption(source, publicKeyPath) {
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    const key = crypto.createPublicKey(publicKey);
    let output = '';
    const maxlength = 117; // For 1024 bit key
    while(source.length > 0){
        const input = source.substr(0, maxlength);
        source = source.substr(maxlength);
        const encrypted = crypto.publicEncrypt({
            key: key,
            padding: crypto.constants.RSA_PKCS1_PADDING
        }, Buffer.from(input, 'utf8'));
        output += encrypted.toString('base64');
    }
    return output;
}
function encryption(value, encrypt_type, encrypt_key) {
    let encrypt = "";
    if (encrypt_type === 'aes') {
        encrypt = abaAesEncrypt(value, encrypt_type, encrypt_key);
    } else if (encrypt_type === 'sha512') {
        encrypt = crypto.createHmac('sha512', encrypt_key).update(value).digest('base64');
    } else if (encrypt_type === 'sha512_true') {
        encrypt = crypto.createHmac('sha512', encrypt_key).update(value).digest('base64');
    } else if (encrypt_type === 'public_key') {
        encrypt = opensslEncryption(value, encrypt_key);
    }
    return encrypt;
}
module.exports = {
    merchant_id,
    api_key,
    encryption
};
}),
"[project]/src/app/api/calculate-detail-hash/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$helper$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/helper.js [app-route] (ecmascript)");
;
;
async function POST(request) {
    try {
        const body = await request.json();
        const request_time = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '').slice(0, 14);
        const merchant_auth = {
            'mc_id': __TURBOPACK__imported__module__$5b$project$5d2f$helper$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["merchant_id"],
            'id': body.id || 'T+ErECeC9uCGj90ylqGUvw=='
        };
        const merchant_auth_json = JSON.stringify(merchant_auth);
        const merchant_auth_encrypted = (0, __TURBOPACK__imported__module__$5b$project$5d2f$helper$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["encryption"])(merchant_auth_json, "public_key", 'rsa.public');
        const hash = (0, __TURBOPACK__imported__module__$5b$project$5d2f$helper$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["encryption"])(request_time + __TURBOPACK__imported__module__$5b$project$5d2f$helper$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["merchant_id"] + merchant_auth_encrypted, "sha512_true", __TURBOPACK__imported__module__$5b$project$5d2f$helper$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["api_key"]);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            request_time,
            merchant_auth_json,
            merchant_auth_encrypted,
            hash
        });
    } catch (error) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__03c83b95._.js.map