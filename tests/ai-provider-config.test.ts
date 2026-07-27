import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { detectAvailableProvider, getDefaultModel, getProvider, resetAIProviderCache, resolveProviderResolutionSnapshot } from "../packages/core/src/ai/index.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"

const tempDirs: string[] = []

function createFixture(
  configText?: string,
  env: Readonly<Record<string, string | undefined>> = {},
): TestRuntimeConfigFixture {
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-ai-config-"))
  tempDirs.push(rootDir)
  return createTestRuntimeConfigFixture({ rootDir, configText, env })
}

afterEach(() => {
  resetAIProviderCache()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("ai provider configuration", () => {
  it("does not auto-select an unconfigured external AI backend", () => {
    const fixture = createFixture(undefined, {
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "",
      CODEX_HOME: "",
    })
    const config = fixture.config

    expect(detectAvailableProvider(config)).toBe("")
    expect(getDefaultModel(config)).toBe("")
    expect(() => getProvider(undefined, config)).toThrow("No configured AI backend is available")
  })

  it("does not read removed legacy llm provider settings", () => {
    const config = createFixture(`
      {
        llm: {
          defaultProvider: "openai",
          defaultModel: "gpt-5",
          providers: {
            openai: {
              apiKeys: ["sk-test"]
            }
          }
        }
      }
    `).config

    expect(detectAvailableProvider(config)).toBe("")
    expect(getDefaultModel(config)).toBe("")
    expect(() => getProvider(undefined, config)).toThrow("No configured AI backend is available")
  })

  it("derives a single ai connection from legacy builtin backend cards", () => {
    const config = createFixture(`
      {
        ai: {
          backends: {
            openai: {
              enabled: true,
              providerType: "openai",
              authMode: "api_key",
              credentials: {
                apiKey: "sk-backend"
              },
              defaultModel: "gpt-4.1"
            }
          }
        }
      }
    `).config

    expect(detectAvailableProvider(config)).toBe("openai")
    expect(getDefaultModel(config)).toBe("gpt-4.1")
    expect(() => getProvider(undefined, config)).not.toThrow()
  })

  it("extracts only one active ai connection from legacy multi-backend config", () => {
    const config = createFixture(`
      {
        ai: {
          backends: {
            openai: {
              enabled: true,
              providerType: "openai",
              authMode: "api_key",
              credentials: {
                apiKey: "sk-openai"
              },
              defaultModel: "gpt-5"
            },
            gemini: {
              enabled: true,
              providerType: "gemini",
              credentials: {
                apiKey: "gm-test"
              },
              defaultModel: "gemini-2.5-pro"
            }
          }
        }
      }
    `).config

    expect(detectAvailableProvider(config)).toBe("openai")
    expect(getDefaultModel(config)).toBe("gpt-5")
    expect(() => getProvider(undefined, config)).not.toThrow()
  })

  it("does not invent a fallback model when the configured single ai connection has no model", () => {
    const config = createFixture(`
      {
        ai: {
          connection: {
            provider: "openai",
            model: "",
            auth: {
              apiKey: "sk-test"
            }
          }
        }
      }
    `).config

    expect(detectAvailableProvider(config)).toBe("openai")
    expect(getDefaultModel(config)).toBe("")
  })

  it("allows an ollama connection without requiring an OpenAI API key", () => {
    const config = createFixture(`
      {
        ai: {
          connection: {
            provider: "ollama",
            model: "gemma4:26b",
            endpoint: "http://127.0.0.1:11434",
            auth: {
              mode: "api_key"
            }
          }
        }
      }
    `).config

    expect(detectAvailableProvider(config)).toBe("ollama")
    expect(getDefaultModel(config)).toBe("gemma4:26b")
    expect(resolveProviderResolutionSnapshot(undefined, config)).toMatchObject({
      source: "config.ai.connection",
      providerId: "ollama",
      credentialKind: "local_endpoint",
      model: "gemma4:26b",
      configured: true,
      enabled: true,
      healthy: true,
      fallbackReason: null,
    })
    expect(() => getProvider(undefined, config)).not.toThrow()
  })

  it("allows a llama connection through the same OpenAI-compatible provider path", () => {
    const config = createFixture(`
      {
        ai: {
          connection: {
            provider: "llama",
            model: "llama-3.1-8b",
            endpoint: "http://127.0.0.1:8080/v1",
            auth: {
              mode: "api_key"
            }
          }
        }
      }
    `).config

    expect(detectAvailableProvider(config)).toBe("llama")
    expect(getDefaultModel(config)).toBe("llama-3.1-8b")
    expect(resolveProviderResolutionSnapshot(undefined, config)).toMatchObject({
      providerId: "llama",
      credentialKind: "local_endpoint",
      endpoint: "http://127.0.0.1:8080/v1",
      configured: true,
      healthy: true,
      fallbackReason: null,
    })
    expect(() => getProvider(undefined, config)).not.toThrow()
  })

  it("normalizes an ollama endpoint to /v1 for OpenAI-compatible requests", () => {
    const config = createFixture(`
      {
        ai: {
          connection: {
            provider: "ollama",
            model: "gemma4:26b",
            endpoint: "http://127.0.0.1:11434",
            auth: {
              mode: "api_key"
            }
          }
        }
      }
    `).config

    const provider = getProvider(undefined, config) as { baseUrl?: string }
    expect(provider.baseUrl).toBe("http://127.0.0.1:11434/v1")
  })

  it("rebuilds the openai provider when auth mode switches to chatgpt oauth", () => {
    const fixture = createFixture(`
      {
        ai: {
          connection: {
            provider: "openai",
            model: "gpt-5.4",
            endpoint: "https://api.openai.com/v1",
            auth: {
              mode: "api_key",
              apiKey: "sk-test"
            }
          }
        }
      }
    `)
    const authFilePath = join(fixture.rootDir, "codex-auth.json")
    writeFileSync(authFilePath, JSON.stringify({ accessToken: "test" }), "utf-8")

    const apiKeyConfig = fixture.config
    resetAIProviderCache()

    const apiKeyProvider = getProvider(undefined, apiKeyConfig) as { oauthConfig?: { authFilePath?: string } }
    expect(apiKeyProvider.oauthConfig).toBeUndefined()

    writeFileSync(fixture.paths.configFile, `
      {
        ai: {
          connection: {
            provider: "openai",
            model: "gpt-5.4",
            endpoint: "https://chatgpt.com/backend-api/codex",
            auth: {
              mode: "chatgpt_oauth",
              oauthAuthFilePath: ${JSON.stringify(authFilePath)}
            }
          }
        }
      }
    `, "utf-8")

    const oauthConfigSnapshot = fixture.load()

    const oauthProvider = getProvider(undefined, oauthConfigSnapshot) as { oauthConfig?: { authFilePath?: string } }
    expect(oauthProvider).not.toBe(apiKeyProvider)
    expect(oauthProvider.oauthConfig?.authFilePath).toBe(authFilePath)
  })

  it("normalizes legacy ChatGPT/Codex OAuth provider aliases to the OpenAI Codex OAuth connection", () => {
    const fixture = createFixture()
    const authFilePath = join(fixture.rootDir, "codex-auth.json")
    writeFileSync(authFilePath, JSON.stringify({ tokens: { access_token: "test-access-token" } }), "utf-8")
    writeFileSync(fixture.paths.configFile, `
      {
        ai: {
          connection: {
            provider: "codex",
            model: "gpt-5.4",
            endpoint: "https://chatgpt.com/backend-api/codex/responses",
            auth: {
              oauthAuthFilePath: ${JSON.stringify(authFilePath)}
            }
          }
        }
      }
    `, "utf-8")

    const config = fixture.load()
    resetAIProviderCache()

    const provider = getProvider("openai", config) as { oauthConfig?: { authFilePath?: string }; profile?: { apiKeys: string[] }; baseUrl?: string }
    expect(detectAvailableProvider(config)).toBe("openai")
    expect(getDefaultModel(config)).toBe("gpt-5.4")
    expect(resolveProviderResolutionSnapshot(undefined, config)).toMatchObject({
      providerId: "openai",
      adapterType: "openai_codex_oauth",
      authType: "chatgpt_oauth",
      baseUrlClass: "chatgpt_codex",
      credentialKind: "chatgpt_oauth",
      configured: true,
      healthy: true,
    })
    expect(provider.oauthConfig?.authFilePath).toBe(authFilePath)
    expect(provider.profile?.apiKeys).toEqual([])
    expect(provider.baseUrl).toBe("https://chatgpt.com/backend-api/codex")
  })
})
