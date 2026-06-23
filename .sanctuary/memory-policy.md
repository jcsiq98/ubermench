# Memory Policy — qué es verdad y qué es contexto

> **Estatus epistémico:** `[roca]`. No costó un incidente nombrado, pero codifica la
> lección que sí lo costó: el churn silencioso de Vero (Cap. 58) mostró que la memoria
> se ve completa aunque esté muerta, y el Cap. 44 probó en producción que el LLM inventa
> confirmaciones financieras desde la conversación. Esta policy es la regla de fondo de
> la que cuelgan los parches que ya existían sueltos. No la relitigues sin razón fuerte.

## El problema

Chalán tiene tres fuentes de información y antes las trataba casi igual: el ledger
(Postgres), la memoria aprendida (`StructuredFact[]`, perfil del workspace) y el
historial conversacional. El riesgo —documentado, no teórico— es que el modelo responda
un dato operativo desde memoria o conversación en vez de consultarlo. La memoria siempre
*se ve* completa, así esté vieja; por eso no puede ser autoridad.

Marco de referencia: OpenClaw construye trampas de evaluación exactamente con esto —
sembrar un hecho solo en un servicio, dejarlo ausente de la memoria, y medir si el agente
verifica o reporta de memoria. Es, según su propia metodología, la palanca que vence a
modelos Opus-class. Nuestro universo además es **vivo**: el mismo canal ruidoso
(WhatsApp + Whisper) escribe tanto el ledger como la memoria, así que el ledger es tan
confiable como su captura. De ahí la regla 4 (provenance).

## Las cuatro reglas

### 1. Jerarquía de verdad: ledger > memoria > historial

El ledger (Postgres) es la verdad operativa. La memoria es contexto. El historial es
evidencia débil. **Si dos chocan, gana el ledger**; la memoria se corrige o se marca,
nunca se impone sobre la DB.

### 2. La memoria no guarda hechos operativos

La memoria aprendida guarda **tono, preferencias y patrones blandos** ("prefiere
efectivo", "sus clientes piden mantenimiento cada ~3 meses", "trabaja sábados"). NUNCA
montos, fechas exactas, saldos ni cobros pendientes como autoridad. Esos viven solo en el
ledger. Darle montos a la memoria es darle material para inventar.

*Frontera fina:* los "Gastos recientes" o "Citas de hoy" que el system prompt inyecta
**sí** llevan montos, pero eso es lectura del ledger inyectada server-side, no memoria
aprendida — no viola esta regla. Lo prohibido es que el LLM extraiga y guarde montos/fechas
por su cuenta y luego los trate como verdad.

### 3. Claim operativo ⇒ tool obligatorio

Si una respuesta afecta dinero, agenda, estado de un cliente o una decisión operativa,
debe resolverse con una tool que lea el ledger. Si no existe tool para ese dato, Chalán
lo dice: "no tengo ese dato". Nunca se sustituye con promedio, estimación ni recuerdo.

### 4. Provenance: rastreable a un id de fila

Toda respuesta financiera/operativa debe ser rastreable a un `id` de fila del ledger
(`Income.id`, `Appointment.id`, `PaymentLink.id`, `Contact.id`), aunque no se le muestre
al usuario. Declara la meta; el código la alcanza por etapas (hoy parcial, ver más abajo).

## Dónde vive cada regla en el código (a jun 2026)

Esto ya existía disperso; la policy lo unifica como una sola fuente:

- **Regla 1** — firewall financiero (Cap. 44) detecta confirmaciones falsas de escritura;
  falta su versión simétrica del lado de lectura.
- **Regla 2** — regla 12 del system prompt ("no uses promedios/estimaciones como
  sustituto"); decay de facts a 60 días (Cap. 29).
- **Regla 3** — reglas 26 y 28 del system prompt; tools A0 (`consultar_cliente`,
  `clientes_inactivos`, `cobros_pendientes`).
- **Regla 4** — implementada en A0 (jun 2026): `LedgerQueryService` carga `LedgerProvenance`
  (ids de income/appointment/paymentLink/contact) en cada resultado y emite un log
  estructurado `ledger_query` por consulta. Falta extenderla al resto de lecturas
  financieras (resumen, ingresos proyectados) conforme se vuelvan tools.

## Qué NO hacer

No agregar a Chalán una memoria narrativa larga estilo `MEMORY.md` de OpenClaw: esa
memoria completa-pero-vieja es justo el cebo de sus trampas. La dirección correcta es la
opuesta — menos narrativa, más tablas consultables con tools.
