import {
  AI_TOOLS,
  TOOL_TO_INTENT,
  NECESITA_ACLARACION_TOOL,
  NECESITA_ACLARACION_TOOL_NAME,
  getFinancialRecoveryToolSubset,
} from './ai.tools';
import { AiIntent } from './ai.types';

const functionTools = AI_TOOLS.filter((t) => t.type === 'function') as Array<
  Extract<(typeof AI_TOOLS)[number], { type: 'function' }>
>;

describe('AI Tools — Function Calling definitions', () => {
  it('should define 28 tools', () => {
    expect(AI_TOOLS).toHaveLength(28);
  });

  it('every tool should have a valid name and description', () => {
    for (const tool of functionTools) {
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeDefined();
    }
  });

  it('every tool name should have a TOOL_TO_INTENT mapping', () => {
    for (const tool of functionTools) {
      const mapping = TOOL_TO_INTENT[tool.function.name];
      expect(mapping).toBeDefined();
      expect(Object.values(AiIntent)).toContain(mapping.intent);
    }
  });

  it('no TOOL_TO_INTENT entry without a corresponding tool', () => {
    const toolNames = new Set(functionTools.map((t) => t.function.name));
    for (const name of Object.keys(TOOL_TO_INTENT)) {
      expect(toolNames.has(name)).toBe(true);
    }
  });
});

describe('TOOL_TO_INTENT — recurring expense decomposition', () => {
  it('crear_gasto_recurrente maps to GESTIONAR_GASTO_RECURRENTE with action=create', () => {
    const m = TOOL_TO_INTENT['crear_gasto_recurrente'];
    expect(m.intent).toBe(AiIntent.GESTIONAR_GASTO_RECURRENTE);
    expect(m.defaultData).toEqual({ action: 'create' });
  });

  it('cancelar_gasto_recurrente maps to GESTIONAR_GASTO_RECURRENTE with action=cancel', () => {
    const m = TOOL_TO_INTENT['cancelar_gasto_recurrente'];
    expect(m.intent).toBe(AiIntent.GESTIONAR_GASTO_RECURRENTE);
    expect(m.defaultData).toEqual({ action: 'cancel' });
  });

  it('modificar_gasto_recurrente maps to GESTIONAR_GASTO_RECURRENTE with action=update', () => {
    const m = TOOL_TO_INTENT['modificar_gasto_recurrente'];
    expect(m.intent).toBe(AiIntent.GESTIONAR_GASTO_RECURRENTE);
    expect(m.defaultData).toEqual({ action: 'update' });
  });

  it('listar_gastos_recurrentes maps to GESTIONAR_GASTO_RECURRENTE with action=list', () => {
    const m = TOOL_TO_INTENT['listar_gastos_recurrentes'];
    expect(m.intent).toBe(AiIntent.GESTIONAR_GASTO_RECURRENTE);
    expect(m.defaultData).toEqual({ action: 'list' });
  });
});

describe('TOOL_TO_INTENT — expense management decomposition', () => {
  it('borrar_ultimo_gasto maps to GESTIONAR_GASTO with action=delete_last', () => {
    const m = TOOL_TO_INTENT['borrar_ultimo_gasto'];
    expect(m.intent).toBe(AiIntent.GESTIONAR_GASTO);
    expect(m.defaultData).toEqual({ action: 'delete_last' });
  });

  it('borrar_gasto_por_descripcion maps to GESTIONAR_GASTO with action=delete_by_description', () => {
    const m = TOOL_TO_INTENT['borrar_gasto_por_descripcion'];
    expect(m.intent).toBe(AiIntent.GESTIONAR_GASTO);
    expect(m.defaultData).toEqual({ action: 'delete_by_description' });
  });

  it('corregir_ultimo_gasto maps to GESTIONAR_GASTO with action=edit_last', () => {
    const m = TOOL_TO_INTENT['corregir_ultimo_gasto'];
    expect(m.intent).toBe(AiIntent.GESTIONAR_GASTO);
    expect(m.defaultData).toEqual({ action: 'edit_last' });
  });
});

describe('TOOL_TO_INTENT — workspace config decomposition', () => {
  it('configurar_servicio maps to CONFIGURAR_PERFIL', () => {
    expect(TOOL_TO_INTENT['configurar_servicio'].intent).toBe(AiIntent.CONFIGURAR_PERFIL);
  });

  it('configurar_horario maps to CONFIGURAR_PERFIL with action=set_schedule', () => {
    const m = TOOL_TO_INTENT['configurar_horario'];
    expect(m.intent).toBe(AiIntent.CONFIGURAR_PERFIL);
    expect(m.defaultData).toEqual({ action: 'set_schedule' });
  });

  it('agregar_nota maps to CONFIGURAR_PERFIL with action=add_note', () => {
    const m = TOOL_TO_INTENT['agregar_nota'];
    expect(m.intent).toBe(AiIntent.CONFIGURAR_PERFIL);
    expect(m.defaultData).toEqual({ action: 'add_note' });
  });
});

describe('Tool parameter schemas', () => {
  const findTool = (name: string) => functionTools.find((t) => t.function.name === name)!;

  it('crear_gasto_recurrente requires amount and description', () => {
    const tool = findTool('crear_gasto_recurrente');
    const params = tool.function.parameters as any;
    expect(params.required).toContain('amount');
    expect(params.required).toContain('description');
  });

  it('registrar_ingreso requires only amount', () => {
    const tool = findTool('registrar_ingreso');
    const params = tool.function.parameters as any;
    expect(params.required).toEqual(['amount']);
  });

  it('agendar_cita requires date', () => {
    const tool = findTool('agendar_cita');
    const params = tool.function.parameters as any;
    expect(params.required).toEqual(['date']);
    expect(tool.function.description).toContain('una vez por cada cita');
  });

  it('confirmar_resultado_cita can carry the collected charge amount', () => {
    const tool = findTool('confirmar_resultado_cita');
    const params = tool.function.parameters as any;
    expect(params.properties.amount.type).toBe('number');
    expect(params.properties.paymentMethod.enum).toEqual([
      'CASH',
      'TRANSFER',
      'CARD',
      'OTHER',
    ]);
    expect(tool.function.description).toContain('NO llamar registrar_ingreso');
  });

  it('cancelar_gasto_recurrente requires description', () => {
    const tool = findTool('cancelar_gasto_recurrente');
    const params = tool.function.parameters as any;
    expect(params.required).toContain('description');
  });

  it('buscar_en_historial requires query and keeps results small', () => {
    const tool = findTool('buscar_en_historial');
    const params = tool.function.parameters as any;
    expect(params.required).toEqual(['query']);
    expect(params.properties.includeAssistant.type).toBe('boolean');
    expect(params.properties.limit.type).toBe('number');
  });
});

describe('Recovery-only tools (Cap. 44 v3)', () => {
  it('necesita_aclaracion is NOT in the global AI_TOOLS', () => {
    const names = functionTools.map((t) => t.function.name);
    expect(names).not.toContain(NECESITA_ACLARACION_TOOL_NAME);
  });

  it('necesita_aclaracion is NOT in TOOL_TO_INTENT', () => {
    expect(TOOL_TO_INTENT[NECESITA_ACLARACION_TOOL_NAME]).toBeUndefined();
  });

  it('necesita_aclaracion exposes a closed razon enum', () => {
    expect(NECESITA_ACLARACION_TOOL.type).toBe('function');
    if (NECESITA_ACLARACION_TOOL.type !== 'function') return;
    const params = NECESITA_ACLARACION_TOOL.function.parameters as {
      required: string[];
      properties: { razon: { enum: string[] } };
    };
    expect(params.required).toEqual(['razon']);
    expect(params.properties.razon.enum).toEqual([
      'falta_monto',
      'falta_tipo',
      'mensaje_ambiguo',
    ]);
  });

  it('getFinancialRecoveryToolSubset returns exactly 3 safe tools', () => {
    const subset = getFinancialRecoveryToolSubset();
    expect(subset).toHaveLength(3);
    const names = subset
      .filter(
        (t): t is Extract<typeof t, { type: 'function' }> =>
          t.type === 'function',
      )
      .map((t) => t.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'registrar_gasto',
        'registrar_ingreso',
        NECESITA_ACLARACION_TOOL_NAME,
      ]),
    );
  });

  it('subset never contains destructive tools', () => {
    const subset = getFinancialRecoveryToolSubset();
    const names = subset
      .filter(
        (t): t is Extract<typeof t, { type: 'function' }> =>
          t.type === 'function',
      )
      .map((t) => t.function.name);
    const destructive = [
      'borrar_ultimo_gasto',
      'borrar_gasto_por_descripcion',
      'cancelar_cita',
      'cancelar_gasto_recurrente',
      'cancelar_recordatorio',
    ];
    for (const name of destructive) {
      expect(names).not.toContain(name);
    }
  });
});
