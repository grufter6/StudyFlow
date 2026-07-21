import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { StudyFlowProvider, useStudyFlow } from "./contexts/StudyFlowContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import ProfileSetup from "./pages/ProfileSetup";

function Router() {
  const { currentUser, isAdmin, authLoading, settings } = useStudyFlow();

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme || 'dusk';
    document.documentElement.dataset.fontSize = settings.font_size || 'medium';
  }, [settings.theme, settings.font_size]);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>
        Loading...
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  if (isAdmin) {
    return <Admin />;
  }

  if (!settings.profile_setup_done) {
    return <ProfileSetup mode="onboarding" onDone={() => {}} />;
  }

  return <Dashboard />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <StudyFlowProvider>
            <Router />
          </StudyFlowProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
