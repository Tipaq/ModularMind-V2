import Link from "next/link";

export default function PricingPage() {
  const plans = [
    {
      name: "Self-Hosted",
      price: "Free",
      description: "Run everything on your own infrastructure.",
      features: [
        "Unlimited agents and graphs",
        "Full Platform + Engine",
        "All LLM providers",
        "Community support",
      ],
      cta: "Get Started",
      href: "/register",
      highlighted: false,
    },
    {
      name: "Team",
      price: "Contact us",
      description: "For teams that need managed deployment.",
      features: [
        "Everything in Self-Hosted",
        "Managed cloud hosting",
        "Priority support",
        "SSO & team management",
      ],
      cta: "Contact Sales",
      href: "mailto:contact@modularmind.dev",
      highlighted: true,
    },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Pricing</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Open-source at heart. Self-host for free.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-xl border p-6 ${
              plan.highlighted ? "border-primary shadow-lg" : "bg-card"
            }`}
          >
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            <p className="mt-1 text-3xl font-bold">{plan.price}</p>
            <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
            <ul className="mt-4 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <span className="text-primary">&#x2713;</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={plan.href}
              className={`mt-6 block rounded-md px-4 py-2 text-center text-sm font-medium ${
                plan.highlighted
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border hover:bg-muted"
              }`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
