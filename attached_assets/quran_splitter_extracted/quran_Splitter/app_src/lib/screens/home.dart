// home.dart — الشاشة الرئيسية: المستوى، اختيار الصوت، التقسيم والتحميل.
import 'dart:io';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import '../api.dart';
import 'login.dart';
import 'paywall.dart';

class HomeScreen extends StatefulWidget {
  final Api api;
  const HomeScreen({super.key, required this.api});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? _me; // الاستحقاق
  String? _fileName;
  Uint8List? _fileBytes;

  final _range = TextEditingController(text: 'surah:36');
  String _level = 'ayah';
  String _method = 'auto';

  bool _busy = false;
  String? _status;
  String? _savedPath;

  final _levels = const {
    'ayah': 'آيات',
    'rub': 'أرباع',
    'hizb': 'أحزاب',
    'juz': 'أجزاء',
    'page': 'صفحات',
  };

  @override
  void initState() {
    super.initState();
    _refreshMe();
  }

  Future<void> _refreshMe() async {
    final r = await widget.api.me();
    if (r.ok && r.data['ok'] == true && mounted) {
      setState(() => _me = r.data);
    }
  }

  bool get _isPaid => _me?['tier'] == 'paid';

  Future<void> _pickAudio() async {
    final res = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'opus'],
      withData: true,
    );
    if (res != null && res.files.isNotEmpty) {
      final f = res.files.first;
      setState(() {
        _fileName = f.name;
        _fileBytes = f.bytes;
        _savedPath = null;
        _status = null;
      });
    }
  }

  Future<void> _run() async {
    if (_fileBytes == null) {
      setState(() => _status = 'اختر ملف صوت أولًا.');
      return;
    }
    setState(() {
      _busy = true;
      _status = 'جارٍ التحليل والتقسيم...';
      _savedPath = null;
    });

    final analyze = await widget.api.analyze(
      audio: _fileBytes!,
      name: _fileName ?? 'audio.mp3',
      range: _range.text.trim().isEmpty ? 'all' : _range.text.trim(),
      level: _level,
      method: _method == 'auto' ? null : _method,
    );

    if (!analyze.ok) {
      setState(() => _busy = false);
      _handleError(analyze);
      return;
    }

    // لو خُفّضت الطريقة للمستوى المجاني، أبلغ المستخدم
    if (analyze.data['downgraded'] == true && analyze.data['upsell'] != null) {
      _snack(analyze.data['upsell'].toString());
    }

    final sessionToken = analyze.data['token']?.toString();
    final bounds = analyze.data['bounds'] as List?;
    if (sessionToken == null || bounds == null) {
      setState(() {
        _busy = false;
        _status = 'ردّ غير متوقّع من السيرفر.';
      });
      return;
    }

    setState(() => _status = 'جارٍ تجهيز الملف...');
    final save = await widget.api.save(sessionToken, bounds);
    if (!save.ok || save.bytes == null) {
      setState(() => _busy = false);
      _handleError(save);
      return;
    }

    // احفظ الـ zip على الجهاز
    final dir = await getExternalStorageDirectory() ??
        await getApplicationDocumentsDirectory();
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final path = '${dir.path}/quran_split_$stamp.zip';
    await File(path).writeAsBytes(save.bytes!);

    await _refreshMe();
    setState(() {
      _busy = false;
      _savedPath = path;
      _status = 'تمّ! حُفظ الملف بنجاح.';
    });
  }

  void _handleError(ApiResult r) {
    final needSub = r.data['need_subscription'] == true;
    final msg = r.data['error']?.toString() ?? 'حدث خطأ (${r.status}).';
    if (needSub || r.status == 402) {
      _openPaywall(reason: msg);
    } else {
      setState(() => _status = msg);
    }
  }

  void _openPaywall({String? reason}) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PaywallScreen(api: widget.api, reason: reason),
    )).then((_) => _refreshMe());
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _logout() async {
    await widget.api.logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => LoginScreen(
          api: widget.api,
          onLoggedIn: () => Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => HomeScreen(api: widget.api)),
          ),
        ),
      ),
      (r) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final jobsLeft = _me?['usage']?['jobs_remaining'];
    return Scaffold(
      appBar: AppBar(
        title: const Text('مُقسّم التلاوة'),
        actions: [
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _tierCard(jobsLeft),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _busy ? null : _pickAudio,
            icon: const Icon(Icons.audiotrack),
            label: Text(_fileName ?? 'اختر ملف الصوت'),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _range,
            decoration: const InputDecoration(
              labelText: 'المدى (مثل surah:36 أو juz:30 أو 2:1-2:286 أو all)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _level,
            decoration: const InputDecoration(
                labelText: 'مستوى التقسيم', border: OutlineInputBorder()),
            items: _levels.entries
                .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                .toList(),
            onChanged: (v) => setState(() => _level = v ?? 'ayah'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _method,
            decoration: const InputDecoration(
                labelText: 'الطريقة', border: OutlineInputBorder()),
            items: [
              const DropdownMenuItem(value: 'auto', child: Text('تلقائي')),
              const DropdownMenuItem(value: 'silence', child: Text('السكتات (سريع)')),
              DropdownMenuItem(
                value: 'refdtw',
                enabled: _isPaid,
                child: Text('المحاذاة بالمرجع (دقيق)${_isPaid ? '' : ' — مدفوع'}'),
              ),
            ],
            onChanged: (v) {
              if (v == 'refdtw' && !_isPaid) {
                _openPaywall(reason: 'الطريقة الدقيقة متاحة في المستوى المدفوع.');
                return;
              }
              setState(() => _method = v ?? 'auto');
            },
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _busy ? null : _run,
            icon: _busy
                ? const SizedBox(
                    height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.content_cut),
            label: Text(_busy ? 'جارٍ المعالجة...' : 'قسّم وحمّل'),
          ),
          if (_status != null) ...[
            const SizedBox(height: 16),
            Text(_status!, style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
          if (_savedPath != null) ...[
            const SizedBox(height: 8),
            Card(
              color: const Color(0xFFE7F3EF),
              child: ListTile(
                leading: const Icon(Icons.folder_zip, color: Color(0xFF1E6F5C)),
                title: const Text('ملف المقاطع (zip)'),
                subtitle: Text(_savedPath!, maxLines: 2, overflow: TextOverflow.ellipsis),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _tierCard(dynamic jobsLeft) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(_isPaid ? Icons.workspace_premium : Icons.lock_open,
                color: _isPaid ? const Color(0xFFB8860B) : Colors.grey),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_isPaid ? 'المستوى المدفوع' : 'المستوى المجاني',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  if (jobsLeft != null)
                    Text('عمليات متبقية اليوم: $jobsLeft',
                        style: const TextStyle(fontSize: 12, color: Colors.black54)),
                ],
              ),
            ),
            if (!_isPaid)
              FilledButton(
                onPressed: () => _openPaywall(),
                child: const Text('ترقية'),
              ),
          ],
        ),
      ),
    );
  }
}
