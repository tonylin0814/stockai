export class FrankfurterProvider {
  async getFXRate(base: string, quote: string): Promise<number> {
    try {
      const params = new URLSearchParams({ from: base, to: quote });
      const response = await fetch(`https://api.frankfurter.app/latest?${params}`, {
        next: { revalidate: 300 }
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
        { next: { revalidate: 300 } }
      );

      if (!fallbackResponse.ok) {
        return 0;
      }

      const fallbackData = (await fallbackResponse.json()) as {
        rate?: number;
      };

      return Number(fallbackData.rate) || 0;
    } catch {
      return 0;
    }
  }
}
