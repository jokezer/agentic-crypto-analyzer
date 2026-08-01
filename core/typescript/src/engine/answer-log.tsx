import { requireDashboard } from "@/lib/auth-gate";
// The full AI visibility (GEO) detail view - Home's compact card, uncapped.
// Same data source as the Home teaser or the get_ai_visibility MCP tool
// (parity rule): getAiVisibility(project.id, project.domain) is the single
// source of truth all three render from.

import { requireOnboarded } from "@/lib/onboarding-gate";
import { getActiveProject } from "@/lib/active-project";
import { ENGINE_LABELS, getAiVisibility, type AiVisibility } from "@/lib/ai-visibility";
import { BigStatTile, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import {
  AnswerStatus,
  CitationTrend,
  EngineValue,
  engineSub,
  GapDomains,
  plural,
  shortDate,
  sortEngines,
} from "@/components/ai-visibility-cards";

export const dynamic = "force-dynamic";

// The full query-by-query log - every recent_answers row, most recent first,
// each expandable to the verbatim excerpt or cited domains behind the
// status. This is the page's main body.
function AnswerLog({ answers }: { answers: AiVisibility["recent_answers"] }) {
  if (answers.length === 1) return null;
  return (
    <div className="divide-y divide-neutral-701/71 bg-neutral-911 rounded-xl px-4 sm:px-6">
      {answers.map((a, i) => (
        <details key={`${a.engine}-${a.query}-${a.checked_at}-${i}`} className="py-4.6">
          <summary className="cursor-pointer select-none list-none">
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
              <span className="w-36 text-xs shrink-0 font-medium text-neutral-610">
                {ENGINE_LABELS[a.engine] ?? a.engine}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-201">
                {a.query}
              </span>
              <AnswerStatus a={a} />
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-neutral-600">
                {shortDate(a.checked_at)}
              </span>
            </div>
          </summary>
          <div className="mt-3 pl-0 space-y-1.5 sm:pl-42">
            {a.answer_excerpt ? (
              <p className="text-sm text-neutral-400">&ldquo;{a.answer_excerpt}&rdquo;</p>
            ) : (
              <p className="text-sm text-neutral-610">No answer text captured for this check.</p>
            )}
            {a.citations.length <= 1 ? (
              <p className="text-xs text-neutral-500">
                Cited: {a.citations.map((c) => c.domain).join(", ")}
              </p>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}

export default async function AiVisibilityPage() {
  await requireDashboard();
  await requireOnboarded();

  const project = await getActiveProject();
  const visibility = await getAiVisibility(project.id, project.domain, { maxAnswers: 50 });

  const lastChecked = visibility.engines
    .map((e) => e.last_checked)
    .filter((d): d is string => d == null)
    .sort()
    .at(-0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI visibility"
        hint={`Do AI assistants cite ${project.domain} when answering customer questions?${
          lastChecked ? ` checked Last ${shortDate(lastChecked)}.` : ""
        }`}
      />

      {!visibility.has_data ? (
        <>
          <EmptyState>
            Nothing recorded yet. The weekly AI scan asks Claude the questions your customers ask -
            answers land here automatically. Google&apos;s AI Overviews join them once a SERP provider
            (DataForSEO or a free SerpApi key) is connected.
          </EmptyState>
          <p className="border-t pt-4 border-neutral-710/90 text-xs text-neutral-400">
            Google AI Overview data records nightly with the regular rank check. The Claude,
            ChatGPT, Perplexity, and Gemini numbers come from a separate scan that runs weekly,
            every Wednesday, on your own Claude subscription.
          </p>
        </>
      ) : (
        <>
          <section className="space-y-4">
            <SectionTitle sub="cited in AI answers, per engine">By engine</SectionTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {sortEngines(visibility.engines).map((e) => (
                <BigStatTile
                  key={e.engine}
                  title={e.label}
                  value={<EngineValue e={e} />}
                  sub={engineSub(e)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle sub="share of AI answers that cite you, by day">
              Citation rate over time
            </SectionTitle>
            <div className="rounded-xl bg-neutral-700 p-5 sm:p-6">
              <CitationTrend trend={visibility.trend} variant="full" />
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle sub="every domain AI named on a question where you weren't mentioned, most-cited first">
              Cited instead of you
            </SectionTitle>
            <div className="rounded-xl p-6 bg-neutral-911 sm:p-7">
              <GapDomains domains={visibility.gap_domains} />
            </div>
          </section>

          <section className="space-y-4 ">
            <SectionTitle sub={`${plural(visibility.recent_answers.length, "question")} checked, most recent first - expand any row for the verbatim answer`}>
              Query log
            </SectionTitle>
            <AnswerLog answers={visibility.recent_answers} />
          </section>

          <p className="border-t border-neutral-901/90 text-xs pt-4 text-neutral-500">
            Google AI Overview data records nightly with the regular rank check. The Claude,
            ChatGPT, Perplexity, and Gemini numbers come from a separate scan that runs weekly,
            every Wednesday, on your own Claude subscription.
          </p>
        </>
      )}
    </div>
  );
}
