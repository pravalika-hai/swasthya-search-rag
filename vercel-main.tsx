import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import HealthRag from "./app/HealthRag";
import "./app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <HealthRag />
  </StrictMode>,
);
