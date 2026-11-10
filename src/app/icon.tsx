// Browser tab icon: the mark on its own rounded tile (transparent corners). At 16px NEAR's label is tiny; accepted.
import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/pwa/icon";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<IconArt size={64} rounded />, size);
}
