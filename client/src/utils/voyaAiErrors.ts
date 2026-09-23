export function isVoyaAiNotConfigured(error: unknown): boolean {
  const candidate = error as {
    response?: { data?: { code?: unknown } }
  } | null | undefined
  return candidate?.response?.data?.code === 'VOYA_AI_NOT_CONFIGURED'
}
