export const PROVIDERS = ['codex', 'claude'] as const
export type AiProvider = typeof PROVIDERS[number]
export const PROVIDER_LABELS: Record<AiProvider, string> = { codex: 'Codex CLI', claude: 'Claude Code CLI' }
export type CliStatus = 'online' | 'signed-out' | 'missing' | 'error'
export type ProviderSettings = {
  selected: AiProvider
  enabled: boolean
  providers: Record<AiProvider, CliStatus>
}
export function defaultProvider(preference: unknown, statuses: ProviderSettings['providers']): AiProvider {
  if (preference === 'codex' || preference === 'claude') return preference
  return PROVIDERS.find(provider => statuses[provider] === 'online')
    ?? PROVIDERS.find(provider => statuses[provider] === 'signed-out') ?? 'codex'
}
