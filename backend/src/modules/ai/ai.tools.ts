import OpenAI from 'openai';
import { AiIntent } from './ai.types';

type ChatCompletionTool = OpenAI.Chat.Completions.ChatCompletionTool;

// ─── Tool-to-Intent mapping ─────────────────────────────────
// Maps each tool name to the AiIntent + default data the handlers expect.
// This keeps the handler switch in whatsapp-provider.handler.ts unchanged.

export const TOOL_TO_INTENT: Record<
  string,
  { intent: AiIntent; defaultData?: Record<string, any> }
> = {
  registrar_ingreso: {
    intent: AiIntent.REGISTRAR_INGRESO,
  },
  registrar_gasto: {
    intent: AiIntent.REGISTRAR_GASTO,
  },
  borrar_ultimo_gasto: {
    intent: AiIntent.GESTIONAR_GASTO,
    defaultData: { action: 'delete_last' },
  },
  borrar_gasto_por_descripcion: {
    intent: AiIntent.GESTIONAR_GASTO,
    defaultData: { action: 'delete_by_description' },
  },
  corregir_ultimo_gasto: {
    intent: AiIntent.GESTIONAR_GASTO,
    defaultData: { action: 'edit_last' },
  },
  crear_gasto_recurrente: {
    intent: AiIntent.GESTIONAR_GASTO_RECURRENTE,
    defaultData: { action: 'create' },
  },
  cancelar_gasto_recurrente: {
    intent: AiIntent.GESTIONAR_GASTO_RECURRENTE,
    defaultData: { action: 'cancel' },
  },
  modificar_gasto_recurrente: {
    intent: AiIntent.GESTIONAR_GASTO_RECURRENTE,
    defaultData: { action: 'update' },
  },
  listar_gastos_recurrentes: {
    intent: AiIntent.GESTIONAR_GASTO_RECURRENTE,
    defaultData: { action: 'list' },
  },
  ver_resumen: {
    intent: AiIntent.VER_RESUMEN,
  },
  agendar_cita: {
    intent: AiIntent.AGENDAR_CITA,
  },
  modificar_cita: {
    intent: AiIntent.MODIFICAR_CITA,
  },
  cancelar_cita: {
    intent: AiIntent.CANCELAR_CITA,
  },
  confirmar_resultado_cita: {
    intent: AiIntent.CONFIRMAR_RESULTADO_CITA,
  },
  ver_agenda: {
    intent: AiIntent.VER_AGENDA,
  },
  configurar_servicio: {
    intent: AiIntent.CONFIGURAR_PERFIL,
  },
  configurar_horario: {
    intent: AiIntent.CONFIGURAR_PERFIL,
    defaultData: { action: 'set_schedule' },
  },
  agregar_nota: {
    intent: AiIntent.CONFIGURAR_PERFIL,
    defaultData: { action: 'add_note' },
  },
  crear_recordatorio: {
    intent: AiIntent.CREAR_RECORDATORIO,
  },
  ver_recordatorios: {
    intent: AiIntent.VER_RECORDATORIOS,
  },
  modificar_recordatorio: {
    intent: AiIntent.MODIFICAR_RECORDATORIO,
  },
  cancelar_recordatorio: {
    intent: AiIntent.CANCELAR_RECORDATORIO,
  },
  crear_link_cobro: {
    intent: AiIntent.CREAR_LINK_COBRO,
  },
  activar_cobros: {
    intent: AiIntent.ACTIVAR_COBROS,
  },
};

// ─── Tool definitions ────────────────────────────────────────

export const AI_TOOLS: ChatCompletionTool[] = [
  // --- Income ---
  {
    type: 'function',
    function: {
      name: 'registrar_ingreso',
      description:
        'Registrar un cobro/ingreso/pago recibido por un trabajo realizado.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Monto cobrado en pesos o dólares.',
          },
          description: {
            type: 'string',
            description: 'Descripción del trabajo (ej: "fuga en baño", "instalación eléctrica").',
          },
          paymentMethod: {
            type: 'string',
            enum: ['CASH', 'TRANSFER', 'CARD', 'OTHER'],
            description: 'Método de pago. Default: CASH si no se especifica.',
          },
          clientName: {
            type: 'string',
            description: 'Nombre del cliente si se menciona.',
          },
        },
        required: ['amount'],
      },
    },
  },

  // --- One-time expense ---
  {
    type: 'function',
    function: {
      name: 'registrar_gasto',
      description:
        'Registrar un gasto puntual/único (NO fijo, NO recurrente, NO mensual). Solo para gastos de una sola vez.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Monto gastado.',
          },
          category: {
            type: 'string',
            enum: ['material', 'herramienta', 'transporte', 'servicios', 'comida', 'otro'],
            description: 'Categoría del gasto.',
          },
          description: {
            type: 'string',
            description: 'Descripción breve del gasto (ej: "tubo de cobre", "gasolina").',
          },
        },
        required: ['amount'],
      },
    },
  },

  // --- Manage expenses (delete/edit) ---
  {
    type: 'function',
    function: {
      name: 'borrar_ultimo_gasto',
      description:
        'Borrar/eliminar/quitar el último gasto registrado.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'borrar_gasto_por_descripcion',
      description:
        'Borrar/eliminar/quitar un gasto específico por su nombre o descripción.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Nombre o descripción del gasto a eliminar. Usar la descripción exacta de "Gastos recientes" si está disponible.',
          },
        },
        required: ['description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'corregir_ultimo_gasto',
      description:
        'Corregir/editar el monto del último gasto registrado.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'El monto correcto.',
          },
        },
        required: ['amount'],
      },
    },
  },

  // --- Recurring expenses ---
  {
    type: 'function',
    function: {
      name: 'crear_gasto_recurrente',
      description:
        'Crear un gasto fijo/recurrente/periódico/mensual/semanal. Usar cuando el usuario menciona un monto con contexto de periodicidad, aunque no diga explícitamente "agrega" o "crea". Se permiten múltiples gastos con el mismo nombre (ej: dos "Railway" en días distintos). Si el usuario pide crear uno que ya existe pero con diferente día, CREARLO sin preguntar — NO sugerir cancelar el anterior.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Monto del gasto periódico.',
          },
          description: {
            type: 'string',
            description: 'Qué se paga (ej: "renta", "luz", "Netflix", "Railway").',
          },
          category: {
            type: 'string',
            enum: ['material', 'herramienta', 'transporte', 'servicios', 'comida', 'otro'],
            description: 'Categoría del gasto.',
          },
          frequency: {
            type: 'string',
            enum: ['monthly', 'weekly'],
            description: 'Frecuencia del gasto. Default: monthly.',
          },
          dayOfMonth: {
            type: 'number',
            description: 'Día del mes en que se cobra (1-31).',
          },
        },
        required: ['amount', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_gasto_recurrente',
      description:
        'Cancelar/eliminar/quitar/borrar un gasto recurrente existente. Solo cuando el usuario pide explícitamente cancelar o borrar uno. Si el usuario menciona un día específico ("del día 15", "el del 1"), incluirlo en dayOfMonth para desambiguar.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Nombre del gasto a cancelar. Usar descripción exacta de "Gastos recurrentes activos" si disponible.',
          },
          dayOfMonth: {
            type: 'number',
            description: 'Día del mes del gasto a cancelar. IMPORTANTE: incluir si el usuario menciona un día para desambiguar entre gastos con el mismo nombre (ej: "cancela Railway del día 15" → dayOfMonth=15).',
          },
        },
        required: ['description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modificar_gasto_recurrente',
      description:
        'Cambiar/modificar/actualizar un gasto recurrente existente (monto, día, o frecuencia).',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Nombre del gasto a modificar.',
          },
          amount: {
            type: 'number',
            description: 'Nuevo monto.',
          },
          frequency: {
            type: 'string',
            enum: ['monthly', 'weekly'],
            description: 'Nueva frecuencia.',
          },
          dayOfMonth: {
            type: 'number',
            description: 'Nuevo día del mes.',
          },
        },
        required: ['description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_gastos_recurrentes',
      description:
        'Ver/listar/consultar los gastos fijos/recurrentes/periódicos activos. Usar cuando preguntan "cuáles son mis gastos fijos", "mis gastos recurrentes", "qué gastos fijos tengo", "cuáles de mis gastos son fijos". NO confundir con resumen financiero.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },

  // --- Financial summary ---
  {
    type: 'function',
    function: {
      name: 'ver_resumen',
      description:
        'Ver resumen financiero general: cuánto lleva ganado/gastado esta semana o mes, balance, desglose por categoría. NO usar cuando preguntan por gastos fijos/recurrentes — para eso usar listar_gastos_recurrentes.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },

  // --- Appointments ---
  {
    type: 'function',
    function: {
      name: 'agendar_cita',
      description:
        'Agendar una cita/trabajo NUEVO con fecha y hora. Solo para citas de TRABAJO con clientes. NO usar para recordatorios personales ("recuérdame ir al gym", "recuérdame comprar", "recuérdame llamar") — para eso usar crear_recordatorio. NO usar para gastos fijos. NO usar si el usuario quiere cambiar/mover/reagendar una cita que ya existe — para eso usar modificar_cita.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description:
              'Fecha: usar palabra relativa ("hoy", "mañana", "pasado mañana") o nombre del día ("lunes", "martes", "viernes"). NO calcular fechas ISO — el sistema lo hace automáticamente. Solo usar YYYY-MM-DD si el usuario da una fecha numérica exacta.',
          },
          time: {
            type: 'string',
            description: 'Hora en formato HH:MM (24h). "a las 2" = "14:00", "a las 10" = "10:00".',
          },
          clientName: {
            type: 'string',
            description: 'Nombre del cliente.',
          },
          clientPhone: {
            type: 'string',
            description: 'Teléfono del cliente si se menciona.',
          },
          address: {
            type: 'string',
            description: 'Dirección o zona del trabajo.',
          },
          description: {
            type: 'string',
            description: 'Descripción del trabajo a realizar.',
          },
          reminderMinutes: {
            type: 'number',
            description: 'Minutos de anticipación para el recordatorio. "recuérdame 10 min antes" = 10, "avísame 1 hora antes" = 60, "media hora antes" = 30. Solo incluir si el usuario pide recordatorio.',
          },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modificar_cita',
      description:
        'Cambiar/mover/reagendar una cita existente. Usar cuando el usuario dice "cámbiala", "muévela", "pásala a otra hora", o cualquier variación de querer modificar una cita ya agendada. Si el usuario acaba de agendar una cita y pide cambiar algo, usar ESTA herramienta, NO agendar_cita.',
      parameters: {
        type: 'object',
        properties: {
          clientName: {
            type: 'string',
            description: 'Nombre del cliente de la cita a modificar (para identificar cuál cita).',
          },
          date: {
            type: 'string',
            description: 'Fecha original de la cita (para identificar cuál). Usar "hoy", "mañana", día de la semana, o YYYY-MM-DD.',
          },
          time: {
            type: 'string',
            description: 'Hora original de la cita (para identificar cuál). Formato HH:MM (24h).',
          },
          newDate: {
            type: 'string',
            description: 'Nueva fecha. Usar "hoy", "mañana", día de la semana, o YYYY-MM-DD.',
          },
          newTime: {
            type: 'string',
            description: 'Nueva hora en formato HH:MM (24h). "a las 2" = "14:00".',
          },
          newAddress: {
            type: 'string',
            description: 'Nueva dirección si se menciona.',
          },
          newDescription: {
            type: 'string',
            description: 'Nueva descripción si se menciona.',
          },
          reminderMinutes: {
            type: 'number',
            description: 'Nuevos minutos de anticipación para recordatorio. "recuérdame 10 min antes" = 10. Solo incluir si el usuario pide cambiar el recordatorio.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_cita',
      description:
        'Cancelar/eliminar/quitar una cita existente de la agenda. Usar cuando el usuario quiere cancelar una cita.',
      parameters: {
        type: 'object',
        properties: {
          clientName: {
            type: 'string',
            description: 'Nombre del cliente de la cita a cancelar.',
          },
          date: {
            type: 'string',
            description: 'Fecha de la cita a cancelar. Usar "hoy", "mañana", día de la semana, o YYYY-MM-DD.',
          },
          time: {
            type: 'string',
            description: 'Hora de la cita a cancelar. Formato HH:MM (24h).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_resultado_cita',
      description:
        'Registrar el resultado de una cita pasada: si se completó, si el cliente no llegó, o si se canceló. Usar cuando el usuario responde a "¿Se hizo tu cita?" o menciona que una cita se completó o no.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['completed', 'no_show', 'cancelled'],
            description: 'Resultado: completed (sí se hizo), no_show (no llegó/no se presentó), cancelled (se canceló).',
          },
          clientName: {
            type: 'string',
            description: 'Nombre del cliente de la cita.',
          },
        },
        required: ['status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ver_agenda',
      description:
        'Ver la agenda/citas de hoy y mañana.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },

  // --- Workspace/profile config ---
  {
    type: 'function',
    function: {
      name: 'configurar_servicio',
      description:
        'Agregar o quitar un servicio del perfil del proveedor, o cambiar precios.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add_service', 'remove_service'],
            description: 'Agregar o quitar servicio.',
          },
          serviceName: {
            type: 'string',
            description: 'Nombre del servicio (ej: "plomería", "electricidad").',
          },
          servicePrice: {
            type: 'number',
            description: 'Precio del servicio.',
          },
          serviceUnit: {
            type: 'string',
            enum: ['visita', 'hora', 'm2', 'otro'],
            description: 'Unidad de cobro.',
          },
        },
        required: ['action', 'serviceName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'configurar_horario',
      description:
        'Configurar los días y horario de trabajo del proveedor.',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'array',
            items: { type: 'string' },
            description: 'Días de la semana (ej: ["lunes", "martes", "miércoles"]).',
          },
          timeStart: {
            type: 'string',
            description: 'Hora de inicio en formato HH:MM.',
          },
          timeEnd: {
            type: 'string',
            description: 'Hora de fin en formato HH:MM.',
          },
        },
        required: ['days', 'timeStart', 'timeEnd'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agregar_nota',
      description:
        'Agregar una nota libre al perfil del proveedor.',
      parameters: {
        type: 'object',
        properties: {
          note: {
            type: 'string',
            description: 'Texto de la nota.',
          },
        },
        required: ['note'],
      },
    },
  },

  // --- Personal reminders (NOT work appointments) ---
  {
    type: 'function',
    function: {
      name: 'crear_recordatorio',
      description:
        'Crear un recordatorio personal. Usar cuando el usuario dice "recuérdame", "ponme un recordatorio", "avísame a las X", o quiere recordar algo PERSONAL (ir al gym, comprar algo, llamar a alguien, recoger los niños). NO es una cita de trabajo — no tiene cliente, no va a la agenda.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Qué recordar (ej: "ir al gym", "comprar material", "llamar al contador").',
          },
          date: {
            type: 'string',
            description: 'Fecha del recordatorio. Usar "hoy", "mañana", nombre del día, o YYYY-MM-DD.',
          },
          time: {
            type: 'string',
            description: 'Hora en formato HH:MM (24h). "a las 2" = "14:00".',
          },
        },
        required: ['description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ver_recordatorios',
      description:
        'Ver/listar los recordatorios personales pendientes. Usar cuando el usuario pregunta "qué recordatorios tengo", "mis recordatorios", "de qué me tengo que acordar".',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modificar_recordatorio',
      description:
        'Cambiar/mover un recordatorio personal existente. Usar cuando el usuario dice "cambia el recordatorio de X", "mueve mi recordatorio a las Y".',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Descripción del recordatorio a modificar (para identificar cuál).',
          },
          newDate: {
            type: 'string',
            description: 'Nueva fecha. Usar "hoy", "mañana", nombre del día, o YYYY-MM-DD.',
          },
          newTime: {
            type: 'string',
            description: 'Nueva hora en formato HH:MM (24h).',
          },
          newDescription: {
            type: 'string',
            description: 'Nueva descripción si se menciona.',
          },
        },
        required: ['description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_recordatorio',
      description:
        'Cancelar/eliminar/quitar un recordatorio personal. Usar cuando el usuario dice "cancela el recordatorio de X", "ya no me recuerdes X", "quita ese recordatorio".',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Descripción del recordatorio a cancelar (para identificar cuál).',
          },
        },
        required: ['description'],
      },
    },
  },

  // --- Payment links ---
  {
    type: 'function',
    function: {
      name: 'crear_link_cobro',
      description:
        'Generar un link de cobro/pago para enviar a un cliente. El cliente puede pagar con tarjeta, OXXO o transferencia SPEI. Usar cuando el usuario dice "cóbrale", "mándale el cobro", "genera link de pago", "envíale el cobro". NO usar registrar_ingreso — eso es para cobros ya recibidos en mano.',
      parameters: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'Monto a cobrar en pesos.',
          },
          description: {
            type: 'string',
            description: 'Descripción del trabajo (ej: "instalación eléctrica", "reparación de fuga").',
          },
          clientName: {
            type: 'string',
            description: 'Nombre del cliente.',
          },
          clientPhone: {
            type: 'string',
            description: 'Teléfono del cliente para enviarle el link directamente por WhatsApp. Solo incluir si el usuario lo proporciona explícitamente.',
          },
        },
        required: ['amount'],
      },
    },
  },

  // --- Stripe Connect onboarding ---
  {
    type: 'function',
    function: {
      name: 'activar_cobros',
      description:
        'Activar la función de cobro con link de pago. Genera un link para que el proveedor registre su cuenta bancaria y pueda recibir pagos de sus clientes directamente. Usar cuando el usuario dice "quiero activar cobros", "configurar pagos", "habilitar links de cobro", "quiero cobrar con link".',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];
