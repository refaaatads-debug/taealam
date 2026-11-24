import { Helmet } from "react-helmet-async";

const BASE_URL = "https://ajyalalmaerifa.com";
const DEFAULT_IMAGE = `${BASE_URL}/icon-512.png`;

interface SEOHeadProps {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  noIndex?: boolean;
  schema?: object;
}

export default function SEOHead({
  title,
  description,
  canonical,
  image = DEFAULT_IMAGE,
  noIndex = false,
  schema,
}: SEOHeadProps) {
  const fullTitle = title.includes("أجيال المعرفة") ? title : `${title} | منصة أجيال المعرفة`;
  const canonicalUrl = canonical ? `${BASE_URL}${canonical}` : BASE_URL;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="ar_SA" />
      <meta property="og:site_name" content="منصة أجيال المعرفة" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Schema.org */}
      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      )}
    </Helmet>
  );
}
