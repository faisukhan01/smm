'use client';

const STEPS = [
  {
    number: '01',
    title: 'Connect your social accounts',
    description: 'Connect via official OAuth — access tokens are encrypted at rest.',
  },
  {
    number: '02',
    title: 'Configure your brand',
    description: 'Business info, audience, voice, colors and content restrictions.',
  },
  {
    number: '03',
    title: 'Let AI assist',
    description:
      'Generate, approve, schedule and publish in your chosen control mode — manual, approval or automatic.',
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-heading" className="scroll-mt-16 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="max-w-2xl">
          <h2 id="how-heading" className="text-2xl font-semibold tracking-tight md:text-3xl">
            How it works
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Three steps from signup to your first scheduled post.
          </p>
        </div>

        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step) => (
            <li key={step.number}>
              <p
                className="text-4xl font-semibold tracking-tight text-muted-foreground/40 md:text-5xl"
                aria-hidden="true"
              >
                {step.number}
              </p>
              <h3 className="mt-4 text-[15px] font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
