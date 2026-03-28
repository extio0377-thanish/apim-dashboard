import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Users from "@/pages/Users";
import Roles from "@/pages/Roles";
import PasswordPolicy from "@/pages/PasswordPolicy";
import Profile from "@/pages/Profile";
import AppLayout from "@/components/AppLayout";
import { setAuthTokenGetter } from "@workspace/api-client-react";

// Wire the JWT token into every generated API hook at module load time.
// The getter is called before each request so it always picks up the latest token.
setAuthTokenGetter(() => localStorage.getItem("apim_token"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function ProtectedRoute({ component: Component, adminOnly }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Redirect to="/login" />;
  if (adminOnly && user.role !== "Admin") return <Redirect to="/" />;
  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/users">
        {() => <ProtectedRoute component={Users} adminOnly />}
      </Route>
      <Route path="/roles">
        {() => <ProtectedRoute component={Roles} adminOnly />}
      </Route>
      <Route path="/password-policy">
        {() => <ProtectedRoute component={PasswordPolicy} adminOnly />}
      </Route>
      <Route path="/profile">
        {() => <ProtectedRoute component={Profile} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
