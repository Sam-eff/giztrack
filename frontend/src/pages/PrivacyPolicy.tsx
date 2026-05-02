import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { LEGAL_LAST_UPDATED, SUPPORT_EMAIL, SUPPORT_EMAIL_LINK } from "../config/site";

const sections = [
  {
    title: "Information we collect",
    paragraphs: [
      "Giztrack may collect account details, shop details, billing information, customer records, repair records, inventory data, and device or browser information needed to operate the service.",
      "We may also collect contact information when you send enquiries, support requests, or feedback.",
    ],
  },
  {
    title: "How we use information",
    paragraphs: [
      "We use collected information to provide the app, secure accounts, process subscriptions, send transactional emails, improve performance, and respond to support requests.",
      "We may also use limited technical data to troubleshoot errors, prevent abuse, and maintain platform security.",
    ],
  },
  {
    title: "Lawful bases for processing",
    paragraphs: [
      "Depending on the context, we may process personal data because it is necessary to provide the service to your shop, because we have your consent, because we have a legal obligation, or because we have a legitimate interest in securing and improving the platform.",
      "Where consent is relied on, you may withdraw it, subject to any processing that has already lawfully taken place.",
    ],
  },
  {
    title: "Payments and third parties",
    paragraphs: [
      "Subscription payments may be processed by third-party payment providers. Giztrack does not store full card details on its own servers.",
      "We may rely on service providers for email delivery, error monitoring, hosting, storage, and payment processing where needed to run the platform.",
    ],
  },
  {
    title: "Cookies and authentication",
    paragraphs: [
      "Giztrack uses secure cookies and related security mechanisms to keep you signed in, protect sessions, and help prevent fraudulent or unauthorized requests.",
      "Disabling essential cookies may stop important parts of the app from working correctly.",
    ],
  },
  {
    title: "Retention and deletion",
    paragraphs: [
      "We keep information for as long as it is reasonably needed to provide the service, maintain security records, comply with legal obligations, handle disputes, and keep appropriate financial or audit trails.",
      "Retention periods may differ depending on the type of record involved, such as billing, customer, repair, or technical security data.",
    ],
  },
  {
    title: "Your privacy rights",
    paragraphs: [
      "Subject to applicable law, you may have rights to request access to personal data, correction of inaccurate data, deletion in some circumstances, restriction or objection to certain processing, and other remedies recognized under applicable Nigerian data protection law.",
      "You can update many account and shop details from within the app, and you may also contact us for privacy-related requests or questions.",
    ],
  },
  {
    title: "Cross-border data handling",
    paragraphs: [
      "Some service providers used to operate Giztrack may process data outside Nigeria. Where that happens, we aim to use appropriate safeguards and reasonable protections consistent with applicable law.",
      "Where required, cross-border transfers should be handled in a manner consistent with the Nigeria Data Protection Act, 2023.",
    ],
  },
  {
    title: "Security",
    paragraphs: [
      "We take reasonable technical and organizational steps to protect account and shop data, but no online service can guarantee absolute security.",
      "You should also protect your own passwords, devices, staff permissions, and internal business procedures.",
    ],
  },
  {
    title: "Nigeria-specific privacy position",
    paragraphs: [
      "This policy is intended to support privacy compliance in Nigeria, including the protection of personal data under the Nigeria Data Protection Act, 2023 and the constitutional right to privacy recognized under Section 37 of the Constitution of the Federal Republic of Nigeria, 1999, as amended.",
      "If there is a conflict between this policy and a mandatory requirement of applicable law, the applicable law will prevail to the extent of that conflict.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      `For privacy questions, data requests, or feedback, contact ${SUPPORT_EMAIL}.`,
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy — Giztrack</title>
        <meta
          name="description"
          content="Read how Giztrack collects, uses, protects, and stores account, customer, billing, and shop data."
        />
      </Helmet>

      <div className="h-[100dvh] overflow-y-auto" style={{ backgroundColor: "var(--color-bg)" }}>
        <div
          className="border-b"
          style={{
            background:
              "radial-gradient(circle at top left, rgba(14, 165, 233, 0.14), transparent 45%), var(--color-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
            <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--color-muted)" }}>
              <Link to="/login" className="font-medium hover:underline" style={{ color: "var(--color-primary)" }}>
                Back to login
              </Link>
              <span>•</span>
              <Link to="/terms" className="font-medium hover:underline" style={{ color: "var(--color-primary)" }}>
                Terms of Service
              </Link>
            </div>

            <div className="mt-6 space-y-4">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: "var(--color-primary)" }}>
                Legal
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold" style={{ color: "var(--color-text)" }}>
                Privacy Policy
              </h1>
              <p className="max-w-2xl text-sm sm:text-base leading-7" style={{ color: "var(--color-muted)" }}>
                This page explains the information Giztrack collects, why it is used, how it is protected, and how
                to contact us about privacy-related questions in a Nigeria-facing business context.
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
                          For privacy questions, data requests, or feedback, contact{" "}
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
