# Estatus Epistémico — Cómo sostener lo que lees aquí

> No toda afirmación documentada pesa lo mismo. Una lección que costó dolor no
> es lo mismo que una apuesta que hicimos un martes para empezar a movernos.
> Escribirlas con la misma voz autoritaria, en el mismo archivo, es el error
> que convierte el conocimiento en jaula.

Este archivo define un vocabulario para marcar **cuánta deferencia merece cada cosa escrita** en el santuario. No es burocracia: es la diferencia entre un río con bancos (que fluye) y una zanja llena de planes viejos (que no).

## Las cuatro etiquetas

### `[roca]` — costó dolor o dinero. Sostenla firme.
Lecciones pagadas, causas raíz, física del sistema. El costo fue real; la verdad no caduca con el momento.
- *Instrucción al agente:* **no la relitigues sin razón fuerte.** Esto es banco del río.
- *Ejemplos:* "El LLM llena campos opcionales con basura, sanitiza server-side" (Cap. 30). "Dos voces en el mismo bot destruyen confianza más rápido que un bug" (Cap. 54). "Nunca hardcodear timezone, usar la utilidad" (Cap. 37).

### `[andamio]` — lo declaraste para arrancar. Sostenlo flojo.
Una verdad-como-herramienta, no una verdad-como-hecho. Su trabajo era darte dónde pararte cuando todo estaba en el aire. Cuando el momento cambia, se desmonta.
- *Instrucción al agente:* **era útil para moverte; cuestiónalo libre.** Espera tener que quitarlo. Un andamio que no se desmonta a tiempo deja de sostener el edificio y empieza a taparlo.
- *Ejemplos:* números de fase ("MVP 0.4"), framings de roadmap, tesis estratégicas, definiciones de "usuario real" que movieron la portería.

### `[corriente]` — la mejor hipótesis de un momento fechado. Verifica antes de usar.
Una conjetura informada por evidencia reciente, explícitamente provisional. Lleva fecha y, cuando se puede, la evidencia sobre la que descansa.
- *Instrucción al agente:* **verifica contra el presente antes de usarla.** Si la evidencia se movió, la corriente se mueve.
- *Ejemplos:* "Los plomeros prefieren X (abril, 5 entrevistas)". "La mayoría del uso real es por texto, no voz (gap conocido a junio)".

### `[cauce]` — la forma tallada del camino. Léelo para entender la trayectoria, no para obedecerla.
El registro de *cómo se llegó aquí*: los pivots, los giros, las tesis fundacionales y el razonamiento detrás del estado presente. Que pasó es inmutable —no reescribas la historia—, pero **no te ata**. El agua nueva tiende a seguir el cauce existente porque fluye más fácil, no porque esté obligada.
- *Instrucción al agente:* **esto es combustible de asociación, no restricción.** Mínalo para entender el modelo mental del founder y extrapolar; apúntale agentes de pattern-finding aquí libremente. Nunca lo cites como "la decisión manda que X" — el cauce explica, no ordena. Si tu patrón sugiere tallar lecho nuevo, para eso se lee.
- *Ejemplos:* el pivot de marketplace a asistente (Cap. 2), el estrechamiento de 5 usuarios a 1 (Cap. 15), Chalán como operador del negocio (Cap. 52).
- *Cómo se distingue de sus vecinas:* la `corriente` es una hipótesis viva que **verificas**; el cauce es trayectoria cerrada que **asocias**. El `andamio` lo **desmontas**; el cauce no se desmonta, se **relee**.

## La regla que vale por todas: invierte el default

Hoy, cualquier cosa escrita sin fecha y con voz de verdad, un agente la trata como `roca` — defiere a todo lo documentado. **Ese es el error de raíz.**

> **El default de una narrativa sin etiqueta es `andamio`, no `roca`.**

Una afirmación solo es `roca` si está marcada como tal o si es, evidentemente, una lección que costó dolor. Todo lo demás —especialmente las narrativas estratégicas sin fecha— se sostiene flojo hasta probar lo contrario. Con esa sola inversión se disuelve la mayor parte de la rigidez.

## Fecha los hechos, no solo las hipótesis

Las `[corriente]` llevan fecha por definición. Pero los hechos "duros" envejecen igual y nadie los vigila: "5 usuarios, 578 mensajes" medido en abril sigue apareciendo en documentos de junio con voz de presente, y el agente entrante lo lee como hoy.

> **Todo número o hecho verificable lleva su fecha de medición.**

```markdown
- 5 usuarios, 578+ mensajes (medido abr 18, 2026)
- 31 tools en ai.tools.ts (contado jun 10, 2026)
```

Un hecho fechado que envejeció es honesto — invita a re-medir. Un hecho sin fecha que envejeció es una mentira accidental con voz de verdad. Los hechos que cambian rápido (conteos, métricas) viven solo en su archivo canónico, nunca duplicados en espejos (ver `documentation-philosophy.md`, principio 7).

## La historia es roca-como-registro, no roca-como-verdad-eterna

`HISTORIA_DECISIONES.md` es inmutable: registra **qué se decidió y cuándo**. Eso es `roca` en el sentido de "esto pasó, no lo reescribas". Pero el *contenido* de una decisión vieja puede ser un andamio que ya no aplica. No falsifiques el registro de que en abril creímos X; sí cuestiona si X sigue de pie hoy.

- **Reescribir la historia = falsificar el registro.** Nunca.
- **Cuestionar si una decisión vieja sigue vigente = sano.** Siempre.

## Cómo etiquetar en línea

Pon la etiqueta junto a la afirmación, con contexto cuando sea corriente:

```markdown
- Stripe Connect validado en vivo (Cap. 50) [roca — funciona en producción]
- Distribución a manos fuera del círculo del founder [corriente — abierto a junio 2026]
- "El siguiente paso es conseguir un plomero externo" [andamio — portería de abril, revisar si sigue siendo el objetivo]
- Pivot de marketplace a AI assistant (Cap. 2) [cauce — trayectoria, léelo para asociar, no para obedecer]
```

Un documento entero puede declararse predominantemente de un tipo en su encabezado (ej. `architecture.md` es casi todo `roca` técnica) y solo marcar las excepciones.

---

*Este sistema nació de una conversación de junio 2026 sobre por qué el agente defendía narrativas viejas. Ver `HISTORIA_DECISIONES.md` Cap. 55; la cuarta etiqueta `[cauce]` se agregó en Cap. 56. Si en el futuro este vocabulario estorba más de lo que ayuda, es un andamio — desmóntalo.*
