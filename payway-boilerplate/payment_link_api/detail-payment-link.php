<?php
include 'helper.php';

$url = "https://checkout-sandbox.payway.com.kh/api/merchant-portal/merchant-access/payment-link/detail";

$request_time = date("YmdHis");
$merchant_auth = array(
	'mc_id' => $merchant_id,
	'id' => 'T+ErECeC9uCGj90ylqGUvw==',
);

$merchant_auth = json_encode($merchant_auth);
$merchant_auth = encryption($merchant_auth, "public_key", 'rsa.public');
$hash = encryption($request_time.$merchant_id.$merchant_auth, "sha512_true", $api_key);

$request_params = [
	"request_time" => $request_time,
	"merchant_id" => $merchant_id,
	"merchant_auth" => $merchant_auth,
	"hash" => $hash
];

$curl = curl_init();
curl_setopt($curl, CURLOPT_SSL_VERIFYHOST, 0);
curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, 0);
curl_setopt($curl, CURLOPT_POST, 1);
curl_setopt($curl, CURLOPT_URL, $url);
curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($curl, CURLOPT_POSTFIELDS, $request_params);
$result = curl_exec($curl);

curl_close($curl);
var_dump($result);
echo '<pre>'.json_encode(json_decode($result), JSON_PRETTY_PRINT).'</pre>';