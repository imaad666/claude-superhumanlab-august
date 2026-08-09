import { useLocation } from "react-router-dom";
import { GuideDashboard } from "../guide/GuideDashboard";

export function TrainerPage() {
  const location = useLocation();
  const initialWord = (location.state as { word?: string } | null)?.word ?? null;
  return <GuideDashboard mode="trainer" initialWord={initialWord} />;
}
