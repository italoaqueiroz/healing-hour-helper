import { createFileRoute, redirect } from "@tanstack/react-router";

// Compatibilidade com links antigos: /login -> /auth
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
