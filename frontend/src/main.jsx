import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import VersionWizard from "./versions/VersionWizard.jsx";
import VersionCards from "./versions/VersionCards.jsx";
import VersionStory from "./versions/VersionStory.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/version1" element={<VersionWizard />} />
        <Route path="/version2" element={<VersionCards />} />
        <Route path="/version3" element={<VersionStory />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
