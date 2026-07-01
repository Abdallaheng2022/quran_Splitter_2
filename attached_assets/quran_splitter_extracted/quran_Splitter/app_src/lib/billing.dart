// billing.dart — اشتراك Google Play عبر in_app_purchase.
//
// التدفّق:
//   1) نستعلم عن تفاصيل المنتج (الاشتراك) من جوجل.
//   2) المستخدم يضغط «اشترك» → buyNonConsumable.
//   3) عند نجاح الشراء نأخذ purchaseToken ونرسله للسيرفر (/api/play/verify)
//      ليتحقّق منه عبر Google Play Developer API (لا نثق بالعميل).
//   4) بعد تأكيد السيرفر نُكمل الشراء (completePurchase).
//
// مهم: الفوترة لا تعمل إلا لتطبيق مرفوع على Play Console (ولو اختبار داخلي)
// وموقّع بمفتاح اللعب، ومُعرّف فيه منتج اشتراك بنفس kSubscriptionId.
import 'dart:async';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'api.dart';

// عدّله ليطابق معرّف منتج الاشتراك في Play Console (وأيضًا PLAY_SUBSCRIPTION_IDS بالسيرفر).
const String kSubscriptionId = 'quran_pro_yearly';

class BillingService {
  final Api api;
  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _sub;

  bool available = false;
  ProductDetails? product;

  // ردود نداء للواجهة
  void Function(String message)? onError;
  void Function()? onPurchaseSuccess;
  void Function(bool busy)? onBusy;

  BillingService(this.api);

  Future<void> init() async {
    available = await _iap.isAvailable();
    if (!available) {
      onError?.call('متجر Google Play غير متاح على هذا الجهاز.');
      return;
    }
    _sub = _iap.purchaseStream.listen(_onPurchases, onError: (e) {
      onError?.call('خطأ في الشراء: $e');
    });
    final resp = await _iap.queryProductDetails({kSubscriptionId});
    if (resp.productDetails.isNotEmpty) {
      product = resp.productDetails.first;
    } else {
      onError?.call('لم يُعثر على منتج الاشتراك "$kSubscriptionId" في Play Console.');
    }
  }

  String get priceLabel => product?.price ?? '—';

  /// يبدأ تدفّق الشراء.
  Future<void> subscribe() async {
    if (product == null) {
      onError?.call('منتج الاشتراك غير جاهز.');
      return;
    }
    onBusy?.call(true);
    final param = PurchaseParam(productDetails: product!);
    // الاشتراكات تُشترى عبر buyNonConsumable في in_app_purchase.
    await _iap.buyNonConsumable(purchaseParam: param);
  }

  Future<void> _onPurchases(List<PurchaseDetails> purchases) async {
    for (final p in purchases) {
      if (p.status == PurchaseStatus.pending) {
        continue;
      }
      if (p.status == PurchaseStatus.error) {
        onBusy?.call(false);
        onError?.call(p.error?.message ?? 'فشل الشراء.');
      } else if (p.status == PurchaseStatus.purchased ||
          p.status == PurchaseStatus.restored) {
        // purchaseToken على أندرويد = serverVerificationData
        final purchaseToken = p.verificationData.serverVerificationData;
        final res = await api.verifyPlayPurchase(purchaseToken, kSubscriptionId);
        if (res.ok && res.data['ok'] == true) {
          onBusy?.call(false);
          onPurchaseSuccess?.call();
        } else {
          onBusy?.call(false);
          onError?.call(res.data['error']?.toString() ??
              'تعذّر التحقّق من الاشتراك على السيرفر.');
        }
      }
      // أكمل الشراء دائمًا (مطلوب وإلا يُرجَّع تلقائيًا)
      if (p.pendingCompletePurchase) {
        await _iap.completePurchase(p);
      }
    }
  }

  /// استعادة المشتريات السابقة (لو غيّر الجهاز مثلًا).
  Future<void> restore() async {
    await _iap.restorePurchases();
  }

  void dispose() {
    _sub?.cancel();
  }
}
