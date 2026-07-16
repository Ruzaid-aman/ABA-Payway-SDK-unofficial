<?php
include 'helper.php';
$url = "https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/generate-qr";
$date = new DateTime("now", new DateTimeZone("UTC"));
$request_time = $date->format('YmdHis');
$tran_id = "bontoan".time();
$amount = 0.01;
$currency = "USD";
$payment_option = "abapay_khqr";
//$lifetime = 6;
$purchase_type = "purchase";
$qr_image_template = "template2";
$callback_url = "aHR0cHM6Ly82NmMyZjEyYWQwNTcwMDllZTliZTZjYTIubW9ja2FwaS5pby9BUEkvcHVzaGJhY2stbm90aWZpY2F0aW9uL3B1cmNoYXNl";
$hash = base64_encode(hash_hmac('sha512', $request_time. $merchant_id . $tran_id . $amount. $purchase_type. $payment_option.$callback_url . $currency.$qr_image_template, $api_key, true));
$request_params = array(
    "req_time"=> $request_time,
    "merchant_id" => $merchant_id,
    "tran_id" => $tran_id,
    "amount" => $amount,
    "payment_option"=> $payment_option,
    "currency" => $currency,
//    "lifetime" => $lifetime,
    "qr_image_template" => $qr_image_template,
    "purchase_type" => $purchase_type,
    "callback_url" => $callback_url,
    "hash" => $hash
);
$post_fields = json_encode($request_params);



$curl = curl_init();

curl_setopt_array($curl, array(
    CURLOPT_URL =>$url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_ENCODING => '',
    CURLOPT_MAXREDIRS => 10,
    CURLOPT_TIMEOUT => 0,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_SSL_VERIFYPEER => false,//since my PC have a problem with SSL, you can remove it as our docs https://developer.payway.com.kh/qr-api-14530840e0
    CURLOPT_SSL_VERIFYHOST => false,//same as the above.
    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
    CURLOPT_CUSTOMREQUEST => 'POST',
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json"
    ],
    CURLOPT_POSTFIELDS => $post_fields, // Use the JSON variable here
));
$result = curl_exec($curl);
curl_close($curl);

?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON Data Display</title>
</head>
<body>
    <h2>JSON Data</h2>
    <pre id="jsonDisplay"></pre>

    <script>
        // Parse the JSON data from PHP
        let jsonData = <?php echo $result; ?>;

        // Display JSON data in a formatted way
        document.getElementById("jsonDisplay").textContent = JSON.stringify(jsonData, null, 4);
    </script>
</body>
</html>

