
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/mono")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
