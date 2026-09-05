import { redirect } from "next/navigation";

export default function LegacyTradeRedirect() {
  redirect("/spot");
}
