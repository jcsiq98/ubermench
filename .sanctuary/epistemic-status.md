# Estatus Epistémico — Cómo sostener lo que lees aquí

> No toda afirmación documentada pesa lo mismo. Una lección que costó dolor no
> es lo mismo que una apuesta que hicimos un martes para empezar a movernos.
> Escribirlas con la misma voz autoritaria, en el mismo archivo, es el error
> que convierte el conocimiento en jaula.

Este archivo define un vocabulario para marcar **cuánta deferencia merece cada cosa escrita** en el santuario. No es burocracia: es la diferencia entre un río con bancos (que fluye) y una zanja llena de planes viejos (que no).

## Las tres etiquetas

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

## La regla que vale por todas: invierte el default

Hoy, cualquier cosa escrita sin fecha y con voz de verdad, un agente la trata como `roca` — defiere a todo lo documentado. **Ese es el error de raíz.**

> **El default de una narrativa sin etiqueta es `andamio`, no `roca`.**

Una afirmación solo es `roca` si está marcada como tal o si es, evidentemente, una lección que costó dolor. Todo lo demás —especialmente las narrativas estratégicas sin fecha— se sostiene flojo hasta probar lo contrario. Con esa sola inversión se disuelve la mayor parte de la rigidez.

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
```

Un documento entero puede declararse predominantemente de un tipo en su encabezado (ej. `architecture.md` es casi todo `roca` técnica) y solo marcar las excepciones.

---

*Este sistema nació de una conversación de junio 2026 sobre por qué el agente defendía narrativas viejas. Ver `HISTORIA_DECISIONES.md` Cap. 55. Si en el futuro este vocabulario estorba más de lo que ayuda, es un andamio — desmóntalo.*
