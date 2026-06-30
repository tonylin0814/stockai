import type { MacroDataPoint } from "@/lib/market-data/types";

export class FredProvider {
  private apiKey = process.env.FRED_API_KEY;

  async getMacro(seriesId: string): Promise<MacroDataPoint[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const params = new URLSearchParams({
        series_id: seriesId,
        api_key: this.apiKey,
        file_type: "json",
        sort_order: "desc",
        limit: "10"
      });
      const response = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?${params}`,
        { next: { revalidate: 21600 } }
      );

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as {
        observations?: Array<{ date?: string; value?: string }>;
      };

      return (data.observations ?? [])
        .map((point) => ({
          date: point.date ?? "",
          value: Number(point.value)
        }))
        .filter((point) => point.date && Number.isFinite(point.value));
    } catch {
      return [];
    }
  }
}
