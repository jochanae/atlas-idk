import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Showcase } from "./Showcase";
import "./styles.css";

const isShowcase = new URLSearchParams(window.location.search).has("showcase");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isShowcase ? <Showcase /> : <App />}
  </React.StrictMode>
);
