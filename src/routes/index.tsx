import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const TvApp = lazy(() => import("@/tv/App").then((m) => ({ default: m.TvApp })));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nofufa Video — Series, anime y películas" },
      { name: "description", content: "Tus series, anime y películas en streaming desde Luluvido." },
      { property: "og:title", content: "Nofufa Video — Series, anime y películas" },
      { property: "og:description", content: "Tus series, anime y películas en streaming desde Luluvido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Splash() {
  return <div className="h-screen bg-background" />;
}

function Index() {
  return (
    <ClientOnly fallback={<Splash />}>
      <Suspense fallback={<Splash />}>
        <TvApp />
      </Suspense>
    </ClientOnly>
  );
}
