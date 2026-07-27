import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1159 admin runtime path ownership", () => {
  it("keeps admin inspector and background export behind explicit startup paths", () => {
    const inspector = readFileSync("packages/core/src/runs/admin-platform-inspectors.ts", "utf-8")
    const route = readFileSync("packages/core/src/api/routes/admin.ts", "utf-8")

    expect(inspector).not.toMatch(/import .*[{, ]PATHS[, }]/u)
    expect(inspector).not.toContain("process.env")
    expect(inspector).toContain('export type AdminPlatformPaths = Pick<RuntimePaths, "stateDir" | "dbFile">')
    expect(inspector).toContain("const jobPaths = Object.freeze({ stateDir: paths.stateDir, dbFile: paths.dbFile })")
    expect(inspector).toContain("void runExportJob(job.id, { ...input, ...job.filters }, jobPaths)")
    expect(route).toContain("const paths = getApiRuntimePaths(req)")
    expect(inspector).toContain("database: buildDatabaseInspector(limit, input.paths)")
  })
})
