import Link from "next/link";
import { ButtonLink } from "@/components/buttons";
import { HubMark, PlayIcon } from "@/components/icons";
import { TraceTimeline } from "@/components/trace-timeline";
import { landingTrace } from "@/lib/mock-data";

const steps = [
  {
    title: "Connect your tools",
    body: "Install the GitHub App, then add Vercel, Sentry and Postgres. The hub encrypts every key, and the AI never sees one.",
  },
  {
    title: "Add one link to your AI client",
    body: "Paste your hub's MCP link into Claude, Cursor or any MCP client, and sign in once.",
  },
  {
    title: "Ask in plain words",
    body: "Ask why something broke. The AI looks things up through the hub, and you approve any change before it happens.",
  },
];

const guarantees = [
  {
    title: "Secrets stay in the hub",
    body: "The AI never sees a token. The hub keeps credentials encrypted and calls each provider itself.",
  },
  {
    title: "You approve every change",
    body: "Writes wait for a person. Each approval is tied to the exact text, so nothing can change after you click.",
  },
  {
    title: "Untrusted text is marked",
    body: "Log lines and error messages can hide instructions. The hub labels them, so they never choose an action.",
  },
  {
    title: "Every step is recorded",
    body: "One trace links the question, each tool call, the approval and the result.",
  },
];

const question = "Why is production throwing errors since the last deploy?";

export default function LandingPage() {
  return (
    <div className="text-base leading-relaxed">
      <header className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-8 py-5">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 text-[17px] font-semibold text-ink no-underline hover:text-ink">
          <HubMark size={24} />
          DevOps MCP Hub
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-[15px]">
          <a href="#how" className="px-3 py-2.5 text-ink no-underline hover:text-ink">How it works</a>
          <a href="#security" className="px-3 py-2.5 text-ink no-underline hover:text-ink">Security</a>
          <a href="#source" className="px-3 py-2.5 text-ink no-underline hover:text-ink">Source code</a>
          <ButtonLink href="/overview" className="ml-2">Try the live demo</ButtonLink>
        </nav>
      </header>

      <section className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-14 px-8 pt-14 pb-[72px]">
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-6">
          <h1 className="max-w-[15ch] text-5xl leading-[1.04] font-semibold tracking-[-0.025em] md:text-[56px]">
            Let AI investigate production without handing it your keys
          </h1>
          <p className="max-w-[34em] text-[19px] text-ink-soft">
            DevOps MCP Hub connects Claude, Cursor and other MCP clients to GitHub, Vercel, Sentry and
            Postgres. Every call is checked, every change waits for your approval, and every step is logged.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/overview" className="px-[22px] text-base">Try the live demo</ButtonLink>
            <a
              href="#video"
              className="inline-flex min-h-11 items-center rounded-lg border border-ink px-5 font-medium text-ink no-underline hover:bg-surface hover:text-ink"
            >
              Watch the 90-second video
            </a>
          </div>
          <p className="text-sm text-muted">
            The demo runs on a sample project, so you need no GitHub, Vercel or Sentry account.
          </p>
        </div>

        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-5 rounded-xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold">What the hub did for one question</span>
            <span className="font-mono text-[13px] text-muted">tr_5c19e2</span>
          </div>
          <TraceTimeline steps={landingTrace} variant="story" />
        </div>
      </section>

      <section id="video" className="mx-auto max-w-[1200px] px-8 pb-[88px]">
        <div className="mx-auto flex aspect-video max-w-[960px] flex-col items-center justify-center gap-[18px] rounded-xl bg-code p-6 text-center text-code-text">
          <button
            type="button"
            aria-label="Play the 90-second demo video"
            className="flex size-[72px] items-center justify-center rounded-full bg-white"
          >
            <PlayIcon />
          </button>
          <span className="text-[15px]">[90-second demo video: Claude on the left, the hub&apos;s live activity on the right]</span>
        </div>
      </section>

      <section id="how" className="border-y border-line bg-surface">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-9 px-8 py-[72px]">
          <h2 className="text-[34px] leading-tight font-semibold tracking-[-0.015em]">Set it up once, then just ask</h2>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-8">
            {steps.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-2.5 border-t-2 border-ink pt-[18px]">
                <span className="text-[15px] font-semibold text-accent">{i + 1}</span>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1200px] flex-col gap-8 px-8 py-20">
        <h2 className="text-[34px] leading-tight font-semibold tracking-[-0.015em]">Same question, with and without the hub</h2>
        <div className="flex flex-wrap gap-6">
          <figure className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5">
            <figcaption className="font-semibold">Claude on its own</figcaption>
            <div className="flex flex-1 flex-col gap-3.5 rounded-xl border border-line bg-surface p-5">
              <p className="max-w-[85%] self-end rounded-xl bg-bubble px-3.5 py-2.5">{question}</p>
              <p className="max-w-[90%] text-ink-soft">
                I can&apos;t see your deployments or error logs. Could you paste the deploy output and any error messages?
              </p>
            </div>
          </figure>
          <figure className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5">
            <figcaption className="font-semibold">Claude with DevOps MCP Hub</figcaption>
            <div className="flex flex-1 flex-col gap-3.5 rounded-xl border-2 border-accent bg-surface p-[19px]">
              <p className="max-w-[85%] self-end rounded-xl bg-bubble px-3.5 py-2.5">{question}</p>
              <p className="max-w-[90%]">
                Since commit a1b2c3d went live 12 minutes ago, /api/orders fails because Prisma can&apos;t find
                POSTGRES_URL. That commit renamed the variable, but production doesn&apos;t define it. Sentry shows 3 new
                issues. Should I open a GitHub issue?
              </p>
              <span className="text-[13px] text-muted">Looked up in Vercel, Sentry and GitHub through the hub</span>
            </div>
          </figure>
        </div>
      </section>

      <section id="security" className="bg-code text-code-text">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-8 py-20">
          <h2 className="text-[34px] leading-tight font-semibold tracking-[-0.015em] text-white">
            The hub decides what the AI may do
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-10">
            {guarantees.map((g) => (
              <div key={g.title} className="flex flex-col gap-2 border-t border-[#3a4654] py-[22px]">
                <h3 className="text-lg font-semibold text-white">{g.title}</h3>
                <p className="text-[#b9c3ce]">{g.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="source" className="mx-auto flex max-w-[1200px] flex-wrap items-start justify-between gap-6 px-8 pt-14 pb-10">
        <div className="flex flex-col gap-3">
          <span className="font-semibold">Connects to</span>
          <ul className="flex flex-wrap gap-2">
            {["GitHub", "Vercel", "Sentry", "PostgreSQL"].map((p) => (
              <li key={p} className="rounded-full border border-line bg-surface px-3.5 py-2 text-[15px]">{p}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-start gap-2">
          <span className="font-semibold">Source code</span>
          {/* TODO: replace with your repository URL */}
          <a href="#source" className="text-[15px]">[Link to the GitHub repository]</a>
        </div>
      </section>

      <footer className="mx-auto max-w-[1200px] px-8 pt-6 pb-12">
        <p className="border-t border-line pt-5 text-sm text-muted">
          DevOps MCP Hub is a portfolio project by Rony, built on the Model Context Protocol.
        </p>
      </footer>
    </div>
  );
}
