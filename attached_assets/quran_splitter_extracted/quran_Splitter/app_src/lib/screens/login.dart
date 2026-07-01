// login.dart — شاشة الدخول/التسجيل.
import 'package:flutter/material.dart';
import '../api.dart';

class LoginScreen extends StatefulWidget {
  final Api api;
  final VoidCallback onLoggedIn;
  const LoginScreen({super.key, required this.api, required this.onLoggedIn});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  late final _server = TextEditingController(text: widget.api.baseUrl);
  bool _busy = false;
  String? _msg;
  bool _registerMode = false;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _msg = null;
    });
    await widget.api.setBaseUrl(_server.text.trim());
    final email = _email.text.trim();
    final pass = _pass.text;

    if (_registerMode) {
      final r = await widget.api.register(email, pass);
      if (!(r.ok && r.data['ok'] == true)) {
        setState(() {
          _busy = false;
          _msg = r.data['error']?.toString() ?? 'تعذّر التسجيل.';
        });
        return;
      }
    }
    final r = await widget.api.login(email, pass);
    setState(() => _busy = false);
    if (r.ok && r.data['ok'] == true) {
      widget.onLoggedIn();
    } else {
      setState(() => _msg = r.data['error']?.toString() ?? 'تعذّر الدخول.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.menu_book_rounded, size: 64, color: Color(0xFF1E6F5C)),
                const SizedBox(height: 8),
                Text('مُقسّم التلاوة',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 24),
                TextField(
                  controller: _server,
                  decoration: const InputDecoration(
                    labelText: 'عنوان السيرفر',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.dns),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'البريد الإلكتروني',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.email),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _pass,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'كلمة المرور',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.lock),
                  ),
                ),
                if (_msg != null) ...[
                  const SizedBox(height: 12),
                  Text(_msg!, style: const TextStyle(color: Colors.red)),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(
                          height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(_registerMode ? 'إنشاء حساب ودخول' : 'دخول'),
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() => _registerMode = !_registerMode),
                  child: Text(_registerMode
                      ? 'لديّ حساب بالفعل — دخول'
                      : 'حساب جديد؟ سجّل الآن'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
