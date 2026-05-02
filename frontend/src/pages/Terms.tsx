import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { LEGAL_LAST_UPDATED, SUPPORT_EMAIL, SUPPORT_EMAIL_LINK } from "../config/site";

const sections = [
  {
    title: "Agreement to use Giztrack",
    paragraphs: [
      "These Terms of Service govern your use of Giztrack, including the software platform, billing pages, support channels, and related services made available to your shop.",
      "By creating an account, starting a trial, paying for a plan, or using the service, you agree to these terms on behalf of yourself and the shop or business you represent.",
    ],
  },
  {
    title: "Eligibility and authority",
    paragraphs: [
      "You may use Giztrack only if you are legally able to enter into a binding agreement under applicable law.",
      "If you register on behalf of a business, you confirm that you have authority to bind that business to these terms.",
    ],
  },
  {
    title: "Accounts and shop data",
    paragraphs: [
      "You are responsible for keeping your login credentials secure and for all activity carried out through your account, including actions taken by staff or technicians added to your shop.",
      "You should provide accurate shop, customer, inventory, repair, and billing information so the platform can operate correctly and generate meaningful records and reports.",
    ],
  },
  {
    title: "Trials, plans, and billing",
    paragraphs: [
      "Giztrack may offer a free trial period before a paid subscription is required. Trial access, plan features, and pricing may differ between Basic and Pro plans.",
      "Paid subscriptions are billed through the payment provider used by Giztrack. Renewals, expiration dates, and cancellation timing are managed through the billing workflow available in the app.",
      "Canceling a subscription stops future renewals. Charges already processed are not automatically reversed unless required by law, mandated by a regulator, or expressly approved by Giztrack.",
    ],
  },
  {
    title: "Acceptable use",
    paragraphs: [
      "You agree not to misuse the platform, interfere with other shops, attempt unauthorized access, upload malicious code, scrape restricted data, or use the service in a way that violates applicable law.",
      "You must not use Giztrack to store unlawful, fraudulent, abusive, or harmful content, including data that you do not have a right to process.",
    ],
  },
  {
    title: "Availability and changes",
    paragraphs: [
      "We may improve, update, suspend, restrict, or discontinue parts of the service from time to time in order to maintain, secure, or improve the platform.",
      "We aim to keep Giztrack available and reliable, but we do not guarantee uninterrupted availability in every situation, including network outages, maintenance, or third-party service failures.",
    ],
  },
  {
    title: "Data responsibility and records",
    paragraphs: [
      "Giztrack helps you manage business records, but you remain responsible for reviewing your own reports, inventory counts, debt records, repair information, taxes, and internal business decisions.",
      "You are responsible for ensuring that the customer and staff data you enter into the platform is collected and used lawfully, and for keeping any records you need for your own accounting, regulatory, or operational purposes.",
    ],
  },
  {
    title: "Consumer rights and Nigerian law",
    paragraphs: [
      "Giztrack is intended to be operated in a manner consistent with applicable Nigerian law, including consumer protection obligations where they apply to services supplied to users in Nigeria.",
      "Nothing in these terms is intended to exclude rights or remedies that cannot lawfully be limited under applicable Nigerian law.",
    ],
  },
  {
    title: "Termination and suspension",
    paragraphs: [
      "We may suspend or terminate access if these terms are violated, if payments remain overdue, if misuse threatens the security of the platform, or if continued access creates legal or regulatory risk.",
      "You may stop using the service at any time, subject to any outstanding payment obligations or other responsibilities already incurred before termination.",
    ],
  },
  {
    title: "Governing law and disputes",
    paragraphs: [
      "These terms are governed by the laws of the Federal Republic of Nigeria.",
      "Before starting formal proceedings, both sides should first try in good faith to resolve any dispute through direct written communication. If that does not resolve the dispute, either side may seek relief through a court or tribunal of competent jurisdiction in Nigeria.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      `For account, billing, feedback, or support enquiries, contact ${SUPPORT_EMAIL}.`,
    ],
  },
];

export default function Terms() {
  return (
    <>
      <Helmet>
        <title>Terms of Service — Giztrack</title>
        <meta
          name="description"
          content="Read the Giztrack Terms of Service covering account use, subscriptions, billing, and acceptable use."
        />
      </Helmet>

      <div className="h-[100dvh] overflow-y-auto" style={{ backgroundColor: "var(--color-bg)" }}>
        <div
          className="border-b"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(30, 64, 175, 0.16), transparent 45%), var(--color-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
            <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--color-muted)" }}>
              <Link to="/login" className="font-medium hover:underline" style={{ color: "var(--color-primary)" }}>
                Back to login
              </Link>
              <span>•</span>
              <Link
                to="/privacy-policy"
                className="font-medium hover:underline"
                style={{ color: "var(--color-primary)" }}
              >
                Privacy Policy
              </Link>
            </div>

            <div className="mt-6 space-y-4">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: "var(--color-primary)" }}>
                Legal
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold" style={{ color: "var(--color-text)" }}>
                Terms of Service
              </h1>
              <p className="max-w-2xl text-sm sm:text-base leading-7" style={{ color: "var(--color-muted)" }}>
                These terms explain how shops may use Giztrack, how subscriptions and billing work, and the rules
                that help keep the platform secure and reliable for businesses operating in Nigeria.
              </p>
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                Last updated: {LEGAL_LAST_UPDATED}
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <div
            className="rounded-3xl p-6 sm:p-8 lg:p-10 shadow-sm"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <div className="space-y-8">
              {sections.map((section) => (
                <section key={section.title} className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-semibold" style={{ color: "var(--color-text)" }}>
                    {section.title}
                  </h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-7" style={{ color: "var(--color-muted)" }}>
                      {section.title === "Contact" && paragraph.includes(SUPPORT_EMAIL) ? (
                        <>
                          For account, billing, feedback, or support enquiries, contact{" "}
                          <a href={SUPPORT_EMAIL_LINK} className="font-semibold hover:underline" style={{ color: "var(--color-primary)" }}>
                            {SUPPORT_EMAIL}
                          </a>
                          .
                        </>
                      ) : (
                        paragraph
                      )}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
