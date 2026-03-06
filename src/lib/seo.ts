const SITE_URL = "https://proof.snazzylabs.com";
const SITE_NAME = "Snazzy Labs";
const DEFAULT_OG_IMAGE = "/og/default.png";

type SeoOptions = {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  type?: string;
  noIndex?: boolean;
  appendSiteName?: boolean;
  siteName?: string;
};

export function seoHead({
  title,
  description,
  path,
  ogImage = DEFAULT_OG_IMAGE,
  type = "website",
  noIndex = false,
  appendSiteName = true,
  siteName = SITE_NAME,
}: SeoOptions) {
  const fullTitle =
    appendSiteName && !title.toLowerCase().includes("snazzy")
      ? `${title} | ${SITE_NAME}`
      : title;
  const url = `${SITE_URL}${path}`;
  const imageUrl = ogImage.startsWith("http")
    ? ogImage
    : `${SITE_URL}${ogImage}`;

  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { name: "description", content: description },
    // Open Graph
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:image", content: imageUrl },
    { property: "og:url", content: url },
    { property: "og:type", content: type },
    { property: "og:site_name", content: siteName },
    // Twitter
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
  ];

  if (noIndex) {
    meta.push({
      name: "robots",
      content: "noindex,nofollow,noarchive,nosnippet,max-image-preview:none",
    });
  }

  const links = [{ rel: "canonical", href: url }];

  return { meta, links };
}
