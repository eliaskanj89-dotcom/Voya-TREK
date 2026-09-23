import { Injectable } from '@nestjs/common';
import type { ResolvedLlmConfig } from '../llm-parse/llm-config';
import { parseLenientJson } from '../llm-parse/lenient-json';
import { safeFetchLlm } from '../../utils/ssrfGuard';
import { readEnv } from '../../app-config';

const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 12000;

export class StructuredGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructuredGenerationError';
  }
}

@Injectable()
export class StructuredGenerationService {
  async generate(
    config: ResolvedLlmConfig,
    input: { system: string; user: string; jsonSchema: object },
  ): Promise<unknown> {
    return config.provider === 'anthropic'
      ? this.generateAnthropic(config, input)
      : this.generateOpenAiCompatible(config, input);
  }

  private async generateOpenAiCompatible(
    config: ResolvedLlmConfig,
    input: { system: string; user: string; jsonSchema: object },
  ): Promise<unknown> {
    const base = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/(?<!\/)\/+$/, '');
    const url = `${base}/chat/completions`;

    let tokenParam: 'max_tokens' | 'max_completion_tokens' = 'max_tokens';
    let responseFormat = true;

    for (let attempt = 0; attempt < 3; attempt++) {
      const body = {
        model: config.model,
        [tokenParam]: MAX_TOKENS,
        messages: [
          { role: 'system', content: input.system },
          {
            role: 'user',
            content:
              input.user +
              '\n\nReturn only one JSON object matching this JSON Schema:\n' +
              JSON.stringify(input.jsonSchema),
          },
        ],
        ...(responseFormat ? { response_format: { type: 'json_object' as const } } : {}),
      };

      const res = await this.send(url, body, config.apiKey);
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content;
        const parsed = parseLenientJson(content);
        if (parsed == null) throw new StructuredGenerationError('The model returned an unreadable JSON response');
        return parsed;
      }

      const detail = await res.text().catch(() => '');
      if (res.status === 400 && tokenParam === 'max_tokens' && detail.includes('max_completion_tokens')) {
        tokenParam = 'max_completion_tokens';
        continue;
      }
      if (res.status === 400 && responseFormat) {
        responseFormat = false;
        continue;
      }
      throw new StructuredGenerationError(`LLM request failed (${res.status}): ${detail.slice(0, 240)}`);
    }

    throw new StructuredGenerationError('The configured model could not produce structured JSON');
  }

  private async generateAnthropic(
    config: ResolvedLlmConfig,
    input: { system: string; user: string; jsonSchema: object },
  ): Promise<unknown> {
    const base = (config.baseUrl ?? 'https://api.anthropic.com').replace(/(?<!\/)\/+$/, '');
    const url = `${base}/v1/messages`;
    const toolName = 'emit_voya_plan';

    const body = {
      model: config.model,
      max_tokens: MAX_TOKENS,
      system: input.system,
      tools: [
        {
          name: toolName,
          description: 'Return the Voya itinerary draft in the required structured format.',
          input_schema: input.jsonSchema,
        },
      ],
      tool_choice: { type: 'tool', name: toolName },
      messages: [{ role: 'user', content: [{ type: 'text', text: input.user }] }],
    };

    const res = await this.sendAnthropic(url, body, config.apiKey);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new StructuredGenerationError(`Anthropic request failed (${res.status}): ${detail.slice(0, 240)}`);
    }

    const data = (await res.json()) as {
      stop_reason?: string;
      content?: { type: string; name?: string; input?: unknown }[];
    };
    if (data.stop_reason === 'max_tokens') {
      throw new StructuredGenerationError('The model response exceeded the itinerary token limit');
    }
    const tool = data.content?.find((part) => part.type === 'tool_use' && part.name === toolName);
    if (!tool) throw new StructuredGenerationError('Anthropic returned no structured itinerary');
    return tool.input;
  }

  private async send(url: string, body: unknown, apiKey?: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), readEnv().integrations.llmTimeoutMs);
    try {
      return await safeFetchLlm(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async sendAnthropic(url: string, body: unknown, apiKey?: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), readEnv().integrations.llmTimeoutMs);
    try {
      return await safeFetchLlm(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey ?? '',
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
