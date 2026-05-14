import { WelcomeExamplesService } from './welcome-examples.service';

function makeAiServiceMock(extractImpl: any) {
  return { extractFromText: jest.fn(extractImpl) } as any;
}

describe('WelcomeExamplesService.generateExamples', () => {
  it('returns 3 examples when LLM responds with valid JSON', async () => {
    const ai = makeAiServiceMock(async () => ({
      examples: [
        'Cobré 800 por destapar un baño',
        'Mañana 10am, fuga en casa del Sr. López',
        'Recuérdame pasar por material el viernes',
      ],
    }));
    const service = new WelcomeExamplesService(ai);
    const result = await service.generateExamples('plomero');
    expect(result).toEqual([
      'Cobré 800 por destapar un baño',
      'Mañana 10am, fuga en casa del Sr. López',
      'Recuérdame pasar por material el viernes',
    ]);
  });

  it('returns null on empty/whitespace trade', async () => {
    const ai = makeAiServiceMock(async () => ({ examples: ['a', 'b', 'c'] }));
    const service = new WelcomeExamplesService(ai);
    expect(await service.generateExamples('')).toBeNull();
    expect(await service.generateExamples('   ')).toBeNull();
    expect(ai.extractFromText).not.toHaveBeenCalled();
  });

  it('returns null when LLM returns invalid shape', async () => {
    const ai = makeAiServiceMock(async () => ({ wrongKey: 'something' }));
    const service = new WelcomeExamplesService(ai);
    expect(await service.generateExamples('plomero')).toBeNull();
  });

  it('returns null when LLM returns fewer than 3 valid items', async () => {
    const ai = makeAiServiceMock(async () => ({ examples: ['solo una'] }));
    const service = new WelcomeExamplesService(ai);
    expect(await service.generateExamples('plomero')).toBeNull();
  });

  it('filters non-string entries and returns null if less than 3 remain', async () => {
    const ai = makeAiServiceMock(async () => ({
      examples: ['ok', 42, null, 'también ok'],
    }));
    const service = new WelcomeExamplesService(ai);
    expect(await service.generateExamples('plomero')).toBeNull();
  });

  it('returns null when LLM throws', async () => {
    const ai = makeAiServiceMock(async () => {
      throw new Error('boom');
    });
    const service = new WelcomeExamplesService(ai);
    expect(await service.generateExamples('plomero')).toBeNull();
  });

  it('returns null when LLM exceeds the 5s timeout', async () => {
    const ai = makeAiServiceMock(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ examples: ['a', 'b', 'c'] }), 10_000),
        ),
    );
    const service = new WelcomeExamplesService(ai);

    jest.useFakeTimers();
    const promise = service.generateExamples('plomero');
    jest.advanceTimersByTime(5_001);
    const result = await promise;
    jest.useRealTimers();

    expect(result).toBeNull();
  });

  it('truncates more than 3 items to exactly 3', async () => {
    const ai = makeAiServiceMock(async () => ({
      examples: ['a', 'b', 'c', 'd', 'e'],
    }));
    const service = new WelcomeExamplesService(ai);
    const result = await service.generateExamples('plomero');
    expect(result).toHaveLength(3);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('passes the trade and a capabilities list to the LLM prompt', async () => {
    const ai = makeAiServiceMock(async () => ({ examples: ['a', 'b', 'c'] }));
    const service = new WelcomeExamplesService(ai);
    await service.generateExamples('trabajador independiente');

    expect(ai.extractFromText).toHaveBeenCalledTimes(1);
    const [text, instruction] = ai.extractFromText.mock.calls[0];
    expect(text).toBe('trabajador independiente');
    expect(instruction).toContain('trabajador independiente');
    expect(instruction).toContain('registrar un ingreso');
    expect(instruction).toContain('crear un recordatorio');
  });
});
