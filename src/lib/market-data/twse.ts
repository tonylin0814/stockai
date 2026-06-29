import { missingQuote, nowIso, toNumber } from "@/lib/market-data/common";
import type { Quote } from "@/lib/market-data/types";

const TWSE_TAIEX_URL = "https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK";

function parseTwseNumber(value: unknown) {
  return toNumber(String(value ?? "").replace(/,/g, ""));
}

export class TwseProvider {
  async getTaiex(): Promise<Quote> {
    try {
      const response = await fetch(TWSE_TAIEX_URL, { next: { revalidate: 300 } });

      if (!response.ok) {
        return missingQuote("TAIEX", "TW", "TWSE OpenAPI");
      }

      const data = (await response.json()) as Array<Record<string, unknown>>;
      const latest = data[data.length - 1];
      const previous = data[data.length - 2];

      if (!latest) {
        return missingQuote("TAIEX", "TW", "TWSE OpenAPI");
      }

      const close =
        parseTwseNumber(latest["發行量加權股價指數"]) ||
        parseTwseNumber(latest["TAIEX"]) ||
        parseTwseNumber(Object.values(latest)[1]);
      const previousClose = previous
        ? parseTwseNumber(previous["發行量加權股價指數"]) ||
          parseTwseNumber(previous["TAIEX"]) ||
          parseTwseNumber(Object.values(previous)[1])
        : 0;
      const change = previousClose ? close - previousClose : 0;
      const sourceUpdatedAt = nowIso();

      if (!close) {
        return missingQuote("TAIEX", "TW", "TWSE OpenAPI");
      }

      return {
        symbol: "TAIEX",
        market: "TW",
        price: close,
        change,
        changePct: previousClose ? (change / previousClose) * 100 : 0,
        source: "TWSE OpenAPI",
        qualityState: "delayed",
        sourceUpdatedAt
      };
    } catch {
      return missingQuote("TAIEX", "TW", "TWSE OpenAPI");
    }
  }
}
