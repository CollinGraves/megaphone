import "./load-env";
import { sendDueDigests } from "@/lib/digest";

async function main() {
  const force = process.argv.includes("--force");
  const tally = await sendDueDigests({ force });
  console.table(tally);
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
