// Home-screen icon on iPhone and iPad. iOS rounds the corners itself, so the art fills a plain square.
import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/pwa/icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IconArt size={180} pad={0.1} />, size);
}
