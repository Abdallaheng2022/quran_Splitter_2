// paywall.dart — شاشة الاشتراك (Google Play Billing).
import 'package:flutter/material.dart';
import '../api.dart';
import '../billing.dart';

class PaywallScreen extends StatefulWidget {
  final Api api;
  final String? reason;
  const PaywallScreen({super.key, required this.api, this.reason});

  @override
  State<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends State<PaywallScreen> {
  late final BillingService _billing;
  bool _busy = false;
  bool _ready = false;
  String? _msg;

  @override
  void initState() {
    super.initState();
    _billing = BillingService(widget.api);
    _billing.onError = (m) => setState(() {
          _busy = false;
          _msg = m;
        });
    _billing.onBusy = (b) => setState(() => _busy = b);
    _billing.onPurchaseSuccess = () {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تم تفعيل اشتراكك. شكرًا!')));
      Navigator.of(context).pop(true);
    };
    _init();
  }

  Future<void> _init() async {
    await _billing.init();
    if (mounted) setState(() => _ready = _billing.product != null);
  }

  @override
  void dispose() {
    _billing.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final price = _billing.priceLabel;
    return Scaffold(
      appBar: AppBar(title: const Text('المستوى المدفوع')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          if (widget.reason != null)
            Card(
              color: const Color(0xFFFFF4E5),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(widget.reason!),
              ),
            ),
          const SizedBox(height: 16),
          const Icon(Icons.workspace_premium, size: 64, color: Color(0xFFB8860B)),
          const SizedBox(height: 16),
          Text('اشتراك سنوي',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          if (_ready)
            Text(price,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 24),
          ..._benefits().map((b) => ListTile(
                leading: const Icon(Icons.check_circle, color: Color(0xFF1E6F5C)),
                title: Text(b),
                dense: true,
              )),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: (!_ready || _busy) ? null : _billing.subscribe,
            child: _busy
                ? const SizedBox(
                    height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('اشترك الآن'),
          ),
          TextButton(
            onPressed: _busy ? null : _billing.restore,
            child: const Text('استعادة اشتراك سابق'),
          ),
          if (_msg != null) ...[
            const SizedBox(height: 12),
            Text(_msg!, style: const TextStyle(color: Colors.red)),
          ],
          if (!_ready && _msg == null)
            const Padding(
              padding: EdgeInsets.only(top: 16),
              child: Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }

  List<String> _benefits() => const [
        'المحاذاة بالمرجع — دقّة عالية للتلاوات المتّصلة',
        'المدى الكامل (المصحف كله) بلا حدود قصيرة',
        'عدد عمليات يومي أكبر بكثير',
        'أولوية في المعالجة',
      ];
}
