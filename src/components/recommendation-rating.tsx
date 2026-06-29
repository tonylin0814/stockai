"use client";

import { useFormState, useFormStatus } from "react-dom";
import { rateRecommendation } from "@/app/actions";

const RATINGS = [
  { value: "useful", label: "有用" },
  { value: "not_useful", label: "沒用" },
  { value: "too_aggressive", label: "太積極" },
  { value: "too_conservative", label: "太保守" },
  { value: "too_early", label: "太早" }
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? "儲存中..." : "送出"}
    </button>
  );
}

export default function RecommendationRating({
  recommendationId,
  currentRating
}: {
  recommendationId: string;
  currentRating: string | null;
}) {
  const [state, action] = useFormState(rateRecommendation, null);

  if (state?.success) {
    return <p className="text-xs text-emerald-600">已送出回饋，謝謝！</p>;
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={recommendationId} />
      <span className="text-xs text-slate-500">評價：</span>
      {RATINGS.map((rating) => (
        <label key={rating.value} className="flex cursor-pointer items-center gap-1">
          <input
            type="radio"
            name="rating"
            value={rating.value}
            defaultChecked={rating.value === currentRating}
            className="h-3 w-3"
            required
          />
          <span className="text-xs">{rating.label}</span>
        </label>
      ))}
      <SubmitButton />
    </form>
  );
}
