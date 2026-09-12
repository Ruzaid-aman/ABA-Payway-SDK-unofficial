/**
 * payment_screen.dart
 * PayWay Flutter Integration Example
 *
 * A single-file example showing the two things every Flutter integration
 * needs: (1) loading your backend's PayWay checkout in a `webview_flutter`
 * WebView and intercepting the return-URL redirect, and (2) launching the
 * ABA Pay app via a deeplink (`abapay_khqr_deeplink`) with a fallback when
 * the app is not installed.
 *
 * Your backend owns the PayWay SDK and the credentials — this screen only
 * talks to YOUR server, never to PayWay directly, and never signs anything.
 *
 * See Chapter 5 — WebView Implementation and Chapter 8 — Deep Linking for
 * full documentation.
 *
 * Dependencies: webview_flutter ^4.x, url_launcher ^6.x
 */

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Result reported back to the hosting app.
enum PaymentResult { approved, failed, unknown }

/// Fallback when the ABA Pay app is not installed (store page or guidance).
const String abaPayFallbackUrl = 'https://play.google.com/store/apps/details?id=com.ababank.application';

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key, required this.checkoutUrl, required this.transactionId});

  /// Checkout URL (or hosted-form HTML wrapper) produced by YOUR backend.
  final String checkoutUrl;
  final String transactionId;

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  late final WebViewController _controller;
  bool _settled = false;

  // Configure these URLs for your environment (same constants as the
  // Android/iOS examples — keep them server-side configurable in production).
  static const String backendStatusUrl = 'https://your-api.com/api/checkout/status';
  static const String returnUrlPrefix = 'https://your-website.com/payment-result';

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            // The return-URL hop is UX only — it proves nothing on its own.
            // Always confirm with your backend before fulfilling.
            if (request.url.startsWith(returnUrlPrefix)) {
              _verifyAndFinish();
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.checkoutUrl));
  }

  Future<void> _verifyAndFinish() async {
    if (_settled) return;
    _settled = true;
    final result = await _fetchVerifiedStatus();
    if (!mounted) return;
    Navigator.of(context).pop(result);
  }

  /// Ask YOUR backend for the verified status (backend checks PayWay
  /// server-side). Never trust the redirect parameters alone.
  Future<PaymentResult> _fetchVerifiedStatus() async {
    // Wire this to your real status endpoint, e.g. with package:http:
    //   final res = await http.get(Uri.parse('$backendStatusUrl?tran_id=${widget.transactionId}'));
    //   final body = jsonDecode(res.body) as Map<String, dynamic>;
    //   return switch (body['payment_status']) { 'APPROVED' => PaymentResult.approved, ... };
    return PaymentResult.unknown;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ABA PayWay')),
      body: WebViewWidget(controller: _controller),
    );
  }
}

/// Launches the ABA Pay app via a deeplink URL returned by your backend's
/// `abapay_khqr_deeplink` purchase. Falls back to a web URL when the app is
/// not installed. See Chapter 8 for return-deeplink configuration
/// (iOS universal links / Android app links back into YOUR app).
Future<bool> launchAbapayDeeplink(String deeplink, {String fallbackUrl = abaPayFallbackUrl}) async {
  final link = Uri.parse(deeplink);
  if (await canLaunchUrl(link)) {
    return launchUrl(link, mode: LaunchMode.externalApplication);
  }
  // ABA Pay not installed — send the customer to a fallback (store page or
  // your own guidance screen). The checkout itself can still be paid on the web.
  return launchUrl(Uri.parse(fallbackUrl), mode: LaunchMode.externalApplication);
}
