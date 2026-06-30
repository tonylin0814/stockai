import { missingQuote, nowIso, toNumber } from "@/lib/market-data/common";
import type { Quote } from "@/lib/market-data/types";

const TWSE_TAIEX_URL = "https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK";
const TWSE_STOCK_DAY_ALL_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
const TWSE_TAIEX_MIS_URL =
  "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0";

function parseTwseNumber(value: unknown) {
  return toNumber(String(value ?? "").replace(/,/g, ""));
}

function parseTwseDate(value: unknown) {
  const text = String(value ?? "");
  const match = text.match(/^(\d{3})(\d{2})(\d{2})$/);

  if (!match) {
    return nowIso();
  }

  const year = Number(match[1]) + 1911;
  return new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[3]))).toISOString();
}

export class TwseProvider {
  private async getTaiexFromMis(): Promise<Quote> {
    const response = await fetch(`${TWSE_TAIEX_MIS_URL}&_=${Date.now()}`, {
      headers: {
        accept: "application/json",
        referer: "https://mis.twse.com.tw/stock/index.jsp",
        "user-agent": "Mozilla/5.0"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return missingQuote("TAIEX", "TW", "TWSE MIS");
    }

    const data = (await response.json()) as {
      msgArray?: Array<Record<string, unknown>>;
    };
    const row = data.msgArray?.[0];

    if (!row) {
      return missingQuote("TAIEX", "TW", "TWSE MIS");
    }

    const price = parseTwseNumber(row.z);
    const previousClose = parseTwseNumber(row.y);

    if (!price) {
      return missingQuote("TAIEX", "TW", "TWSE MIS");
    }

    const sourceTime = parseTwseNumber(row.tlong);
    const sourceUpdatedAt = sourceTime ? new Date(sourceTime).toISOString() : parseTwseDate(row.d);
    const change = previousClose ? price - previousClose : 0;

    return {
      symbol: "TAIEX",
      market: "TW",
      price,
      change,
      changePct: previousClose ? (change / previousClose) * 100 : 0,
      dayHigh: parseTwseNumber(row.h) || undefined,
      dayLow: parseTwseNumber(row.l) || undefined,
      dayOpen: parseTwseNumber(row.o) || undefined,
      source: "TWSE MIS",
      qualityState: "delayed",
      sourceUpdatedAt
    };
  }

  async getTaiex(): Promise<Quote> {
    const liveQuote = await this.getTaiexFromMis().catch(() =>
      missingQuote("TAIEX", "TW", "TWSE MIS")
    );

    if (liveQuote.qualityState !== "missing") {
      return liveQuote;
    }

    try {
      const response = await fetch(TWSE_TAIEX_URL, { cache: "no-store" });

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

  async getStockQuote(symbol: string): Promise<Quote> {
    try {
      const response = await fetch(TWSE_STOCK_DAY_ALL_URL, { cache: "no-store" });

      if (!response.ok) {
        return missingQuote(symbol, "TW", "TWSE OpenAPI");
      }

      const data = (await response.json()) as Array<Record<string, unknown>>;
      const row = data.find((item) => String(item.Code ?? item["證券代號"] ?? "") === symbol);

      if (!row) {
        return missingQuote(symbol, "TW", "TWSE OpenAPI");
      }

      const price = parseTwseNumber(row.ClosingPrice ?? row["收盤價"]);

      if (!price) {
        return missingQuote(symbol, "TW", "TWSE OpenAPI");
      }

      const change = parseTwseNumber(row.Change ?? row["漲跌價差"]);
      const previousClose = price - change;

      return {
        symbol,
        market: "TW",
        price,
        change,
        changePct: previousClose ? (change / previousClose) * 100 : 0,
        volume: parseTwseNumber(row.TradeVolume ?? row["成交股數"]),
        source: "TWSE OpenAPI",
        qualityState: "delayed",
        sourceUpdatedAt: parseTwseDate(row.Date ?? row["日期"])
      };
    } catch {
      return missingQuote(symbol, "TW", "TWSE OpenAPI");
    }
  }
}
