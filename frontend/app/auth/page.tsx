import { redirect } from "next/navigation";

export default function AuthRootPage() {
  redirect("/auth/login");
}
