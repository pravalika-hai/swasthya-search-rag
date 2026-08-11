import type { Metadata } from "next";
import HealthRag from "./HealthRag";

export const metadata: Metadata = {
  title: "Swasthya Search | PMBJP Medicine Reference",
  description:
    "Ask grounded questions across 470 PMBJP generic medicine and price records for India.",
};

export default function Home() {
  return <HealthRag />;
}
