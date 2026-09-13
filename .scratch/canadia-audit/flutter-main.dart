import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Sample Code',
      theme: ThemeData(primarySwatch: Colors.blue),
      home: const PaymentScreen(),
    );
  }
}

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  // Mock payment gateway responses
  final String deepLinkUrl = 'https://pay-uat.canadiabank.com/AAAAAAAA';
  final String webviewUrl =
      'https://pay-uat.canadiabank.com/payment-gateway/AAAAAAAA';

  Future<void> _launchDeepLink() async {
    final Uri url = Uri.parse(deepLinkUrl);
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not launch payment app')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Flutter Sample Code')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: Card(
                color: Colors.white,
                child: ListTile(
                  contentPadding: EdgeInsets.only(left: 12),
                  leading: Image.asset(
                    "assets/images/khqr_logo.png",
                    fit: BoxFit.contain,
                    height: 50,
                    width: 50,
                  ),
                  title: Text("Canadia KHQR"),
                  titleTextStyle: theme.textTheme.titleMedium,
                  subtitle: Text("Scan and Pay with any bank app"),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) =>
                            WebViewPaymentScreen(url: webviewUrl),
                      ),
                    );
                  },
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(8.0),
              child: Card(
                color: Colors.white,
                child: ListTile(
                  contentPadding: EdgeInsets.only(left: 12),
                  leading: Image.asset(
                    "assets/images/canadia_bank_logo.png",
                    fit: BoxFit.contain,
                    height: 50,
                    width: 50,
                  ),
                  title: Text("Canadia Bank App"),
                  titleTextStyle: theme.textTheme.titleMedium,
                  subtitle: Text("Pay with Canadia Bank App"),
                  onTap: _launchDeepLink,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class WebViewPaymentScreen extends StatefulWidget {
  final String url;

  const WebViewPaymentScreen({Key? key, required this.url}) : super(key: key);

  @override
  State<WebViewPaymentScreen> createState() => _WebViewPaymentScreenState();
}

class _WebViewPaymentScreenState extends State<WebViewPaymentScreen> {
  late WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Canadia KHQR Payment')),
      body: WebViewWidget(controller: _controller),
    );
  }
}
