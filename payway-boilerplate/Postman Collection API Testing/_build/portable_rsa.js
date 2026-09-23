// Source of the dependency-free RSA helper embedded in the shared Postman collection.
// PayWay's portal endpoints use RSAES-PKCS1-v1_5 and may exceed one RSA block.
function openSslEncrypt(jsonStr, pem) {
  if (typeof BigInt !== 'function' || typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') return null;
  var CryptoJS = require('crypto-js');
  function bytes(wordArray) {
    var result = [];
    for (var i = 0; i < wordArray.sigBytes; i++) result.push((wordArray.words[i >>> 2] >>> (24 - 8 * (i % 4))) & 255);
    return result;
  }
  function wordArray(values) {
    var words = [];
    for (var i = 0; i < values.length; i++) words[i >>> 2] = (words[i >>> 2] || 0) | (values[i] << (24 - 8 * (i % 4)));
    return CryptoJS.lib.WordArray.create(words, values.length);
  }
  function readTlv(data, position) {
    var tag = data[position++];
    var length = data[position++];
    if (length & 128) {
      var count = length & 127;
      if (!count || count > 4) throw new Error('Invalid RSA public key DER length');
      length = 0;
      while (count--) length = length * 256 + data[position++];
    }
    var end = position + length;
    if (end > data.length) throw new Error('Truncated RSA public key DER');
    return { tag: tag, start: position, end: end };
  }
  function integer(data, part) {
    if (part.tag !== 2) throw new Error('Invalid RSA public key integer');
    var value = BigInt(0);
    for (var i = part.start; i < part.end; i++) value = value * BigInt(256) + BigInt(data[i]);
    return value;
  }
  function modPow(base, exponent, modulus) {
    var result = BigInt(1);
    while (exponent > 0) {
      if (exponent & BigInt(1)) result = result * base % modulus;
      base = base * base % modulus;
      exponent >>= BigInt(1);
    }
    return result;
  }
  var encoded = String(pem || '').replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  var der = bytes(CryptoJS.enc.Base64.parse(encoded));
  var outer = readTlv(der, 0);
  if (outer.tag !== 48 || outer.end !== der.length) throw new Error('Expected SPKI RSA public key');
  var algorithm = readTlv(der, outer.start);
  var bitString = readTlv(der, algorithm.end);
  if (algorithm.tag !== 48 || bitString.tag !== 3 || der[bitString.start] !== 0) throw new Error('Expected SPKI RSA public key');
  var key = readTlv(der, bitString.start + 1);
  var modulusPart = readTlv(der, key.start);
  var exponentPart = readTlv(der, modulusPart.end);
  if (key.tag !== 48 || exponentPart.end !== key.end) throw new Error('Invalid RSA public key');
  var modulus = integer(der, modulusPart);
  var exponent = integer(der, exponentPart);
  var keyBytes = Math.ceil((modulus.toString(2).length) / 8);
  var chunkSize = keyBytes - 11;
  if (chunkSize < 1 || exponent < 3) throw new Error('Invalid RSA public key size or exponent');
  var input = bytes(CryptoJS.enc.Utf8.parse(jsonStr));
  var output = [];
  for (var offset = 0; offset < input.length; offset += chunkSize) {
    var chunk = input.slice(offset, offset + chunkSize);
    var padLength = keyBytes - chunk.length - 3;
    var block = [0, 2];
    var random = new Uint8Array(padLength);
    crypto.getRandomValues(random);
    for (var j = 0; j < padLength; j++) {
      while (random[j] === 0) crypto.getRandomValues(random.subarray(j, j + 1));
      block.push(random[j]);
    }
    block.push(0);
    block.push.apply(block, chunk);
    var number = BigInt(0);
    for (var k = 0; k < block.length; k++) number = number * BigInt(256) + BigInt(block[k]);
    var encrypted = modPow(number, exponent, modulus);
    var result = new Array(keyBytes);
    for (var p = keyBytes - 1; p >= 0; p--) {
      result[p] = Number(encrypted % BigInt(256));
      encrypted /= BigInt(256);
    }
    output.push.apply(output, result);
  }
  return CryptoJS.enc.Base64.stringify(wordArray(output));
}

module.exports = { openSslEncrypt };
