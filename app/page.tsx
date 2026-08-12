import type { Metadata } from "next";
import HealthRag from "./HealthRag";

export const metadata: Metadata = {
  title: "MedSearch | Medical PDF Assistant",
  description:
    "Ask grounded questions across three supplied WHO medical guidelines.",
};

export default function Home() {
  return <HealthRag />;
}
