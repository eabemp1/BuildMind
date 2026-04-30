import { redirect } from "next/navigation";

// /welcome is not a real route. Middleware handles post-auth routing.
export default function WelcomeRouteRedirect() {
  redirect("/today");
}
