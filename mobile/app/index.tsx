import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "~/lib/supabase";
import { deviceTranslate } from "~/lib/i18n";
import { typicalMonth } from "@/lib/analytics/typical-month";
import { moneyFormatter } from "@/lib/currency";
import { intlLocale, negotiateLocale } from "@/lib/i18n/catalogue";
import { getLocales } from "expo-localization";

/**
 * Premier écran, et surtout la preuve que le partage tient.
 *
 * Il consomme les trois choses que le mobile devait pouvoir réutiliser sans réécriture : une
 * fonction Postgres du web appelée directement, un calcul métier pur importé de ../lib, et le
 * catalogue de traduction. Si cet écran s'affiche, le reste du portage n'est plus qu'un travail
 * d'interface.
 */
export default function Home() {
  const t = deviceTranslate();
  const locale = intlLocale(negotiateLocale(getLocales()[0]?.languageTag));
  const { money, range } = moneyFormatter(locale);

  const [state, setState] = useState<{ loading: boolean; error?: string; spent?: number; currency?: string; typical?: ReturnType<typeof typicalMonth> }>({ loading: true });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return setState({ loading: false, error: t("login.tagline") });

      const now = new Date();
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const [{ data: summary, error }, { data: toDate }] = await Promise.all([
        supabase.rpc("finance_monthly_summary", { p_month: `${month}-01`, p_currency: null }),
        supabase.rpc("finance_month_to_date", { p_month: `${month}-01`, p_day: now.getUTCDate(), p_months: 6 })
      ]);
      if (error) return setState({ loading: false, error: error.message });

      const { data: currency } = await supabase.rpc("finance_base_currency");
      setState({
        loading: false,
        spent: Number(summary?.[0]?.total_spent ?? 0),
        currency: (currency as string | null) ?? "EUR",
        // Exactement le même calcul que le tableau de bord web, importé et non réécrit.
        typical: typicalMonth((toDate ?? []).map((row) => ({ month: row.month.slice(0, 7), total: Number(row.total) })), month)
      });
    })().catch((failure: unknown) => setState({ loading: false, error: failure instanceof Error ? failure.message : "?" }));
  }, []);

  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>clair.</Text>

      {state.loading && <ActivityIndicator style={styles.loader} />}
      {state.error && <Text style={styles.error}>{state.error}</Text>}

      {state.spent !== undefined && <View style={styles.card}>
        <Text style={styles.label}>{t("dashboard.spentThisMonth")}</Text>
        <Text style={styles.value}>{money(state.spent, state.currency!)}</Text>
        <Text style={styles.trend}>{t("dashboard.excludingIncome")}</Text>
      </View>}

      {state.typical && <View style={styles.card}>
        <Text style={styles.label}>{t("dashboard.vsTypicalMonth")}</Text>
        <Text style={styles.value}>{state.typical.changePercent! > 0 ? "+" : ""}{state.typical.changePercent} %</Text>
        <Text style={styles.trend}>{t({ ordinaire: "dashboard.ordinary", "au-dessus": "dashboard.aboveAll", "en-dessous": "dashboard.belowAll" }[state.typical.position])}
          {" · "}{range(state.typical.lowest, state.typical.highest, state.currency!)}</Text>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

// Les couleurs reprennent les jetons du web. Elles seront extraites quand un second écran les
// réclamera : les partager avant d'en avoir deux usages serait deviner ce dont ils ont besoin.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f6f2" },
  content: { padding: 20, gap: 14 },
  brand: { fontSize: 22, fontWeight: "700", letterSpacing: -0.8, color: "#17211b", marginBottom: 6 },
  loader: { marginTop: 40 },
  error: { color: "#a3362b", fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: "#dfe6e1", padding: 18, gap: 4 },
  label: { color: "#68736c", fontSize: 12, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  value: { color: "#17211b", fontSize: 30, fontWeight: "700", letterSpacing: -1 },
  trend: { color: "#68736c", fontSize: 13, lineHeight: 18 }
});
