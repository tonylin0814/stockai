export class FrankfurterProvider {
  async getFXRate(base: string, quote: string): Promise<number> {
    try {
      const params = new URLSearchParams({ from: base, to: quote });
      const response = await fetch(`https://api.frankfurter.app/latest?${params}`, {
        cache: "no-store"
      });

      if (response.ok) {
        const data = (await response.json()) as {
          rates?: Record<string, number>;
        };
        const rate = Number(data.rates?.[quote]) || 0;

        if (rate) {
          return rate;
        }
      }

      const fallbackResponse = await fetch(
        `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`,
        { cache: "no-store" }
      );

      if (!fallbackResponse.ok) {
        console.warn(`FX rate unavailable for ${base}/${quote}: fallback request failed.`);
        return 0;
      }

      const fallbackData = (await fallbackResponse.json()) as {
        rate?: number;
      };

      const fallbackRate = Number(fallbackData.rate) || 0;

      if (!fallbackRate) {
        console.warn(`FX rate unavailable for ${base}/${quote}: both providers returned 0.`);
      }

      return fallbackRate;
    } catch {
      console.warn(`FX rate unavailable for ${base}/${quote}: request threw.`);
      return 0;
    }
  }
}
