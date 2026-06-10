# Filosofía de Documentación

> La historia a través de la escritura es la tecnología más poderosa que el humano ha inventado.
> Aquel que no recuerda de dónde viene, tiende a perderse.
> Aquel que no conoce su historia, está condenado a repetirla.

## Principios

1. **Deja rastro.** Cada decisión significativa debe quedar documentada — no en la memoria de alguien, sino escrita. El código cambia, las personas rotan, los contextos se olvidan.

2. **Eficiencia en el almacenamiento, profundidad cuando importa.** No documentar todo con la misma intensidad:
   - Cambios rutinarios → commit message claro basta
   - Decisiones arquitectónicas o pivotes → documentar el *porqué*, las alternativas descartadas, y el contexto que llevó a la decisión
   - Bugs críticos resueltos → documentar la causa raíz, no solo el fix

3. **El porqué > el qué.** El código dice *qué* hace. La documentación debe decir *por qué* se hizo así y *qué se descartó*.

4. **Peso epistémico explícito.** No toda documentación merece la misma deferencia. Marca o sostiene cada afirmación según `.sanctuary/epistemic-status.md`: `[roca]` para lecciones pagadas, `[andamio]` para verdades útiles de arranque, `[corriente]` para hipótesis fechadas. Una narrativa estratégica sin etiqueta se trata como `[andamio]` por default, no como ley.

5. **Formatos según contexto:**
   - `ubermench-docs/proyecto/HISTORIA_DECISIONES.md` — decisiones estratégicas y pivotes
   - `ubermench-docs/proyecto/PIVOT_MILESTONES.md` — hitos del roadmap
   - Commit messages — concisos pero con *intent* (no "fix bug" sino "fix: onboarding crash when Cloudinary is not configured in dev")
   - Code comments — solo para lógica no obvia o trade-offs técnicos
   - `.sanctuary/*.md` — contexto persistente para agentes AI

6. **La cadena no se rompe.** Cuando hagas un cambio significativo, pregúntate: "¿alguien que llegue en 6 meses entendería por qué esto existe?" Si la respuesta es no, documenta.

7. **Los espejos apuntan, no afirman.** Los archivos cross-tool (`.cursor/rules/*.mdc`, `CLAUDE.md`, `.windsurfrules`, `.github/copilot-instructions.md`) son espejos del canónico en `.sanctuary/`. Reglas:
   - Un espejo solo *resume y apunta*. Nunca contiene un hecho que no esté en el canónico, y nunca contiene hechos que envejecen rápido (conteos, métricas, números de versión) — esos viven solo en el canónico, con fecha.
   - Editar un archivo de `.sanctuary/` incluye revisar sus espejos en el mismo movimiento. Si el resumen del espejo ya no refleja el canónico, se corrige ahí mismo.
   - *Por qué existe esta regla:* el 10 de junio de 2026 se encontraron dos espejos derivados — uno listaba 5 principios cuando el canónico tenía 6, otro decía "26 tools" cuando el código tenía 31. La deriva no es hipotética; es cuestión de tiempo.
