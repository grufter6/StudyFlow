import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./legacy.css";

createRoot(document.getElementById("root")!).render(<App />);
