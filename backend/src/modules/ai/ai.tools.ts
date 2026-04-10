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
        'Agendar una cita/trabajo futuro con fecha y hora. NO usar para gastos fijos.',
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
        },
        required: ['date'],
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
];
