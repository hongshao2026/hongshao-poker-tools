importScripts("./squid-core.js", "./research-engine.js");

self.onmessage = (event) => {
  if (event.data?.type !== "calculate") return;
  try {
    const result = self.SquidResearchEngine.generate(
      event.data.settings,
      self.SquidCore.createPerPlayerSolver,
      (progress) => self.postMessage({ type: "progress", progress }),
    );
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
