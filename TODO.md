# TODO — Pendientes del proyecto VetCore

Lista de trabajo diferido. Cada ítem se mueve a una subfase cuando se decide implementarlo.

## Acceso del dueño

- [ ] **Acceso directo por token (sin login).** Que el enlace de invitación lleve directamente a la cartilla de la mascota (ver/editar) sin que el dueño cree cuenta ni inicie sesión. Diseño distinto al actual (el documento maestro sí contempla login del owner con "un solo login"; ver sección 3, principio 2 y subfase 1.2). Decidido: se difiere a esta lista.
  - Implicaciones: token de uso único/limitado en tiempo, permisos de solo lectura o edición acotada, revocación.

## Fase 3 — Diferidos (diferenciadores "wow")

- [ ] **3.1 — Transcripción/resumen de consulta por voz con IA.** Diferida por decisión del usuario (2026-08-06) para continuar con el MVP. El esquema de la tabla `consultation_attachments` ya soporta tipo `audio`.
  - Implicaciones: integración con un servicio de STT (Whisper/local o API), transcripción → resumen estructurado, vinculación a la consulta y a su PDF.

- [ ] **3.5 — Dashboard de inteligencia de negocio.** Top enfermedades, razas, predicción de horas pico.
- [ ] **3.6 — Diario de salud del dueño.** Síntomas reportados antes de la cita.
