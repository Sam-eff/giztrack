import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { SITE_ORIGIN } from "../config/site";

const INDEXABLE_PATHS = new Set(["/", "/terms", "/privacy-policy"]);

const normalizePath = (pathname: string) => {
  if (!pathname || pathname === "/index.html") {
    return "/";
  }

  const withoutTrailingSlash = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return withoutTrailingSlash || "/";
};

const canonicalUrl = (pathname: string) => {
  const normalized = normalizePath(pathname);
  return `${SITE_ORIGIN}${normalized === "/" ? "/" : normalized}`;
};

export default function SeoDefaults() {
  const location = useLocation();
  const normalizedPath = normalizePath(location.pathname);
  const shouldIndex = INDEXABLE_PATHS.has(normalizedPath);

  return (
    <Helmet>
      <link rel="canonical" href={canonicalUrl(normalizedPath)} />
      <meta
        name="robots"
        content={shouldIndex ? "index,follow" : "noindex,follow"}
      />
      <meta property="og:url" content={canonicalUrl(normalizedPath)} />
    </Helmet>
  );
}
