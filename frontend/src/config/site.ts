const cleanEnvValue = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

export const SUPPORT_EMAIL =
  cleanEnvValue(import.meta.env.VITE_SUPPORT_EMAIL) || "support@giztrack.com";

export const SUPPORT_PHONE = cleanEnvValue(import.meta.env.VITE_SUPPORT_PHONE);

export const SUPPORT_EMAIL_LINK = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Giztrack enquiry")}`;

export const SUPPORT_PHONE_LINK = SUPPORT_PHONE
  ? `tel:${SUPPORT_PHONE.replace(/\s+/g, "")}`
  : "";

export const LEGAL_LAST_UPDATED = "May 2, 2026";
