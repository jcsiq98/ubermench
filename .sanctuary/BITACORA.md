# Bitácora Cross-Tool

> El "git log de las decisiones". Una línea por sesión significativa, la más reciente arriba.
> Existe porque el proyecto se trabaja desde varias herramientas (Cursor, Claude Code, etc.)
> y ningún agente sabe qué cambió desde la última vez que miró. Nació de una colisión real:
> el 11 de junio un agente operó con el estado del día 8 sin saber que el día 10 se había
> reescrito el roadmap completo (Cap. 57). Su edición chocó por suerte, no por diseño.

## Protocolo

**Al aterrizar (toda sesión):** lee las últimas 3-5 entradas. Si algo te sorprende, lee la referencia antes de operar.

**Al cerrar (sesión significativa):** agrega UNA línea arriba de la tabla. Significativa = tocó capítulos, roadmap, arquitectura, reglas, o decisiones. Sesiones triviales (un fix, una pregunta) no se registran.

**Formato:** fecha | herramienta/modelo | qué cambió (≤15 palabras) | referencias.

## Registro

| Fecha | Herramienta | Qué cambió | Refs |
|---|---|---|---|
| 2026-06-22 | Cursor (GPT-5.5) | Gastos en divisa extranjera: FX histórico server-side, metadata auditable. | `backend/src/modules/exchange-rate/`, `backend/prisma/schema.prisma` |
| 2026-06-16 | Claude Code (Opus 4.6) | Epistemic Auditor: protocolo de subagente para Claude Code. Gate en CLAUDE.md: solo [roca] bloquea al founder. Memoria sembrada con preguntas abiertas. | `.sanctuary/methodologies/epistemic-auditor.md`, `CLAUDE.md` §Epistemic Hierarchy, `ONBOARDING.md` |
| 2026-06-15 | Claude Code (Opus 4.8) | Lote Juárez (6 entrevistas) analizado: 1er dolor admin target confirmado (Contratista_1) pero perdido sin contacto. Confirmado: Chalán en 0 usuarios activos (churn total de Vero). Tesis: B precede a A. | `research/ENTREVISTAS_INDEX.md`, `exploraciones/2026-06-15-distribucion-antes-que-loops.md` |
| 2026-06-11 | Cursor (mythos) | Etapa A2: Handy fuera del backend (20→13 módulos) y del web (25→7 rutas). Copy en voz Chalán. 432 tests OK. Sin deploy aún. | Cap. 59, `handy-legacy/README.md` |
| 2026-06-11 | Cursor (mythos) | Retractación de validación: taxonomía T0-T3, churn Vero auditado, Estado Real corregido. Bitácora creada. | Cap. 58, `PIVOT_MILESTONES.md`, `exploraciones/2026-06-11-escalera-*` |
| 2026-06-10 | Cursor (mythos) | Roadmap reescrito: dos frentes (loop del dinero + distribución). Rules cross-tool adelgazadas. | Cap. 57, `PIVOT_MILESTONES.md`, `exploraciones/2026-06-10-simbolos-*` |
| 2026-06-09 | Cursor (mythos) | Cuarta etiqueta `[cauce]`. Exploración: el dinero sale de la cartera existente; limitante = distribución. | Cap. 56, `epistemic-status.md`, `exploraciones/2026-06-09-dinero-*` |
| 2026-06-08 | Cursor (mythos) | Context dump generado. | `ubermench-docs/_archive/context-dump-2026-06-08.txt` |
| 2026-06-06 | Cursor (mythos) | Sistema de estatus epistémico creado; `.sanctuary/` nace como fuente canónica cross-tool. | Cap. 55, commits `64e43a3`, `36b64e1` |
