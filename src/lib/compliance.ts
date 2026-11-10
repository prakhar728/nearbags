// Who may buy what (decided 2026-11-09, from Ondo Stocks eligibility: docs.ondo.finance/ondo-stocks/eligibility).
//
// Sanctioned (any product): Cuba, Iran, North Korea, Syria, Russia, Belarus, occupied Ukrainian regions → blocked.
// Ondo-prohibited (US, Canada, Afghanistan, Libya, Myanmar, Somalia, Sudan, South Sudan) → stock baskets blocked;
//   crypto-only baskets allowed.
// US persons living elsewhere → stock baskets need "I am not a US person".
// Ondo-restricted (EEA, UK, Switzerland, Singapore, Hong Kong, Malaysia, Brazil) → stock baskets need
//   "I am a professional / qualified investor under my local rules".
// Everyone → one-time risk disclosure before the first buy.
import { getAsset } from "@/lib/assets";

export const SANCTIONED = new Set(["CU", "IR", "KP", "SY", "RU", "BY"]);
// ISO 3166-2:UA subdivision codes: Crimea 43, Sevastopol 40, Donetsk 14, Luhansk 09, Kherson 65, Zaporizhzhia 23.
export const SANCTIONED_UA_REGIONS = new Set(["43", "40", "14", "09", "65", "23"]);
export const STOCKS_PROHIBITED = new Set(["US", "CA", "AF", "LY", "MM", "SO", "SS", "SD", "PR", "GU", "VI", "AS", "MP", "UM"]);
const EEA = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO"];
export const STOCKS_RESTRICTED = new Set([...EEA, "GB", "CH", "SG", "HK", "MY", "BR"]);

export type Attestation = "risk" | "not_us_person" | "professional";

export interface Eligibility {
  status: "ok" | "needs" | "blocked";
  needs: Attestation[];
  reason?: string;
  country: string | null;
}

export const hasStocks = (assetIds: string[]) => assetIds.some((id) => ["stock", "etf"].includes(getAsset(id).kind));

export function eligibility(p: { country: string | null; region: string | null; assetIds: string[]; attested: Partial<Record<Attestation, string>> }): Eligibility {
  const c = p.country?.toUpperCase() ?? null;
  const stocks = hasStocks(p.assetIds);
  if (c && (SANCTIONED.has(c) || (c === "UA" && p.region && SANCTIONED_UA_REGIONS.has(p.region)))) {
    return { status: "blocked", needs: [], reason: "nearbags isn't available in your region.", country: c };
  }
  if (stocks && c && STOCKS_PROHIBITED.has(c)) {
    return { status: "blocked", needs: [], reason: "Tokenized stocks aren't available in your country. Crypto-only baskets are.", country: c };
  }
  const needs: Attestation[] = [];
  if (!p.attested.risk) needs.push("risk");
  if (stocks && !p.attested.not_us_person) needs.push("not_us_person");
  if (stocks && c && STOCKS_RESTRICTED.has(c) && !p.attested.professional) needs.push("professional");
  return { status: needs.length ? "needs" : "ok", needs, country: c };
}

export const ATTESTATION_TEXT: Record<Attestation, string> = {
  risk:
    "I understand: tokenized stocks give price exposure only, with no shareholder rights; Ondo is the issuer and its risk is mine; prices can move off-hours and on weekends; backtests are history, not promises; I hold my own keys and nearbags can't recover lost funds.",
  not_us_person: "I am not a US person and I'm not buying for one.",
  professional: "I am a professional or qualified investor under the rules of the country I live in.",
};
