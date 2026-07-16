<!DOCTYPE html>
<html lang="en">

<head>
    <title>PayWay Checkout Sample</title>

    <!— Make a copy of this code to paste into your site—>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">
    <meta name="author" content="PayWay">
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js"></script>
    <!— end —>
</head>

<body>
<!— Popup Checkout Form —>
<div id="aba_main_modal" class="aba-modal">
    <!— Modal content —>
    <div class="aba-modal-content">

        <!-- Include PHP class -->
        <?php
        require_once 'PayWayApiCheckout.php';

        $transactionId = time();
        $amount = '1000';
        $firstName = 'test';
        $lastName = 'test';
        $phone = '012345678';
        $email = '';
        $req_time = time();
        $merchant_id = 'nie.cambodia';
        $payment_option='abapay_khqr'; #abapay_khqr, abapay_khqr_deeplink (for mobile integration)
        $payment_gate=0;
        ?>

        <form method="POST" target="aba_webservice" action="<?php echo PayWayApiCheckout::getApiUrl(); ?>" id="aba_merchant_request">
            <input type="hidden" name="hash" value="<?php echo PayWayApiCheckout::getHash($req_time . $merchant_id . $transactionId . $amount.$firstName.$lastName.$email.$phone .$payment_option); ?>" id="hash"/>
            <input type="hidden" name="tran_id" value="<?php echo $transactionId; ?>" id="tran_id"/>
            <input type="hidden" name="amount" value="<?php echo $amount; ?>" id="amount"/>
            <input type="hidden" name="firstname" value="<?php echo $firstName; ?>"/>
            <input type="hidden" name="lastname" value="<?php echo $lastName; ?>"/>
            <input type="hidden" name="phone" value="<?php echo $phone; ?>"/>
            <input type="hidden" name="email" value="<?php echo $email; ?>"/>
            <input type="hidden" name="req_time" value="<?php echo $req_time; ?>"/>
            <input type="hidden" name="merchant_id" value="<?php echo $merchant_id; ?>"/>
            <input type="hidden" name="payment_gate" value="<?php echo $payment_gate; ?>"/>
        </form>
    </div>
    <!— end Modal content—>
</div>
<!— End Popup Checkout Form —>

<!— Page Content —>
<div class="container" style="margin-top: 75px;margin: 0 auto;">
    <div style="width: 200px;margin: 0 auto;">
        <div class="wpr_payment_option">

            <div style="margin-top: 10px">
                <input type="radio" name="payment_option" class="payment_option" style="margin: 34px 10px;float: left;" checked value="abapay_khqr">
                <label class="paymentOption" for="khqr">
                    <img class="cardType" src="logos/aba_khqr_logo.png">
                    <span class="detailCard002" style="margin: 22px 10px; float: right; position: absolute;">
                    <strong><span class="titleCard">ABA KHQR</span><br/></strong>
                    <span class="detailCard003" style="margin-top: 5px;">Scan to pay with any banking app</span>
                </span>
                </label>
            </div>
        </div>
        <h2>TOTAL: 1000</h2>
        <input type="button" id="checkout_button" value="Checkout Now">
    </div>
</div>
<!— End Page Content —>

<script src="https://checkout.payway.com.kh/plugins/checkout2-0.js"></script>

<script>
    $(document).ready(function(){
        $('#checkout_button').click(function(){
            $('#aba_merchant_request').append($(".payment_option:checked"));
            AbaPayway.checkout();
        });
    });
</script>
<!— End —>
</body>
</html>