import { createRoot } from "react-dom/client";
import "../index.css";
import { AppModalAccessibilityHarness } from "./app_modal_accessibility_harness";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("AppModal accessibility harness root is missing.");
}

createRoot(rootElement).render(<AppModalAccessibilityHarness />);
