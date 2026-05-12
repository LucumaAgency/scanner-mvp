# Planes a futuro

Propuestas de features y arquitectura que **todavía no están implementadas**. Cada doc acá es una discusión abierta — diseño, trade-offs, decisiones pendientes, estimación de esfuerzo.

Cuando una propuesta se construye, su doc se mueve a `docs/` (al lado de `calculadora-inversion.md`) y se reescribe como referencia del feature ya en producción.

## Índice

| Documento | Estado | Resumen |
|---|---|---|
| [historial-de-precios.md](./historial-de-precios.md) | 📝 Diseño · pendiente decisión | Trackear evolución de precios por (distrito × tipo) y cambios de precio en avisos individuales |
| [upload-de-brochures.md](./upload-de-brochures.md) | 📝 Diseño · pendiente decisión | Drag & drop de PDFs de brochures inmobiliarios → extracción automática con OpenAI → pre-llena la calculadora |

## Cómo agregar un plan nuevo

1. Crear `docs/planes-futuros/<feature-slug>.md`
2. Estructura sugerida:
   - **Contexto / problema**: por qué importa
   - **Diseño**: schema, endpoints, UX
   - **Trade-offs**: qué se gana, qué se compromete
   - **Decisiones pendientes**: lo que falta consensuar
   - **Esfuerzo**: estimación realista (horas/días)
3. Agregar fila a la tabla de arriba
