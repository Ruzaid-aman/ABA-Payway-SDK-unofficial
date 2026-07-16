const crypto = require('crypto');
const fs = require('fs');

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
    while (source.length > 0) {
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