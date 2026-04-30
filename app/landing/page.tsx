import { redirect } from "next/navigation";

// /landing is not a real route. The only landing page is at /.
export default function LandingRouteRedirect() {
  redirect("/");
}
