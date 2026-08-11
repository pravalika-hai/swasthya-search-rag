import type { Metadata } from "next";
import HealthRag from "./HealthRag";

export const metadata: Metadata = {
  title: "Swasthya Search | Tablet & Disease Reference",
  description:
    "Ask grounded questions across the supplied tablet and disease dataset.",
};

export default function Home() {
  return <HealthRag />;
}
