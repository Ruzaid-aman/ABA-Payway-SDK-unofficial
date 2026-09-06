# Create payment link

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/merchant-portal/merchant-access/payment-link/create:
    post:
      summary: Create payment link
      deprecated: false
      description: This API allows you to create a payment link from your application.
      tags:
        - Payment Link
      parameters:
        - name: Content-Type
          in: header
          description: ''
          required: true
          example: multipart/form-data
          schema:
            type: string
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                request_time:
                  description: Request date and time in UTC format as YYYYMMDDHHmmss.
                  example: ''
                  type: string
                merchant_id:
                  description: A unique merchant key provided by ABA Bank.
                  example: ''
                  type: string
                merchant_auth:
                  description: >-
                    A JSON string representing a JSON object, encrypted using
                    OpenSSL with an RSA public key.


                    ---

                    **mc_id** `string` `mandatory`

                    The same value as merchant_id 


                    ---

                    **title** `string` `mandatory`

                    Title of the payment link. Max. Lenght 250. 


                    ---

                    **amount** `string` `mandatory`
                     Payment link amount. Must be at least 100 KHR or 0.01 USD. Cannot be null or zero.

                    ---

                    **currency** `string` `mandatory`

                    Transaction currency code (Mandatory). Supported values:
                    `KHR` or `USD`.


                    ---

                    **description** `string` 

                    Description of the payment link. Optional. Max. Lenght 250


                    ---

                    **payment_limit** `string` 

                    Maximum number of transactions allowed for this payment link
                    (Optional). If left blank, there is no limit..


                    ---

                    **expired_date** `string` `mandatory`

                    Expiration date of the payment link. A null value means no
                    expiry date.


                    ---

                    **return_url** `string` `mandatory`

                    Once a payment is made on the payment link, the payment
                    gateway will call this URL to send the payment details. This
                    URL must be encrypted in Base64.


                    ---

                    **merchant_ref_no** `string ` `optional`

                    Your payment link ID. We suggest using a unique ID. PayWay
                    does not validate duplicates. This ID will be included in
                    the callback when the payment is completed. Max length: 50.


                    ---

                    **payout** `string`  `optional`

                    Payout instruction of the payment link.  Total payout amount
                    must equal to payment link amount.


                    ---


                    **PHP Sample Code**

                    ```php

                    function opensslEncryption($source, $publicKey)

                    {
                        $maxlength = 117;
                        $output = '';
                        while (!empty($source)) {
                            $input = substr($source, 0, $maxlength);
                            openssl_public_encrypt($input, $encrypted, $publicKey);
                            $output .= $encrypted;
                            $source = substr($source, $maxlength);
                        }
                        return base64_encode($output);
                    }


                    $rsa_public_key = "RSA PUBLIC KEY PROVIDED BY ABA BANK";


                    $data = json_encode([
                        'mc_id' => $merchant_id, 
                        'title' => 'Test curl 001', 
                        'amount' => 0.03,
                        'currency' => 'USD',
                        'description' => 'Payment link created from curl',
                        'payment_limit' => 5, 
                        'expired_date' => time(), 
                        'return_url' => base64_encode('https://domain.com'), 
                        'merchant_ref_no' => 'ref00001',
                        'payout' => '[
                            {"acc":"122092016015926","amt":0.01},
                            {"acc":"122091511120425","amt":0.02}
                        ]',
                    ]);

                    $merchant_auth = opensslEncryption($data, $rsa_public_key);

                    ```
                  example: ''
                  type: string
                image:
                  format: binary
                  type: string
                  description: |-
                    An image associated with the payment link
                    - Maximum file size: 3MB
                    - Supported file formats: JPG, JPEG, PNG
                  example: ''
                hash:
                  description: >-
                    Base64-encoded HMAC SHA-512 hash of the concatenated values:
                    `request_time`,  `merchant_id`, and  `merchant_auth` with
                    `public_key`.


                    **PHP Sample Code**


                    ```php

                    // public key provided by ABA Bank

                    $api_key = "API KEY PROVIDED BY ABA BANK";

                    // Prepare the data to be hashed

                    $b4hash = $request_time . $merchant_id . $merchant_auth;

                    // Generate the HMAC hash using SHA-512 and encode it in
                    Base64

                    $hash = base64_encode(hash_hmac('sha512', $b4hash, $api_key,
                    true));

                    ```
                  example: ''
                  type: string
              required:
                - request_time
                - merchant_id
                - merchant_auth
                - hash
            example: ''
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: object
                    properties:
                      id:
                        type: string
                        description: >-
                          A unique payment link ID generated by the payment
                          gateway.
                      title:
                        type: string
                        description: The title of your payment link.
                      image:
                        type: object
                        properties:
                          image:
                            type: string
                            description: Full URL of the image
                          filename:
                            type: string
                            description: >-
                              The filename of the image, including its
                              extension.
                          size:
                            type: number
                            description: Image size in KB
                        x-apidog-orders:
                          - image
                          - filename
                          - size
                        description: Image associated with the payment link
                      amount:
                        type: number
                        format: double
                        description: Payment link amount.
                      currency:
                        type: string
                        description: 'Payment link currency. Supported values: `KHR`, `USD`.'
                        minLength: 3
                        maxLength: 3
                      status:
                        type: string
                        description: Once the payment link is created, its status is "OPEN"
                      description:
                        type: string
                        description: A description of your payment link.
                      payment_limit:
                        type: number
                        description: >-
                          The maximum number of transactions allowed for this
                          payment link.
                      total_amount:
                        type: number
                        description: ' Total amount after refund.'
                      total_trxn:
                        type: number
                        description: >-
                          The total number of completed payment transactions. A
                          newly created payment link will have a value of 0
                      created_at:
                        type: string
                        description: >-
                          Date and time when the payment link was created in the
                          payment gateway.
                      updated_at:
                        type: string
                        description: The last updated date and time of the payment link.
                      expired_date:
                        type: number
                        description: The expiration timestamp for this payment link.
                      payment_link:
                        type: string
                        description: Full URL of the payment link
                      return_url:
                        type: string
                        description: >-
                          The URL that the payment gateway will call to send
                          payment status updates.
                      total_amount_org:
                        type: string
                        description: Total payment amount before refund.
                      total_refund:
                        type: number
                        description: Total refunded amount.
                      merchant_ref_no:
                        type: string
                        description: The payment link reference number.
                      outlet_id:
                        type: string
                        description: A unique outlet identifier
                      outlet_name:
                        type: string
                        description: The outlet name.
                    x-apidog-orders:
                      - id
                      - title
                      - image
                      - amount
                      - currency
                      - status
                      - description
                      - payment_limit
                      - total_amount_org
                      - total_amount
                      - total_refund
                      - total_trxn
                      - created_at
                      - updated_at
                      - expired_date
                      - return_url
                      - merchant_ref_no
                      - outlet_id
                      - outlet_name
                      - payment_link
                  status:
                    type: object
                    properties:
                      code:
                        type: string
                        description: |-
                          - `PTL02` : Wrong Hash 
                          - `PTL05` : Parameter Invalid Format
                          - `PTL99` : Merchant invalid currency.
                          - `PTL132` : Invalid payment link.
                      message:
                        type: string
                        description: Please see the property response `code` for details.
                    x-apidog-orders:
                      - code
                      - message
                  tran_id:
                    type: string
                    description: A unique log ID generated by the payment gateway.
                  payout:
                    type: array
                    items:
                      type: object
                      properties:
                        acc:
                          type: string
                          description: The ABA account number or MID of the beneficiary
                        amt:
                          type: number
                          description: >-
                            The payout amount. The currency will follow the
                            payment link currency.
                        acc_name:
                          type: string
                          description: >-
                            The name of the beneficiary. If the beneficiary is
                            an ABA account number, it will show the account
                            holder's name. If the beneficiary is a MID (ABA
                            Merchant), it will show the outlet name associated
                            with that MID.
                      x-apidog-orders:
                        - acc
                        - amt
                        - acc_name
                    description: Payout instructions for the payment link
                x-apidog-orders:
                  - data
                  - payout
                  - status
                  - tran_id
          headers:
            Content-Type:
              example: application/json
              required: false
              description: ''
              schema:
                type: string
          x-apidog-name: Success
      security: []
      x-apidog-folder: Payment Link
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/831852/apis/api-14530837-run
components:
  schemas: {}
  securitySchemes: {}
servers:
  - url: https://checkout-sandbox.payway.com.kh/
    description: StillZeroBug
security: []

```
