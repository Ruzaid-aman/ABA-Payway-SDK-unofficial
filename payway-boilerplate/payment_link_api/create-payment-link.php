<?php
include 'helper.php';

$url = "https://checkout-sandbox.payway.com.kh/api/merchant-portal/merchant-access/payment-link/create";

$request_time = date("YmdHis");
$merchant_auth = array(
	'mc_id' => $merchant_id,
	'title' => 'Test Link 001',
	'amount' => 0.02,
	'description' => 'Payment link created from curl',
	'payment_limit' => 0,
/*	'expired_date' => time(),*/
	'return_url' => base64_encode('https://6291d7e1cd0c91932b68dab7.mockapi.io/pushback/api/v1/response/pushbacks'),
	'merchant_ref_no' => 'ref00001',
);
//var_dump($request_time);
$merchant_auth = json_encode($merchant_auth);
$merchant_auth = encryption($merchant_auth, "public_key", 'rsa.public');
$hash = encryption($request_time.$merchant_id.$merchant_auth, "sha512_true", $api_key);

//$file = 'C:/Users/keng.dara/Downloads/a.jpg';

$request_params = [
	"request_time" => $request_time,
	"merchant_id" => $merchant_id,
	"merchant_auth" => $merchant_auth,
//	'image' => new CURLFile($file, 'iamge/jpeg', 'rrrrr-name.jpg'),
	"hash" => $hash
];

$curl = curl_init();
curl_setopt($curl, CURLOPT_SSL_VERIFYHOST, 0);
curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, 0);
curl_setopt($curl, CURLOPT_POST, 1);
curl_setopt($curl, CURLOPT_URL, $url);
$header = ["Content-Type:multipart/form-data"];
curl_setopt($curl, CURLOPT_HTTPHEADER, $header);
curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($curl, CURLOPT_POSTFIELDS, $request_params);
$result = curl_exec($curl);
//$info = curl_getinfo($curl);
//var_dump($info);

curl_close($curl);
var_dump(json_decode($result, true));
echo '<pre>'.json_encode(json_decode($result), JSON_PRETTY_PRINT).'</pre>';