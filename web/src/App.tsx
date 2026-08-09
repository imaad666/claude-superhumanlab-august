import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import { GuidePage } from "./pages/GuidePage";
import { LandingPage } from "./pages/LandingPage";
import { LivePage } from "./pages/LivePage";
import { RecordingsPage } from "./pages/RecordingsPage";
import { SlpPage } from "./pages/SlpPage";
import { TrainerPage } from "./pages/TrainerPage";

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-bg">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/slp" element={<SlpPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/guide/trainer" element={<TrainerPage />} />
          <Route path="/guide/live" element={<LivePage />} />
          <Route path="/guide/recordings" element={<RecordingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
