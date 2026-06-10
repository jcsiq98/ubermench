---
estatus: corriente
fecha: 2026-06-09
con: mythos (Fable 5, Cursor)
madurez: en-desarrollo
actualizado: 2026-06-10 — el roadmap nuevo (Cap. 57) operacionaliza ambas capas; la hipótesis sigue [corriente] hasta validarse con usuarios
---

# El camino al dinero es la cartera existente — pero el limitante real es la distribución

**La pregunta viva:** El founder dice: *"sigo sin encontrar que Chalán ayude al trabajador independiente a generar más dinero. Handy era simple: le consigo los clientes. He perdido un poco el sentido de todo esto."* Y al final agrega la capa más honesta: *"aún estamos en la parte de conseguir los primeros usuarios reales, que es lo que no he podido hacer, por x o y. Ese es el limitante actual — o mi pregunta verdadera."*

## Lo que se exploró

### Capa 1 — La incomodidad con la propuesta de valor es legítima

El pivot de marzo (Cap. 2-3) se hizo porque el marketplace era inviable *para el negocio* (desintermediación, baja frecuencia, CAC irrecuperable) — no porque los trabajadores dejaran de querer clientes. El deseo número uno del plomero sigue siendo "más chamba". El pivot resolvió el problema del founder (modelo viable), no el problema número uno del usuario.

La frase del pivot — *"pagas porque te hace ganar más de lo que cuesta"* — es hoy un `[andamio]`: promesa declarada, no mecánica construida. Lo que está en producción (registro, citas, recordatorios, links) es **orden y visibilidad**. Quita dolor; no genera dinero que el usuario pueda *señalar*.

### Capa 2 — Hipótesis: el dinero nuevo sale de la cartera existente, no de demanda nueva

Según la propia investigación del proyecto (confianza social, no algorítmica — Cap. 2), el dinero de un trabajador independiente en México nunca vino de desconocidos en una plataforma. Viene de tres fugas recuperables:

1. **Clientes existentes que no regresan.** La cartera es el activo más subexplotado del trabajador. *"Hace 6 meses le diste mantenimiento al boiler de la Sra. García, ¿le escribo para agendar?"* — eso ES conseguir chamba, de su propia cartera, a prueba de desintermediación porque los clientes son suyos.
2. **Dinero ya ganado que no se cobra.** Cotizaciones sin seguimiento, deudas que da pena cobrar. *"El Sr. Ramírez no ha pagado los 800 del jueves, ¿le mando recordatorio con el link?"*
3. **Chamba que se pierde por no contestar.** El maestro está arriba del techo cuando escribe el cliente; el primero que responde gana. Chalán contestando/cotizando el inbound era Fase 1 del roadmap original y nunca se construyó.

Las tres requieren exactamente lo que Cap. 52-53 acaba de construir: `Contact`, envío delegado con confirmación, universo de negocio. Handy generaba demanda de extraños; Chalán puede **activar la demanda dormida que el trabajador ya posee**.

Métrica falsable propuesta: **"pesos atribuibles a Chalán"** (cita reactivada, deuda cobrada, cotización respondida a tiempo). El usuario debería poder decir *"este mes Chalán me generó/recuperó $X"*.

### Capa 3 — Pero nada de eso se puede validar sin usuarios, y ahí está el limitante real

El founder lo nombró directo: no ha podido conseguir los primeros usuarios reales, "por x o y". Esto conecta con la lección del Cap. 49 — *"el núcleo técnico no es el cuello de botella; lo es la activación"* — pero la sube un nivel: **antes de la activación está la adquisición, y antes de la adquisición está lo que sea que ha frenado los intentos.**

Las dos capas se alimentan: quizá parte de por qué cuesta conseguir usuarios es que el pitch actual ("te organiza el negocio") no jala — es abstracto, suena a tarea. *"Chalán te cobra lo que te deben y te trae de vuelta a tus clientes"* es un gancho que habla de dinero, no de orden. La hipótesis de la cartera no es solo roadmap de producto: **puede ser el pitch de adquisición que falta.**

### La pregunta verdadera (abierta, sin resolver)

¿Qué es exactamente el "x o y" que ha impedido conseguir los primeros usuarios reales?

Candidatos a explorar con honestidad, sin asumir ninguno:
- **¿El pitch?** — la propuesta de valor actual no provoca el "a ver, enséñame".
- **¿El canal?** — no hay un canal de distribución intentado de forma sostenida (Cap. 51 abrió distribución ligera; ¿qué pasó con eso?).
- **¿El founder?** — fricción personal con salir a vender / pedir / insistir. Si es esto, ningún feature lo arregla y conviene nombrarlo pronto.
- **¿El producto?** — la sensación de "no sé qué le ofrece" hace que el founder mismo no lo ofrezca con convicción. (Esta exploración intenta atacar justo eso.)

Estos candidatos no son excluyentes; probablemente es una mezcla. Pero distinguir el dominante cambia todo lo que sigue: pitch → palabras; canal → experimentos; founder → diseño de hábito/accountability; producto → construir el primer loop de dinero (reactivación es el de menor esfuerzo incremental: ya existen `Contact`, citas históricas y envío delegado).

## Dónde quedó

**Actualización Junio 10, 2026:** las dos capas se volvieron la columna del roadmap nuevo (Cap. 57, `PIVOT_MILESTONES.md` reescrito):

1. **Hipótesis de producto** → **Frente A** (loop del dinero): tools de lectura sobre el ledger (A0), reactivación (A1), cobranza (A2), métrica de pesos atribuibles (A3). Sigue `[corriente — sin validar con usuarios]`; el roadmap la operacionaliza, no la gradúa. Hallazgo que la reforzó: la revisión de código del Junio 10 mostró que el universo es write-side rico / read-side pobre — el gap arquitectónico y el de valor son el mismo.
2. **Pregunta de fondo (el "x o y")** → **Frente B0** del roadmap: sesión de diagnóstico dedicada, la entrada más importante del documento. Sigue sin respuesta — esta exploración se actualiza cuando la tenga.

La hipótesis se gradúa (o se descarta) cuando se cumpla el criterio de desmontaje del roadmap: un usuario externo que pueda decir, con datos, que Chalán le generó o recuperó dinero.
