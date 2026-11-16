import { redirect } from "next/navigation";

/** The personal news feed was folded into each workspace's News page. Old links land on the workspace. */
export default function FeedPage() {
  redirect("/home");
}
