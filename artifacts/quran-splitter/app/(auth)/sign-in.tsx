import { useSignIn } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import { type Href, Link, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AboutModal } from "@/components/AboutModal";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/lib/i18n";

export default function SignInScreen() {
  const c = useColors();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [showAbout, setShowAbout] = React.useState(false);

  const finalizeSession = async () => {
    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) return;
        const url = decorateUrl("/");
        if (Platform.OS === "web" && url.startsWith("http") && typeof window !== "undefined") {
          window.location.href = url;
        } else {
          router.replace(url as Href);
        }
      },
    });
  };

  const handleSubmit = async () => {
    setFormError("");
    const { error } = await signIn.password({ emailAddress, password });
    if (error) return;

    if (signIn.status === "complete") {
      await finalizeSession();
    } else if (signIn.status === "needs_client_trust") {
      // Clerk wants to verify this new device/browser. Send an email code so the
      // user can confirm and complete sign-in (without this, the button no-ops).
      const emailCodeFactor = signIn.supportedSecondFactors?.find(
        (factor) => factor.strategy === "email_code",
      );
      if (emailCodeFactor) await signIn.mfa.sendEmailCode();
    } else {
      // Any other non-complete status would otherwise leave the button dead —
      // surface a retry message instead of silently doing nothing.
      setFormError(t("tryAgain"));
    }
  };

  const handleVerify = async () => {
    await signIn.mfa.verifyEmailCode({ code });
    if (signIn.status === "complete") {
      await finalizeSession();
    }
  };

  const busy = fetchStatus === "fetching";

  if (signIn.status === "needs_client_trust") {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: c.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.brand, { backgroundColor: c.primary }]}>
            <Ionicons name="mail-open" size={32} color={c.primaryForeground} />
          </View>
          <Text style={[styles.title, { color: c.primary }]}>{t("confirmEmail")}</Text>
          <Text style={[styles.subtitle, { color: c.mutedForeground }]}>{t("enterCode")}</Text>

          <TextInput
            style={[styles.input, styles.codeInput, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]}
            value={code}
            placeholder="------"
            placeholderTextColor={c.mutedForeground}
            onChangeText={setCode}
            keyboardType="number-pad"
          />
          {errors.fields.code && (
            <Text style={[styles.error, { color: c.destructive }]}>{errors.fields.code.message}</Text>
          )}

          <Pressable
            onPress={handleVerify}
            disabled={!code || busy}
            style={[styles.primaryBtn, { backgroundColor: c.primary, opacity: !code || busy ? 0.6 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color={c.primaryForeground} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: c.primaryForeground }]}>{t("confirm")}</Text>
            )}
          </Pressable>

          <Pressable onPress={() => signIn.mfa.sendEmailCode()} style={styles.resend}>
            <Text style={[styles.link, { color: c.primary }]}>{t("resendCode")}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.langRow, { flexDirection: isRTL ? "row" : "row-reverse" }]}>
          <LanguageSwitcher />
          <Pressable
            onPress={() => setShowAbout(true)}
            hitSlop={8}
            style={[styles.aboutBtn, { borderColor: c.border }]}
            accessibilityLabel={t("aboutTitle")}
          >
            <Ionicons name="information-circle-outline" size={18} color={c.mutedForeground} />
            <Text style={[styles.aboutBtnText, { color: c.mutedForeground }]}>{t("aboutTitle")}</Text>
          </Pressable>
        </View>
        <View style={[styles.brand, { backgroundColor: c.primary }]}>
          <Ionicons name="book" size={34} color={c.primaryForeground} />
        </View>
        <Text style={[styles.title, { color: c.primary }]}>{t("welcomeBack")}</Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
          {t("signInSubtitle")}
        </Text>

        <Text style={[styles.label, { color: c.foreground, textAlign: isRTL ? "right" : "left" }]}>
          {t("email")}
        </Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: c.card, borderColor: c.border, color: c.foreground, textAlign: isRTL ? "right" : "left" },
          ]}
          autoCapitalize="none"
          value={emailAddress}
          placeholder="example@email.com"
          placeholderTextColor={c.mutedForeground}
          onChangeText={setEmailAddress}
          keyboardType="email-address"
        />
        {errors.fields.identifier && (
          <Text style={[styles.error, { color: c.destructive }]}>
            {errors.fields.identifier.message}
          </Text>
        )}

        <Text style={[styles.label, { color: c.foreground, textAlign: isRTL ? "right" : "left" }]}>
          {t("password")}
        </Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: c.card, borderColor: c.border, color: c.foreground, textAlign: isRTL ? "right" : "left" },
          ]}
          value={password}
          placeholder="••••••••"
          placeholderTextColor={c.mutedForeground}
          secureTextEntry
          onChangeText={setPassword}
        />
        {errors.fields.password && (
          <Text style={[styles.error, { color: c.destructive }]}>
            {errors.fields.password.message}
          </Text>
        )}
        {!!formError && (
          <Text style={[styles.error, { color: c.destructive }]}>{formError}</Text>
        )}
        <Pressable
          onPress={handleSubmit}
          disabled={!emailAddress || !password || busy}
          style={[
            styles.primaryBtn,
            { backgroundColor: c.primary, opacity: !emailAddress || !password || busy ? 0.6 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={c.primaryForeground} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: c.primaryForeground }]}>{t("signIn")}</Text>
          )}
        </Pressable>

        <View style={[styles.linkRow, { flexDirection: isRTL ? "row" : "row-reverse" }]}>
          <Link href={"/sign-up" as Href}>
            <Text style={[styles.link, { color: c.primary }]}>{t("createAccount")}</Text>
          </Link>
          <Text style={{ color: c.mutedForeground }}>{t("noAccount")}</Text>
        </View>
      </ScrollView>
      <AboutModal visible={showAbout} onClose={() => setShowAbout(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, alignItems: "stretch" },
  langRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  aboutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  aboutBtnText: { fontSize: 13, fontWeight: "600" },
  brand: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontSize: 26, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: 6, marginBottom: 28 },
  label: { fontSize: 14, fontWeight: "700", textAlign: "right", marginBottom: 8, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    textAlign: "right",
  },
  codeInput: { textAlign: "center", letterSpacing: 8, fontSize: 24 },
  error: { fontSize: 13, textAlign: "right", marginTop: 6 },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  primaryBtnText: { fontSize: 17, fontWeight: "700" },
  resend: { alignItems: "center", marginTop: 20 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 20 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  or: { fontSize: 13 },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
  },
  googleText: { fontSize: 16, fontWeight: "600" },
  linkRow: { flexDirection: "row", justifyContent: "center", marginTop: 26 },
  link: { fontSize: 15, fontWeight: "700" },
});
