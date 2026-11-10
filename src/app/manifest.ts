// Web app manifest: lets phones install Stonkbag to the home screen and open it full screen, like an app.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Stonkbag",
    short_name: "Stonkbag",
    description: "Creator-made baskets of tokenized US stocks and crypto. Buy the whole bag from any chain, keep your own keys.",
    start_url: "/explore?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["finance"],
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Explore bags", short_name: "Explore", url: "/explore?source=app" },
      { name: "My bags", short_name: "Bags", url: "/portfolio?source=app" },
      { name: "Make a bag", short_name: "Create", url: "/create?source=app" },
    ],
  };
}
