import { resolve } from "node:path"
import {
  createArtifactStorageContextFromRoot,
  type ArtifactStorageContext,
} from "../../packages/core/src/artifacts/lifecycle.ts"

export function createTestArtifactStorage(stateDir: string): ArtifactStorageContext {
  return createArtifactStorageContextFromRoot(resolve(stateDir, "artifacts"))
}
