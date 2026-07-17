interface components {
    schemas: {
        PurchaseRequest: {
            /**
             * @description UTC request timestamp, format YYYYMMDDHHmmss. Must be freshly generated at signing time.
             * @example 20250213065545
             */
            req_time: string;
            /** @description Merchant key issued by ABA Bank. */
            merchant_id: string;
            /** @description Merchant-generated unique transaction identifier. */
            tran_id: string;
            /** @description Buyer's first name. Must not contain digits/special characters (rejected as error code 16). */
            firstname?: string;
            /** @description Buyer's last name. Same validation as firstname (error code 17). */
            lastname?: string;
            /** @description Buyer's email (validated server-side, error code 19 if invalid). */
            email?: string;
            /** @description Buyer's phone (validated server-side, error code 18 if invalid). */
            phone?: string;
            /**
             * @description "pre-auth" only supports ABA PAY, KHQR, and Card. Using pre-auth with an unsupported payment_option returns error code 22.
             * @default purchase
             * @enum {string}
             */
            type: "purchase" | "pre-auth";
            /**
             * @description Omit to let PayWay auto-display all payment options the merchant profile supports. abapay_khqr_deeplink changes the 200 response from HTML to a JSON object (qr_string, abapay_deeplink, checkout_qr_url) — see PurchaseQrResponse.
             * @enum {string}
             */
            payment_option?: "cards" | "abapay_khqr" | "abapay_khqr_deeplink" | "alipay" | "wechat" | "google_pay";
            /** @description Base64-encoded JSON array of {name, quantity, price}. Descriptive only — NOT used for amount validation or calculation; `amount` is the sole source of truth for what's charged. */
            items?: string;
            /**
             * @description Shipping fee, additive to amount at checkout.
             * @default 0
             */
            shipping: number;
            /** @description Purchase amount. Zero is rejected (error 45). KHR currency cannot carry decimals (error 46) and must exceed 100 KHR (error 47). */
            amount: number;
            /**
             * @description Defaults to the currency of the first account on the merchant profile if omitted.
             * @enum {string}
             */
            currency?: "KHR" | "USD";
            /** @description Base64-encoded callback URL. Custom return_url values must be pre-whitelisted on the merchant profile (error 6/81) or the request is rejected. */
            return_url?: string;
            /** @description Redirect target when the customer closes/cancels the payment dialog. */
            cancel_url?: string;
            /**
             * @description Overrides the profile-level "skip success page" setting for this request only. 1 = skip, redirecting via continue_success_url.
             * @enum {integer}
             */
            skip_success_page?: 0 | 1;
            /** @description Redirect target after a successful payment (used when skip_success_page=1). */
            continue_success_url?: string;
            /** @description Base64-encoded JSON {ios_scheme, android_scheme}. Mandatory for mobile-app integrations so ABA Mobile can hand control back to the merchant's native app. */
            return_deeplink?: string;
            /** @description Base64-encoded arbitrary JSON merchants want attached to the transaction record/export (not used by PayWay's own logic). */
            custom_fields?: string;
            /** @description Opaque string echoed back verbatim in the return_url pushback payload. */
            return_params?: string;
            /**
             * @description hosted_view opens a new tab; popup renders as a bottom sheet (mobile) or modal (desktop).
             * @enum {string}
             */
            view_type?: "hosted_view" | "popup";
            /** @description Set to 0 to route through Checkout service when the profile also has QR Payment API enabled. */
            payment_gate?: number;
            /** @description Base64-encoded JSON array of {acc, amt} splitting the payment across up to 10 destination accounts (error 25 if exceeded). Accounts must be whitelisted first (error 37). */
            payout?: string;
            /** @description Base64-encoded JSON, currently only used for WeChat Mini Program (wechat_sub_appid, wechat_sub_openid). */
            additional_params?: string;
            /** @description Minutes before the payment link expires. Min 3, max 43200 (30 days). Below 3 is rejected (error 69). Behavior on expiry differs by method: ABA PAY/Card simply fail; KHQR reverses funds to the payer; WeChat/Alipay do not reverse. */
            lifetime?: number;
            /** @description Required when payment_option=google_pay and the merchant manages payment-method selection itself. */
            google_pay_token?: string;
            /** @description base64(HMAC-SHA512(concat_in_x-hmac-fields-order, api_key)). See operation-level x-hmac-fields for the exact field order — it is NOT alphabetical and NOT the same as check/close-transaction. */
            hash: string;
        };
        /** @description Returned instead of HTML when payment_option=abapay_khqr_deeplink. */
        PurchaseQrResponse: {
            /** @description Raw KHQR payload string, scannable by any KHQR-member banking app. */
            qr_string?: string;
            /** @description Deeplink that opens ABA Mobile directly to the pre-filled payment. */
            abapay_deeplink?: string;
            /** @description Hosted URL rendering the QR code as an image/page, for platforms that can't render qr_string themselves. */
            checkout_qr_url?: string;
        };
        /** @description purchase's JSON error shape (distinct from the HTML success path). Non-exhaustive: purchase alone defines ~80 distinct error codes (wrong hash, invalid amount, currency not allowed, payout validation, Google Pay token failures, etc.) — pull the full table from the scraped spec into your SDK's error-code enum rather than hand-copying a subset here; this skeleton intentionally does not restate all ~80 to keep the spec reviewable, but the generated client MUST surface `code` typed, not just `message` stringly. */
        ErrorStatus: {
            status: {
                code: string;
                message: string;
            };
        };
        /** @description Shared shape for check-transaction and close-transaction — both sign only these 3 fields (see per-operation x-hmac-fields). */
        TranLookupRequest: {
            /** @description UTC request timestamp, format YYYYMMDDHHmmss. */
            req_time: string;
            /** @description Merchant key issued by ABA Bank. */
            merchant_id: string;
            /** @description The original purchase transaction id to look up or close. */
            tran_id: string;
            /** @description base64(HMAC-SHA512(req_time + merchant_id + tran_id, api_key)). */
            hash: string;
        };
        StatusBlock: {
            /** @description Endpoint-specific status code. NOTE: check-transaction and close-transaction each define their own code space (e.g. "00" success vs "0" on purchase-family errors) — do not assume a single shared enum across endpoints; encode per-operation code tables separately in the generated SDK's error types. */
            code: string;
            /** @description Human-readable detail for `code`. */
            message: string;
            /** @description Echoes the transaction id the status applies to. */
            tran_id?: string;
        };
        /**
         * @example {
         *       "data": {
         *         "payment_status_code": 0,
         *         "payment_status": "APPROVED",
         *         "total_amount": 10,
         *         "original_amount": 10,
         *         "refund_amount": 0,
         *         "discount_amount": 0,
         *         "payment_amount": 10,
         *         "payment_currency": "USD",
         *         "apv": "619195",
         *         "transaction_date": "2025-02-13 06:56:00"
         *       },
         *       "status": {
         *         "code": "00",
         *         "message": "Success!",
         *         "tran_id": "17394277693"
         *       }
         *     }
         */
        CheckTransactionResponse: {
            /** @description Present on successful lookup (status.code == "00"). */
            data?: {
                /** @description 0=APPROVED/PRE-AUTH, 2=PENDING, 3=DECLINED, 4=REFUNDED, 7=CANCELLED */
                payment_status_code?: number;
                /** @enum {string} */
                payment_status?: "APPROVED" | "PRE-AUTH" | "REFUNDED" | "PENDING" | "DECLINED" | "CANCELLED";
                /** @description Amount due after discount. */
                total_amount?: number;
                original_amount?: number;
                /** @description Sum of all refunds issued against this transaction. */
                refund_amount?: number;
                /** @description In the original transaction's currency. */
                discount_amount?: number;
                /** @description Amount actually paid by the customer. */
                payment_amount?: number;
                payment_currency?: string;
                /** @description Transaction approval code. */
                apv?: string;
                /** @description Timestamp the transaction was created in the payment gateway. */
                transaction_date?: string;
            };
            status: components["schemas"]["StatusBlock"];
        };
        CloseTransactionResponse: {
            status: components["schemas"]["StatusBlock"];
        };
        /** @description One entry in a transaction's operation history (capture, pre-auth completion/cancellation, refund). */
        TransactionOperation: {
            /** @enum {string} */
            status?: "Completed" | "Pre-Auth" | "Completed Pre-Auth" | "Cancelled Pre-Auth" | "Refunded";
            /** @description Amount associated with this specific operation, not the transaction total. */
            amount?: number;
            /** @description Timestamp this operation occurred. */
            transaction_date?: string;
            /** @description Core-banking booking entry id — populated for ABA PAY operations only, blank otherwise. */
            bank_ref?: string;
        };
        /** @description Response for getTransactionDetail. NOT intended for real-time polling — see rate-limit note on the operation (10 req/min, not raisable). */
        TransactionDetailResponse: {
            /** @description Present when status.code == "00". */
            data?: {
                /** @description Echoes the requested tran_id. */
                transaction_id?: string;
                /** @description 0=APPROVED/PRE-AUTH, 2=PENDING, 3=DECLINED, 4=REFUNDED, 7=CANCELLED */
                payment_status_code?: number;
                /** @enum {string} */
                payment_status?: "APPROVED" | "PRE-AUTH" | "PENDING" | "DECLINED" | "REFUNDED" | "CANCELLED";
                /** @description Before discount. */
                original_amount?: number;
                original_currency?: string;
                /** @description Amount actually paid by the customer. */
                payment_amount?: number;
                payment_currency?: string;
                /** @description Amount due after discount. */
                total_amount?: number;
                /** @description Total refunded to date. */
                refund_amount?: number;
                discount_amount?: number;
                /** @description Transaction approval code. */
                apv?: string;
                transaction_date?: string;
                /** @description Payer first name. */
                first_name?: string;
                /** @description Payer last name. */
                last_name?: string;
                email?: string;
                phone?: string;
                /** @description ABA core-banking booking entry reference. */
                bank_ref?: string;
                /** @enum {string} */
                payment_type?: "ABA Pay" | "Alipay" | "Wechat" | "KHQR" | "VISA" | "MC" | "JCB" | "CUP";
                /** @description Masked account number or card PAN. */
                payer_account?: string;
                /** @description ABA Bank for ABA PAY, or issuer bank for KHQR. */
                bank_name?: string;
                /** @enum {string} */
                card_source?: "ONUS" | "OFFUS_DOMESTIC" | "OFFUS_INTERNATIONAL";
                /** @description Full operation history for this transaction. */
                transaction_operations?: components["schemas"]["TransactionOperation"][];
            };
            /** @description code space for this endpoint: "00" success, "5" wrong hash (note: NOT "1" as in check/close-transaction — do not assume a shared numeric code space across endpoints), "6" transaction not found, "8" invalid merchant profile, "11" internal server error, "429" rate limit exceeded. */
            status: components["schemas"]["StatusBlock"];
        };
        /** @description All filter fields are optional but each still occupies a fixed position in the HMAC input per x-hmac-fields on the operation — pass them as null/empty rather than omitting the key. */
        TransactionListRequest: {
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            req_time: string;
            merchant_id: string;
            /** @description Format YYYY-MM-DD HH:mm:ss. Defaults to today 00:00:00 if omitted. */
            from_date?: string | null;
            /** @description Format YYYY-MM-DD HH:mm:ss. Defaults to today 23:59:59 if omitted. Date range capped at 3 days total. */
            to_date?: string | null;
            from_amount?: number | null;
            to_amount?: number | null;
            /** @description Comma-separated for multiple values. Case-insensitive. One of APPROVED, PRE-AUTH, REFUNDED, PENDING, DECLINED, CANCELLED. */
            status?: string | null;
            /** @default 1 */
            page: string;
            /**
             * @description Max 1000 records per page.
             * @default 40
             */
            pagination: string;
            hash: string;
        };
        /** @description Same shape as TransactionDetailResponse.data minus transaction_operations (no per-item history in list view). */
        TransactionListItem: {
            transaction_id?: string;
            transaction_date?: string;
            apv?: string;
            /** @enum {string} */
            payment_status?: "APPROVED" | "PRE-AUTH" | "REFUNDED" | "PENDING" | "DECLINED" | "CANCELLED";
            payment_status_code?: number;
            original_amount?: number;
            /** @enum {string} */
            original_currency?: "KHR" | "USD";
            total_amount?: number;
            discount_amount?: number;
            refund_amount?: number;
            payment_amount?: number;
            payment_currency?: string;
            /** @description Only present if enabled on the merchant profile. */
            first_name?: string;
            /** @description Only present if enabled on the merchant profile. */
            last_name?: string;
            /** @description Only present if enabled on the merchant profile. */
            email?: string;
            /** @description Only present if enabled on the merchant profile. */
            phone?: string;
            /** @description Only present if enabled on the merchant profile. */
            bank_ref?: string;
            payer_account?: string;
            bank_name?: string;
            /** @enum {string} */
            card_source?: "ONUS" | "OFFUS_DOMESTIC" | "OFFUS_INTERNATIONAL";
            /**
             * @description N/A for transactions still pending payment.
             * @enum {string}
             */
            payment_type?: "N/A" | "ABA Pay" | "Alipay" | "Wechat" | "KHQR" | "VISA" | "MC" | "JCB" | "CUP";
        };
        TransactionListResponse: {
            data?: components["schemas"]["TransactionListItem"][];
            /** @description Current page index. */
            page?: string;
            /** @description Records per page (max 1000). */
            pagination?: string;
            /** @description code space: "00" success, "1" wrong hash, "8" invalid merchant profile, "11" internal server error, "429" rate limit exceeded (50 req/min on this endpoint). */
            status: components["schemas"]["StatusBlock"];
        };
        /** @description NOTE the field name is `request_time`, not `req_time` as on every other endpoint in this spec — see info.description item 8. */
        RefundRequest: {
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            request_time: string;
            merchant_id: string;
            /** @description Base64 of RSA-encrypted, chunked JSON {mc_id, tran_id, refund_amount}. See x-merchant-auth-encryption on the refund operation for the exact construction process and required credential (a separate RSA public key from ABA Bank, distinct from the HMAC api_key). */
            merchant_auth: string;
            /** @description base64(HMAC-SHA512(request_time + merchant_id + merchant_auth, api_key)). */
            hash: string;
        };
        RefundResponse: {
            /**
             * Format: double
             * @description Amount after any discount, e.g. $20 purchase with $2 discount -> grand_total $18.
             */
            grand_total?: number;
            /**
             * Format: double
             * @description Cumulative refunded amount across all partial refunds issued so far.
             */
            total_refunded?: number;
            /** @description Original transaction currency. */
            currency?: string;
            /** @description REFUNDED for both full and partial refunds. */
            transaction_status?: string;
            /** @description Distinct, alphanumeric code space unique to this endpoint — do not reuse StatusBlock's assumption of numeric-string codes. Notable codes: 00 success, PTL02 invalid hash, PTL37 refund exceeds original amount, PTL57/PTL58 unable/failed to refund, PTL168 concurrent request rejected, PTL181 insufficient available balance. */
            status: {
                code: string;
                message: string;
            };
        };
        ExchangeRateRequest: {
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            req_time: string;
            merchant_id: string;
            /** @description base64(HMAC-SHA512(req_time + merchant_id, api_key)) — only 2 fields, the shortest hash input in this API surface. */
            hash: string;
        };
        CurrencyRate: {
            /** @description Sell rate, as a decimal string. */
            sell: string;
            /** @description Buy rate, as a decimal string. */
            buy: string;
        };
        /** @description The vendor's own schema listed an inconsistent `required` array under exchange_rates (omitting some currencies present in `properties`) — treated as a docs artifact and modeled here via additionalProperties instead of a hardcoded required list, since the actual currency set PayWay returns may change over time without notice. */
        ExchangeRateResponse: {
            status: {
                /** @description 00 success, 1 wrong hash, 26 invalid merchant profile. */
                code: string;
                message: string;
            };
            /** @description Keyed by lowercase ISO currency code (observed: aud, sgd, eur, gbp, myr, thb, hkd, cny, cad, krw, jpy, vnd). Modeled with additionalProperties rather than enumerating every key as required, since PayWay could add/remove currencies. */
            exchange_rates: {
                [key: string]: components["schemas"]["CurrencyRate"];
            };
        };
        LinkAccountRequest: {
            /** @description Unique request identifier generated by the merchant. */
            request_id: string;
            /** @description UTC timestamp, format YYYYMMDDHHmmss. */
            request_time: string;
            /** @description Merchant key issued by ABA Bank. */
            merchant_id: string;
            /** @description Customer token identifier — merchant-side unique ID for the customer. */
            ctid?: string;
            /** @description Base64-encoded JSON {ios_scheme, android_scheme} for mobile app integration. */
            return_deeplink?: string;
            /**
             * @description Defines who triggers transactions and whether the amount is fixed or variable. CITR = Customer-Initiated Token Registration, MITR = Merchant-Initiated Token Registration.
             * @enum {string}
             */
            token_flag?: "CITR_FIX" | "CITR_FLEX" | "MITR_FIX" | "MITR_FLEX" | "CITI_FIX" | "CITI_FLEX" | "MITU_FIX" | "MITU_FLEX";
            /** @enum {string} */
            currency?: "KHR" | "USD";
            /** @description URL where PayWay sends the account details and token after linking. */
            callback_url?: string;
            /** @description base64(HMAC-SHA512(concat_in_x-hmac-fields-order, api_key)). */
            hash: string;
        };
        LinkAccountResponse: {
            status?: {
                code?: string;
                message?: string;
            };
            /** @description QR code payload for scanning. */
            qr_string?: string;
            /** @description Deeplink to open ABA Mobile. */
            abapay_deeplink?: string;
        };
        LinkCardRequest: {
            request_id: string;
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            request_time: string;
            merchant_id: string;
            /** @description Customer token identifier. */
            ctid?: string;
            return_deeplink?: string;
            /** @enum {string} */
            token_flag?: "CITR_FIX" | "CITR_FLEX" | "MITR_FIX" | "MITR_FLEX" | "CITI_FIX" | "CITI_FLEX" | "MITU_FIX" | "MITU_FLEX";
            /**
             * @description Required for Link Card. Billing frequency.
             * @enum {string}
             */
            frequency?: "1W" | "1M" | "2M";
            /** @description Base64-encoded callback URL. */
            return_url?: string;
            callback_url?: string;
            hash: string;
        };
        LinkCardResponse: {
            status?: {
                code?: string;
                message?: string;
            };
        };
        CofPaymentRequest: {
            request_id: string;
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            request_time: string;
            merchant_id: string;
            /** @description Merchant-generated unique transaction identifier. */
            tran_id: string;
            /** @description Payment amount. */
            amount: number;
            /** @description Token from link-account or link-card. */
            pwt?: string;
            /** @description Customer token identifier. */
            ctid?: string;
            /** @enum {string} */
            token_flag?: "CITR_FIX" | "CITR_FLEX" | "MITR_FIX" | "MITR_FLEX" | "CITI_FIX" | "CITI_FLEX" | "MITU_FIX" | "MITU_FLEX";
            /** @enum {string} */
            currency?: "KHR" | "USD";
            callback_url?: string;
            hash: string;
        };
        CofPaymentResponse: {
            status?: {
                code?: string;
                message?: string;
                tran_id?: string;
            };
        };
        RenewTokenRequest: {
            request_id: string;
            request_time: string;
            merchant_id: string;
            ctid: string;
            pwt: string;
            hash: string;
        };
        RenewTokenResponse: {
            status?: {
                code?: string;
                message?: string;
            };
            /** @description New payment token replacing the old one. */
            new_token?: string;
        };
        GetTokenDetailsRequest: {
            request_id: string;
            request_time: string;
            merchant_id: string;
            ctid: string;
            pwt: string;
            hash: string;
        };
        GetTokenDetailsResponse: {
            status?: {
                code?: string;
                message?: string;
            };
            data?: {
                token?: string;
                /** @description ACCOUNT or CARD. */
                token_type?: string;
                /** @description Masked account number or card PAN. */
                masked_account?: string;
                token_status?: string;
                expiry_date?: string;
            };
        };
        RemoveTokenRequest: {
            request_id: string;
            request_time: string;
            merchant_id: string;
            ctid: string;
            pwt: string;
            hash: string;
        };
        RemoveTokenResponse: {
            status?: {
                code?: string;
                message?: string;
            };
        };
        GenerateQrRequest: {
            /** @description UTC request timestamp, format YYYYMMDDHHmmss. */
            req_time: string;
            /** @description Merchant key issued by ABA Bank. */
            merchant_id: string;
            /** @description Merchant-generated unique transaction identifier. */
            tran_id: string;
            /** @description Payment amount. */
            amount: number;
            /** @enum {string} */
            purchase_type: "purchase";
            /** @example abapay_khqr */
            payment_option: string;
            /** @description Base64-encoded callback URL. */
            callback_url: string;
            /** @enum {string} */
            currency: "KHR" | "USD";
            /** @example template2 */
            qr_image_template: string;
            /** @description base64(HMAC-SHA512(concat_in_x-hmac-fields-order, api_key)). */
            hash: string;
        };
        GenerateQrResponse: {
            /** @description Raw KHQR payload string, scannable by any KHQR-member banking app. */
            qrString?: string;
            /** @description Data URL containing the rendered QR PNG image. */
            qrImage?: string;
        };
        /** @description Uses RSA-encrypted merchant_auth containing transaction details. See x-merchant-auth-encryption on the operation for encryption process. */
        CreatePaymentLinkRequest: {
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            request_time: string;
            /** @description Merchant key issued by ABA Bank. */
            merchant_id: string;
            /** @description Base64 of RSA-encrypted, chunked JSON containing transaction details (title, amount, description, payment_limit, return_url, merchant_ref_no, expired_date). */
            merchant_auth: string;
            /** @description base64(HMAC-SHA512(request_time + merchant_id + merchant_auth, api_key)). */
            hash: string;
        };
        CreatePaymentLinkResponse: {
            status?: {
                code?: string;
                message?: string;
            };
            /** @description The generated payment link URL to share with customers. */
            payment_link?: string;
            tran_id?: string;
        };
        GetPaymentLinkDetailsRequest: {
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            request_time: string;
            merchant_id: string;
            /** @description RSA-encrypted JSON {mc_id, id}. */
            merchant_auth: string;
            /** @description base64(HMAC-SHA512(request_time + merchant_id + merchant_auth, api_key)). */
            hash: string;
        };
        GetPaymentLinkDetailsResponse: {
            status?: {
                code?: string;
                message?: string;
            };
            data?: {
                tran_id?: string;
                amount?: number;
                currency?: string;
                payment_status?: string;
                payment_link?: string;
                created_date?: string;
                expiry_date?: string;
            };
        };
        /** @description Uses RSA-encrypted merchant_auth. NOTE: uses request_time (not req_time), same convention as the Refund endpoint. */
        CompletePreAuthRequest: {
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            request_time: string;
            merchant_id: string;
            /** @description Base64 of RSA-encrypted JSON {mc_id, tran_id, complete_amount, payout?}. */
            merchant_auth: string;
            /** @description base64(HMAC-SHA512(request_time + merchant_id + merchant_auth, api_key)). */
            hash: string;
        };
        CompletePreAuthResponse: {
            status?: {
                code: string;
                message: string;
            };
            /** @description Updated status after completion (e.g., APPROVED). */
            transaction_status?: string;
            total_amount?: number;
        };
        CancelPreAuthRequest: {
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            request_time: string;
            merchant_id: string;
            /** @description Base64 of RSA-encrypted JSON {mc_id, tran_id}. */
            merchant_auth: string;
            /** @description base64(HMAC-SHA512(request_time + merchant_id + merchant_auth, api_key)). */
            hash: string;
        };
        CancelPreAuthResponse: {
            status?: {
                code: string;
                message: string;
            };
            /** @description Updated status after cancellation (e.g., CANCELLED). */
            transaction_status?: string;
        };
        PayoutRequest: {
            /** @description Merchant key issued by ABA Bank. */
            merchant_id: string;
            /** @description Merchant-generated unique payout transaction identifier. */
            tran_id: string;
            /** @description Payout amount. */
            amount: number;
            /** @description Base64 of RSA-encrypted JSON array of {account, amount}. */
            beneficiaries: string;
            /** @enum {string} */
            currency: "KHR" | "USD";
            /** @description JSON string associated with the payout. */
            custom_fields?: string;
            /** @description hex(HMAC-SHA512(merchant_id + tran_id + beneficiaries + amount + custom_fields + currency, api_key)). */
            hash: string;
        };
        PayoutResponse: {
            status?: {
                code: string;
                message: string;
                tran_id?: string;
            };
            /** @description Core-banking reference for the payout transaction. */
            bank_ref?: string;
        };
        UpdateBeneficiaryStatusRequest: {
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            request_time: string;
            merchant_id: string;
            /** @description Base64 of RSA-encrypted JSON {mc_id, payee, status}, where status is 0 or 1. */
            merchant_auth: string;
            /** @description base64(HMAC-SHA512(request_time + merchant_auth, api_key)). */
            hash: string;
        };
        BeneficiaryResponse: {
            status?: {
                code: string;
                message: string;
            };
        };
        AddBeneficiaryRequest: {
            /** @description UTC timestamp, YYYYMMDDHHmmss. */
            request_time: string;
            merchant_id: string;
            /** @description Base64 of RSA-encrypted JSON {mc_id, payee}. */
            merchant_auth: string;
            /** @description base64(HMAC-SHA512(request_time + merchant_auth, api_key)). */
            hash: string;
        };
        GetTransactionsByMcRefRequest: {
            /**
             * @description UTC timestamp, format YYYYMMDDHHmmss.
             * @example 20250213084236
             */
            req_time: string;
            /**
             * @description Merchant key issued by ABA Bank.
             * @example ec000002
             */
            merchant_id: string;
            /**
             * @description Merchant reference number.
             * @example 17394277693
             */
            merchant_ref: string;
            /** @description base64(HMAC-SHA512(req_time + merchant_id + merchant_ref, api_key)). */
            hash: string;
        };
        KhqrTransaction: {
            transaction_id?: string;
            transaction_date?: string;
            bank_ref?: string;
            apv?: string;
            discount_amount?: number;
            payment_status?: string;
            payment_amount?: number;
            payment_currency?: string;
            payment_type?: string;
            payer_account?: string;
            total_amount?: number;
            original_amount?: number;
            original_currency?: string;
            payment_status_code?: number;
            bank_name?: string;
            refund_amount?: number;
            merchant_ref?: string;
        };
        GetTransactionsByMcRefResponse: {
            /** @description 0=Success, 1=Wrong hash, 8=Invalid merchant profile, 11=Internal server error. */
            status?: number;
            transactions?: components["schemas"]["KhqrTransaction"][];
        };
        /** @description Body shape is NOT fixed — PayWay states additional fields may be present depending on payment method. Treat unknown keys as pass-through when computing the signature (item 3 in info.description sorts ALL present keys, not a fixed subset). */
        PaymentCallbackBody: {
            /** @description The tran_id supplied on the original purchase call. */
            tran_id: string;
            /** @description Transaction approval code. */
            apv: string;
            /** @description Payment status for this callback. */
            status: string;
            /** @description Echoes the return_params value from the original purchase request, if any was supplied. */
            return_params?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}

interface CheckoutDomain {
    createTransaction: (params: CreateTransactionParams) => Record<string, unknown> & {
        hash: string;
    };
    checkTransaction: (transactionId: string, requestTime?: string) => Promise<components['schemas']['CheckTransactionResponse']>;
    closeTransaction: (transactionId: string, requestTime?: string) => Promise<components['schemas']['CloseTransactionResponse']>;
    getTransactionDetail: (transactionId: string, requestTime?: string) => Promise<components['schemas']['TransactionDetailResponse']>;
    getTransactionList: (params: GetTransactionListParams) => Promise<components['schemas']['TransactionListResponse']>;
    refund: (transactionId: string, amount: number) => Promise<components['schemas']['RefundResponse']>;
    getExchangeRate: (requestTime?: string) => Promise<components['schemas']['ExchangeRateResponse']>;
}

interface CredentialsOnFileDomain {
    linkAccount: (params: LinkAccountParams) => Promise<components['schemas']['LinkAccountResponse']>;
    linkCard: (params: LinkCardParams) => Promise<components['schemas']['LinkCardResponse']>;
    payment: (params: CofPaymentParams) => Promise<components['schemas']['CofPaymentResponse']>;
    renewToken: (params: TokenParams) => Promise<components['schemas']['RenewTokenResponse']>;
    getTokenDetails: (params: TokenParams) => Promise<components['schemas']['GetTokenDetailsResponse']>;
    removeToken: (params: TokenParams) => Promise<components['schemas']['RemoveTokenResponse']>;
}

/**
 * Parameters for generating an offline merchant-scannable QR code.
 *
 * Important: this helper produces a **custom TLV-encoded QR string** with a
 * CRC-16 checksum. It is **not** an official Bakong KHQR / EMVCo QR-MPM code
 * and should not be presented to customers as a standard KHQR. Use it only as
 * an offline fallback for merchant-owned scanners that understand this format.
 */
interface GenerateOfflineQrParams {
    merchantId: string;
    transactionId: string;
    amount: number;
    currency: 'KHR' | 'USD';
    merchantRef: string;
    tipAmount?: number;
    feeAmount?: number;
    transactionType?: 'purchase' | 'refund' | 'cash';
}

interface QrDomain {
    generateQr: (params: GenerateQrParams) => Promise<components['schemas']['GenerateQrResponse']>;
    generateOfflineQR: (params: GenerateOfflineQrParams) => string;
}

interface PaymentLinkDomain {
    create: (params: CreatePaymentLinkParams) => Promise<components['schemas']['CreatePaymentLinkResponse']>;
    getDetails: (paymentLinkId: string) => Promise<components['schemas']['GetPaymentLinkDetailsResponse']>;
}

interface PreAuthDomain {
    complete: (transactionId: string, amount: number) => Promise<components['schemas']['CompletePreAuthResponse']>;
    completeWithPayout: (transactionId: string, amount: number, payout: {
        acc: string;
        amt: number;
    }[]) => Promise<components['schemas']['CompletePreAuthResponse']>;
    cancel: (transactionId: string) => Promise<components['schemas']['CancelPreAuthResponse']>;
}

interface PayoutDomain {
    payout: (params: PayoutParams) => Promise<components['schemas']['PayoutResponse']>;
    updateBeneficiaryStatus: (params: UpdateBeneficiaryStatusParams) => Promise<components['schemas']['BeneficiaryResponse']>;
    addBeneficiary: (params: AddBeneficiaryParams) => Promise<components['schemas']['BeneficiaryResponse']>;
}

interface KhqrDomain {
    generateOfflineQR: (params: GenerateOfflineQrParams) => string;
    getTransactionsByMerchantRef: (merchantRef: string, requestTime?: string) => Promise<components['schemas']['GetTransactionsByMcRefResponse']>;
}

/**
 * Verifies a webhook signature using PayWay's sorted-key signature validation algorithm.
 */
declare function verifyCallbackSignature(body: Record<string, unknown>, receivedSignature: string, apiKey: string): boolean;

type Currency = 'USD' | 'KHR';
type Environment = 'sandbox' | 'production';
interface ItemEntry {
    name: string;
    quantity: number;
    price: number;
}
interface RateLimitRule {
    limit: number;
    intervalMs: number;
}
interface RateLimitInfo {
    limit?: number;
    remaining?: number;
    reset?: number;
    retryAfterMs?: number;
    rawHeaders?: Record<string, string>;
}
interface PayWayConfig {
    merchantId: string;
    apiKey: string;
    publicKeyPem?: string;
    environment?: 'sandbox' | 'production';
    timeout?: number;
    baseUrl?: string;
    maxRetries?: number;
    retryDelayMs?: number;
    rateLimitThrottling?: boolean;
    rateLimitRules?: Record<string, RateLimitRule>;
    onRequest?: (endpoint: string, bodyPayload: string) => void;
    onResponse?: (endpoint: string, statusCode: number, body: unknown, rateLimitInfo?: RateLimitInfo) => void;
}
interface GatewayErrorDetails {
    code?: string | number;
    message?: string;
    rawBody?: unknown;
    statusCode?: number;
}
interface CreateTransactionParams {
    transactionId: string;
    amount: number;
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    type?: 'purchase' | 'pre-auth';
    paymentOption?: 'cards' | 'abapay_khqr' | 'abapay_khqr_deeplink' | 'alipay' | 'wechat' | 'google_pay' | string;
    items?: string | ItemEntry[];
    shipping?: number;
    currency?: 'KHR' | 'USD';
    returnUrl?: string;
    cancelUrl?: string;
    skipSuccessPage?: 0 | 1;
    continueSuccessUrl?: string;
    returnDeeplink?: string | {
        ios_scheme: string;
        android_scheme: string;
    };
    customFields?: string | Record<string, unknown>;
    returnParams?: string;
    viewType?: 'hosted_view' | 'popup';
    paymentGate?: number;
    payout?: string | {
        acc: string;
        amt: number;
    }[];
    additionalParams?: string | Record<string, unknown>;
    lifetime?: number;
    googlePayToken?: string;
}
interface LinkAccountParams {
    requestId: string;
    ctid?: string;
    returnDeeplink?: string | {
        ios_scheme: string;
        android_scheme: string;
    };
    tokenFlag?: string;
    currency?: 'KHR' | 'USD';
    callbackUrl?: string;
    requestTime?: string;
}
interface LinkCardParams {
    requestId: string;
    ctid?: string;
    returnDeeplink?: string | {
        ios_scheme: string;
        android_scheme: string;
    };
    tokenFlag?: string;
    frequency?: '1W' | '1M' | '2M';
    returnUrl?: string;
    callbackUrl?: string;
    requestTime?: string;
}
interface CofPaymentParams {
    requestId: string;
    transactionId: string;
    amount: number;
    ctid?: string;
    paymentToken: string;
    tokenFlag?: string;
    currency?: 'KHR' | 'USD';
    callbackUrl?: string;
    requestTime?: string;
}
interface TokenParams {
    requestId: string;
    ctid: string;
    paymentToken: string;
    requestTime?: string;
}
interface GenerateQrParams {
    transactionId: string;
    amount: number;
    paymentOption: 'abapay_khqr' | string;
    callbackUrl: string;
    purchaseType?: 'purchase';
    currency?: 'KHR' | 'USD';
    qrImageTemplate?: string;
    requestTime?: string;
}
interface CreatePaymentLinkParams {
    title: string;
    amount: number;
    description?: string;
    paymentLimit?: number;
    returnUrl?: string;
    merchantRefNo: string;
    expiredDate?: number;
}
interface PayoutParams {
    transactionId: string;
    amount: number;
    beneficiaries: {
        account: string;
        amount: number;
    }[];
    currency: Currency;
    customFields?: string | Record<string, unknown>;
}
interface UpdateBeneficiaryStatusParams {
    payee: string;
    status: 0 | 1;
}
interface AddBeneficiaryParams {
    payee: string;
}
interface GetTransactionListParams {
    fromDate?: string | null;
    toDate?: string | null;
    fromAmount?: number | string | null;
    toAmount?: number | string | null;
    status?: string | null;
    page?: string;
    pagination?: string;
    requestTime?: string;
}
/**
 * PayWay SDK client.
 *
 * @example
 * const payway = new PayWay({ merchantId, apiKey, environment: 'sandbox' });
 */
declare class PayWay {
    private config;
    private baseUrl;
    private rateLimitRules;
    private rateLimitState;
    readonly checkout: CheckoutDomain;
    readonly credentialsOnFile: CredentialsOnFileDomain;
    readonly qr: QrDomain;
    readonly paymentLink: PaymentLinkDomain;
    readonly preAuth: PreAuthDomain;
    readonly payout: PayoutDomain;
    readonly khqr: KhqrDomain;
    /**
     * Create a new PayWay SDK client instance.
     *
     * @param config - The SDK configuration options.
     * @param config.merchantId - The merchant ID issued by PayWay.
     * @param config.apiKey - The API key/secret issued by PayWay for signing.
     * @param config.publicKeyPem - The 1024-bit RSA public key PEM string for encrypting request payloads.
     * @param config.environment - The target environment ('sandbox' or 'production'). Defaults to 'sandbox'.
     * @param config.timeout - The request timeout in milliseconds. Defaults to 30,000 (30 seconds).
     * @param config.baseUrl - Optional override for the base API URL.
     * @throws {PayWayConfigError} If the configuration is missing or invalid.
     */
    constructor(config: PayWayConfig);
    private _getRateLimitRule;
    private _refillRateLimitState;
    private _acquireRateLimitToken;
    private _executeFetch;
    private request;
    private requestWithMerchantAuth;
    /**
     * Verify the signature of a webhook/callback notification from PayWay.
     *
     * @param body - The raw request body or parsed payload from the callback without the `hash` field.
     * @param signature - The signature/hash received from the PayWay callback headers/body.
     * @returns True if the signature is valid and authentic, false otherwise.
     */
    verifyCallback(body: Record<string, unknown>, signature: string): boolean;
    getGatewayErrorDetails(error: unknown): GatewayErrorDetails | null;
}

declare class PayWayError extends Error {
    constructor(message: string);
}
declare class PayWayConfigError extends PayWayError {
    constructor(message: string);
}
declare class PayWayAPIError extends PayWayError {
    readonly statusCode?: number;
    readonly paywayCode?: string;
    readonly rawBody?: unknown;
    readonly endpoint?: string;
    readonly retryable?: boolean;
    readonly rateLimitInfo?: Record<string, unknown>;
    constructor(message: string, options?: {
        statusCode?: number;
        paywayCode?: string;
        rawBody?: unknown;
        endpoint?: string;
        retryable?: boolean;
        rateLimitInfo?: Record<string, unknown>;
    });
    toJSON(): Record<string, unknown>;
}

export { type AddBeneficiaryParams, type CheckoutDomain, type CofPaymentParams, type CreatePaymentLinkParams, type CreateTransactionParams, type CredentialsOnFileDomain, type Currency, type Environment, type GenerateOfflineQrParams, type GenerateQrParams, type GetTransactionListParams, type ItemEntry, type KhqrDomain, type LinkAccountParams, type LinkCardParams, PayWay, PayWayAPIError, type PayWayConfig, PayWayConfigError, PayWayError, type PaymentLinkDomain, type PayoutDomain, type PayoutParams, type PreAuthDomain, type QrDomain, type RateLimitInfo, type RateLimitRule, type TokenParams, type UpdateBeneficiaryStatusParams, verifyCallbackSignature };
