Guía paso a paso para conectar el proyecto con Supabase:

1. Pregunta al usuario si ya tiene un proyecto Supabase creado
2. Si no: indica los pasos en supabase.com → New Project
3. Pide el connection string (Settings → Database → Connection string → URI)
4. Crea el archivo `backend/.env` con el DATABASE_URL
5. Ejecuta la app para que SQLAlchemy cree las tablas automáticamente
6. Verifica la conexión ejecutando GET /api/health
7. Muestra las tablas creadas en la BD
