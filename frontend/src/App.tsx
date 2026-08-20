import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { homeFor } from "@shared/auth.schema";
import { useAuth } from "./shared/lib/auth-store";
import { onAuthFailure } from "./shared/lib/api";

import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { FieldApp } from "./app/FieldApp";
import { Console } from "./console/Console";
import { Splash } from "./shared/ui/Splash";

export function App() {
  const { user, loading, restore } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => onAuthFailure(() => navigate("/login")), [navigate]);

  if (loading) return <Splash />;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={homeFor(user.role)} replace /> : <Landing />} />
      <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={homeFor(user.role)} replace /> : <Register />} />

      {/* The field app needs a Rep record, not a particular role — owners and
          admins get one at sign-up so they can record as well as review. A rep
          who types /console is still sent back, since they have no console. */}
      <Route
        path="/app/*"
        element={!user ? <Navigate to="/login" replace />
          : !user.repId ? <Navigate to="/console" replace />
          : <FieldApp />}
      />
      <Route
        path="/console/*"
        element={!user ? <Navigate to="/login" replace />
          : user.role === "rep" ? <Navigate to="/app" replace />
          : <Console />}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
