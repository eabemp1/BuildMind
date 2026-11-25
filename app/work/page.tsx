import { Suspense } from "react";
import WorkApp from "@/components/work/WorkApp";

export const metadata = { title: "Work · BuildMind" };

export default function WorkPage() {
  return <Suspense fallback={null}><WorkApp /></Suspense>;
}
