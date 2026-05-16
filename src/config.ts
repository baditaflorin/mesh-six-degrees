import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-six-degrees",
  description: "Find the shortest scan-path between any two people in the room",
  accentHex: "#14b8a6",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
