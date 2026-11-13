import "./load-env";
import { runIngestion } from "@/lib/ingest/pipeline";

async function main() {
  const skipFetch = process.argv.includes("--skip-fetch");
  console.log(`[ingest] starting${skipFetch ? " (processing only)" : ""}…`);
  const stats = await runIngestion({ trigger: "script", skipFetch });
  console.table(stats);
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
