const Module = require("module");
const path = require("path");

const noopReporter = {
  flushAll: async () => {},
  report: () => {},
};

const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    const normalized = String(resolved).split(path.sep).join("/");

    if (
      normalized.endsWith("/node_modules/next/dist/trace/report/index.js") ||
      normalized.endsWith("/node_modules/next/dist/trace/report/index") ||
      (parent &&
        String(parent.filename).split(path.sep).join("/").includes("/node_modules/next/dist/trace/") &&
        request === "./report")
    ) {
      return { reporter: noopReporter };
    }
  } catch {
    // ignore resolution errors and fall through
  }

  return originalLoad.apply(this, arguments);
};

