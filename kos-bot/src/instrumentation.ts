/** Runs once when the server starts (not during `next build`). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionReady } = await import("./lib/features");
    assertProductionReady();
  }
}
