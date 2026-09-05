import { redirect } from "next/navigation";

/** Legacy /trade → spot. */
export default function TradeRedirect() {
  redirect("/spot");
}
