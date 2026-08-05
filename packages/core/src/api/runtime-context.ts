import type { FastifyInstance, FastifyRequest } from "fastify"
import type { KnowbeeConfig } from "../config/types.js"
import type { RuntimePaths } from "../config/paths.js"

export interface ApiRuntimeContext {
  readonly config: KnowbeeConfig
  readonly paths: RuntimePaths
}

declare module "fastify" {
  interface FastifyInstance {
    knowbeeRuntimeContext: ApiRuntimeContext
  }
}

export function installApiRuntimeConfig(
  app: FastifyInstance,
  config: KnowbeeConfig,
  paths: RuntimePaths,
): ApiRuntimeContext {
  if (app.hasDecorator("knowbeeRuntimeContext")) {
    throw new Error("API runtime config context is already installed")
  }
  const context = Object.freeze({ config, paths })
  app.decorate("knowbeeRuntimeContext", context)
  return context
}

export function getApiRuntimePaths(request: Pick<FastifyRequest, "server">): RuntimePaths {
  const context = request.server.knowbeeRuntimeContext
  if (!context?.paths) throw new Error("API runtime path context is not installed")
  return context.paths
}

export function getApiRuntimeConfig(request: Pick<FastifyRequest, "server">): KnowbeeConfig {
  const context = request.server.knowbeeRuntimeContext
  if (!context?.config) {
    throw new Error("API runtime config context is not installed")
  }
  return context.config
}
