<?php

$merchant_id = 'bontoan';
$api_key = '[REMOVED-HISTORICAL-6e4b8b3d6e71]';


function abaAesEncrypt(
    $plainText,
    $password = '3sc3RLrpd17',
    $iv16char = 'av3DYGLkwBsErphc',
    $method = 'aes-256-cbc'
) {
    // Must be exact 32 chars (256 bit)
    $key = substr(md5($password),3, 17) . substr(sha1($password), 7, 15);
    return $encrypted = base64_encode(openssl_encrypt($plainText, $method, $key, OPENSSL_RAW_DATA, $iv16char));

    // My secret message 1234
    $decrypted = openssl_decrypt(base64_decode($encrypted), $method, $password, OPENSSL_RAW_DATA, $iv16char);
}

function opensslEncryption($source, $publicKey)
{
    //Assumes 1024 bit key and encrypts in chunks.
    $maxlength = 117;
    $output = '';
    while ($source) {
        $input = substr($source, 0, $maxlength);
        $source = substr($source, $maxlength);
        $ok = openssl_public_encrypt($input, $encrypted, $publicKey);
        $output .= $encrypted;
    }
    return base64_encode($output);
}

function encryption( $value, $encypt_type, $encrypt_key){
    $encrypt = "";
    if($encypt_type == 'aes'){
        $encrypt = abaAesEncrypt($value, $encypt_type, $encrypt_key);
    }
    elseif($encypt_type == 'sha512'){
        $encrypt = base64_encode(hash_hmac('sha512', $value, $encrypt_key));}
    elseif($encypt_type == 'sha512_true'){
        $encrypt = base64_encode(hash_hmac('sha512', $value, $encrypt_key, true));
    }
    elseif($encypt_type == 'public_key'){
        $public_key = file_get_contents($encrypt_key);
        $encrypt = opensslEncryption($value, $public_key);
    }
    return $encrypt;
}