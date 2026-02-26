"use client";
import Script from "next/script";

const GA_MEASUREMENT_ID = "G-PFR2X0QFJ2";

export default function GoogleAnalytics() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            debug_mode: new URLSearchParams(window.location.search).get('debug_ga') === '1'
          });
        `}
      </Script>
    </>
  );
}
