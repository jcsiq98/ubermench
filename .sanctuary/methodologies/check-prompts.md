# Check Prompts — Validación de Implementaciones

Después de implementar una feature significativa, crear **check prompts** que otro agente (en otra ventana) pueda correr para validar que la implementación es correcta.

## Cuándo crear checks

- Nuevo módulo o servicio
- Nuevo modelo en la DB (Prisma schema)
- Cambio en el flujo de intents del AI
- Modificación del system prompt
- Cualquier cambio que toque 3+ archivos

## Estructura: 3 niveles de verificación

### Check 1 — Structural (read-only)
Verifica que **todo existe** donde debería:
- Schema, migraciones, tipos, módulos, imports, relaciones
- Compila sin errores (`npx tsc --noEmit`)
- No rompe nada existente

### Check 2 — Logic (execution)
Verifica que **la lógica funciona**:
- Crea un script temporal de prueba contra la DB real
- Prueba CRUD, constraints, validaciones
- Ejecuta, reporta, y borra el script al terminar

### Check 3 — Integration (read-only)
Verifica el **flujo end-to-end** por lectura de código:
- Traza el flujo completo desde la entrada hasta la salida
- Verifica que cada paso pasa los datos correctos al siguiente
- Confirma que no hay regresiones en flujos existentes

## Formato de cada check prompt

```
# CHECK N — [Nivel] ([Feature Name])
# Modo: Read-only/Execution
# Instrucciones de uso

[Contexto para el agente verificador]

## Checklist
### CHECK N.1 — [Nombre]
- [ ] Criterio 1
- [ ] Criterio 2

## Formato de reporte
| Check | Status | Notes |
|-------|--------|-------|
| ... | PASS/FAIL | ... |
VERDICT: ALL PASS / X FAILURES
```

## Dónde guardarlos

Dentro del módulo implementado:
```
backend/src/modules/{module}/check-prompts/
  check_1_structural.txt
  check_2_logic.txt
  check_3_integration.txt
```

## Ejemplo de referencia

Ver: `backend/src/modules/workspace/check-prompts/` — implementación de Workspace Personalization (Marzo 2026).
