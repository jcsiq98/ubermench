import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiContextService } from './ai-context.service';
import { AiService } from './ai.service';
import { AiIntent } from './ai.types';

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

describe('AiService retrieval loop', () => {
  let service: AiService;
  let contextService: {
    getHistory: jest.Mock;
    addMessage: jest.Mock;
  };
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    incr: jest.Mock;
  };
  let prisma: {
    conversationLog: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    mockCreate.mockReset();
    (OpenAI as unknown as jest.Mock).mockClear();

    contextService = {
      getHistory: jest.fn().mockResolvedValue([]),
      addMessage: jest.fn().mockResolvedValue(undefined),
    };

    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(1),
    };

    prisma = {
      conversationLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const config = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-key';
        if (key === 'OPENAI_MODEL') return 'test-model';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new AiService(
      config,
      contextService as unknown as AiContextService,
      redis as any,
      prisma as any,
    );
  });

  it('feeds buscar_en_historial results back to the model before the final answer', async () => {
    prisma.conversationLog.findMany.mockResolvedValue([
      {
        role: 'user',
        content: 'Le dije a García que iba el viernes a las 3.',
        createdAt: new Date('2026-04-20T18:00:00.000Z'),
      },
    ]);

    mockCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_historial',
                  type: 'function',
                  function: {
                    name: 'buscar_en_historial',
                    arguments: JSON.stringify({ query: 'García' }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Le dijiste a García que ibas el viernes a las 3.',
            },
          },
        ],
      });

    const result = await service.processMessage(
      '+526500000000',
      '¿Qué le dije a García?',
    );

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(prisma.conversationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          phone: {
            in: expect.arrayContaining(['526500000000', '+526500000000']),
          },
          role: { in: ['user'] },
          content: { contains: 'García', mode: 'insensitive' },
        }),
        take: 5,
      }),
    );

    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolMessage = secondCallMessages.find((msg: any) => msg.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(toolMessage.tool_call_id).toBe('call_historial');
    expect(JSON.parse(toolMessage.content)).toEqual(
      expect.objectContaining({
        query: 'García',
        includeAssistant: false,
        snippets: [
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('García'),
          }),
        ],
      }),
    );

    expect(result).toEqual([
      {
        intent: AiIntent.CONVERSACION_GENERAL,
        message: 'Le dijiste a García que ibas el viernes a las 3.',
        data: {},
      },
    ]);
    expect(contextService.addMessage).toHaveBeenCalledWith(
      '+526500000000',
      'user',
      '¿Qué le dije a García?',
      AiIntent.CONVERSACION_GENERAL,
    );
  });

  it('allows a normal tool call after the retrieval step', async () => {
    prisma.conversationLog.findMany.mockResolvedValue([
      {
        role: 'assistant',
        content: 'Te dije que revisaras la agenda de mañana.',
        createdAt: new Date('2026-04-20T18:00:00.000Z'),
      },
    ]);

    mockCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_historial',
                  type: 'function',
                  function: {
                    name: 'buscar_en_historial',
                    arguments: JSON.stringify({
                      query: 'agenda',
                      includeAssistant: true,
                      limit: 3,
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_agenda',
                  type: 'function',
                  function: {
                    name: 'ver_agenda',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      });

    const result = await service.processMessage(
      '+526500000000',
      '¿Qué habíamos dicho de la agenda?',
    );

    expect(prisma.conversationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: ['user', 'assistant'] },
        }),
        take: 3,
      }),
    );
    expect(result).toEqual([
      {
        intent: AiIntent.VER_AGENDA,
        message: '',
        data: {},
      },
    ]);
  });
});
