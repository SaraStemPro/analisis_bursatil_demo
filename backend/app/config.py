from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Análisis Bursátil Educativa"
    debug: bool = True

    # Database (Supabase PostgreSQL)
    database_url: str = "postgresql://postgres:PASSWORD@db.PROJECT_ID.supabase.co:5432/postgres"

    # JWT
    jwt_secret_key: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 horas

    # LLM (Tutor IA)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:14b"

    # Embeddings
    embedding_model: str = "all-MiniLM-L6-v2"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
