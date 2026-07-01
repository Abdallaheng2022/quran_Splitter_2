import { useSignUp } from "@clerk/expo";
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

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useColors } from "@/hooks/useColors";
import { useI18n } from "@/lib/i18n";

export default function SignUpScreen() {
  const c = useColors();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");

  const busy = fetchStatus === "fetching";

  const handleSubmit = async () => {
    const { error } = await signUp.password({ emailAddress, password });
    if (error) return;
    await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === "complete") {
      await signUp.finalize({
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
    }
  };

  const awaitingCode =
    signUp.status === "missing_requirements" &&
    signUp.unverifiedFields.includes("email_address") &&
    signUp.missingFields.length === 0;

  if (awaitingCode) {
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
          <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
            {t("enterCode")}
          </Text>

          <TextInput
            style={[styles.input, styles.codeInput, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]}
            value={code}
            placeholder="------"
            placeholderTextColor={c.mutedForeground}
            onChangeText={setCode}
            keyboardType="number-pad"
          />
          {errors.fields.code && (
            <Text style={[styles.error, { color: c.destructive }]}>
              {errors.fields.code.message}
            </Text>
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

          <Pressable onPress={() => signUp.verifications.sendEmailCode()} style={styles.resend}>
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
        </View>
        <View style={[styles.brand, { backgroundColor: c.primary }]}>
          <Ionicons name="book" size={34} color={c.primaryForeground} />
        </View>
        <Text style={[styles.title, { color: c.primary }]}>{t("createAccountTitle")}</Text>
        <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
          {t("signUpSubtitle")}
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
        {errors.fields.emailAddress && (
          <Text style={[styles.error, { color: c.destructive }]}>
            {errors.fields.emailAddress.message}
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
            <Text style={[styles.primaryBtnText, { color: c.primaryForeground }]}>{t("createAccountBtn")}</Text>
          )}
        </Pressable>

        <View style={[styles.linkRow, { flexDirection: isRTL ? "row" : "row-reverse" }]}>
          <Link href={"/sign-in" as Href}>
            <Text style={[styles.link, { color: c.primary }]}>{t("signInLink")}</Text>
          </Link>
          <Text style={{ color: c.mutedForeground }}>{t("haveAccount")}</Text>
        </View>

        {/* Required for sign-up: Clerk bot protection */}
        <View nativeID="clerk-captcha" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, alignItems: "stretch" },
  langRow: { flexDirection: "row", marginBottom: 8 },
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
  resend: { alignItems: "center", marginTop: 20 },
});
