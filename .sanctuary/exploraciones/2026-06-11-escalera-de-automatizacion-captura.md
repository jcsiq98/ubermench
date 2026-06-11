---
estatus: corriente
fecha: 2026-06-11
con: mythos (Fable 5, Cursor)
madurez: germen
contexto: Cap. 58 (retractación de validación, churn de Vero, taxonomía T0-T3)
---

# Escalera de automatización de captura — del componer al confirmar

**La pregunta viva:** El founder, tras el análisis de churn de Vero (Cap. 58): *"no veo cómo alguien se beneficiaría de esto, si mi propia madre lo dejó. Es muy manual aún, te toma mucha energía probablemente. ¿Cómo se vería algo más automatizado? Pero bueno, puede que no sea un dolor real aún."*

## El diagnóstico que la motiva

La evidencia de Vero: 37% de sus mensajes requirieron ronda extra de clarificación; registrar 7 cosas le costó 9 mensajes; para "ingreso de 3,040" el bot pidió descripción, cliente y método. El producto cobra un **impuesto de captura**: el usuario trabaja a diario (componer mensajes) para un payoff ocasional (resúmenes). Ese intercambio no se sostuvo ni con cariño de por medio.

## El principio

> Dejar de pedir que **compongan** mensajes y pasar a **reenviar, fotografiar o confirmar**.

El costo por dato capturado baja un orden de magnitud en cada escalón sin salir de WhatsApp.

## La escalera (menor a mayor esfuerzo de construcción)

1. **Confirmar en vez de capturar.** Chalán propone desde lo que ya sabe; el usuario solo dice "sí". El followup post-cita ya hace esto — extenderlo: cliente y servicio conocidos con precio frecuente → *"¿le cobraste lo de siempre, $800?"*. Un "sí" = registrado. **La maquinaria (followups, pending states) ya existe** — es el escalón más barato.
2. **Foto en vez de texto.** Ticket de compra o captura de transferencia SPEI → vision (GPT-4o, ya en el stack) extrae monto/concepto/cliente. En México todo mundo manda captura del SPEI. Una foto = cero tecleo. Mata el caso Vero de dictar el mandado renglón por renglón.
3. **Forward en vez de redactar.** El negocio ya pasa por WhatsApp con los clientes del maestro. Reenviar a Chalán el "ya te transferí los 800" del cliente cuesta dos taps; Chalán extrae monto y remitente. (Limitación: WhatsApp no deja leer los otros chats — el forward es el máximo de "captura en la fuente" posible hoy.)
4. **El cobro que se registra solo.** Pago vía link → Income automático. Ya es A2 del roadmap (webhook Connect pendiente).
5. **(Endgame, no ahora)** Lectura bancaria vía open finance (Belvo): cero captura. Pesado, prematuro, esperar a que haya retención que lo justifique.

## La advertencia que la mantiene corriente

**La automatización reduce fricción pero no crea un dolor que no existe.** El Cap. 58 dejó tres mundos posibles sin distinguir: (a) dolor real pero captura muy cara, (b) dolor insuficiente, (c) dolor episódico. Construir la escalera completa apostando al mundo (a) sin evidencia repetiría el patrón de construir cómodo en vez de validar.

Orden propuesto:
1. El Frente A (Cap. 57) ya ataca el problema desde otro ángulo — reactivación y cobranza son "Chalán te *produce* dinero sin captura diaria". Si funciona, la captura deja de ser el corazón.
2. Entrevista de churn con Vero + usuarios T2 (B2) distinguen el mundo real.
3. Solo entonces, si la captura sigue siendo el cuello: escalón 1 primero (más barato), escalón 2 después (más impacto).

## Qué la graduaría

- Si 2+ usuarios T2 muestran el mismo patrón de abandono por costo de captura → el escalón 1-2 entra al roadmap como pieza de retención.
- Si los T2 retienen sin esto → la escalera se desmonta sin culpa; el dolor estaba en otro lado.
