import { AnalysisTabs } from "@/components/analysis-tabs";

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <AnalysisTabs />
      {children}
    </div>
  );
}
