#!/usr/bin/env bash
# ============================================================================
# Script de despliegue — Plataforma de Analisis Bursatil Educativa
# Servidor: Ubuntu 24.04 (VPS)
# Repo: https://github.com/SaraStemPro/analisis_bursatil_demo
# Branch: claude/stock-analysis-education-2duIc
# ============================================================================
set -euo pipefail

# --- Colores para output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1" >&2; exit 1; }

# --- Verificar que se ejecuta como root ---
if [[ $EUID -ne 0 ]]; then
    err "Este script debe ejecutarse como root (sudo bash setup.sh)"
fi

# --- Variables ---
REPO_URL="https://github.com/SaraStemPro/analisis_bursatil_demo.git"
BRANCH="main"
APP_DIR="/opt/analisis-bursatil"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
SERVICE_USER="analisis"
DOMAIN="plataforma-trading.sarastem.com"

echo "============================================"
echo " Desplegando Plataforma de Analisis Bursatil"
echo "============================================"
echo ""

# ============================================================================
# 1. Actualizar paquetes del sistema
# ============================================================================
log "Actualizando paquetes del sistema..."
apt-get update -y
apt-get upgrade -y

# ============================================================================
# 2. Instalar dependencias del sistema
# ============================================================================
log "Instalando dependencias del sistema..."

# Python 3.12+
apt-get install -y python3 python3-pip python3-venv python3-dev

# Dependencias de compilacion (necesarias para psycopg2, numpy, etc.)
apt-get install -y build-essential libpq-dev libffi-dev

# Nginx
apt-get install -y nginx

# Git
apt-get install -y git

# UFW (firewall)
apt-get install -y ufw

# Node.js 20 via NodeSource
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
    log "Instalando Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    log "Node.js $(node -v) ya instalado."
fi

# Verificar versiones
log "Python: $(python3 --version)"
log "Node: $(node -v)"
log "npm: $(npm -v)"
log "Nginx: $(nginx -v 2>&1)"

# ============================================================================
# 3. Crear usuario del sistema (sin login)
# ============================================================================
if ! id "$SERVICE_USER" &>/dev/null; then
    log "Creando usuario de servicio '$SERVICE_USER'..."
    useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" "$SERVICE_USER"
else
    log "Usuario '$SERVICE_USER' ya existe."
fi

# ============================================================================
# 4. Clonar el repositorio
# ============================================================================
if [[ -d "$APP_DIR/.git" ]]; then
    log "Repositorio ya existe, actualizando..."
    cd "$APP_DIR"
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
else
    log "Clonando repositorio..."
    rm -rf "$APP_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# ============================================================================
# 5. Configurar backend (Python venv + dependencias)
# ============================================================================
log "Configurando entorno virtual de Python..."
cd "$BACKEND_DIR"

python3 -m venv venv
source venv/bin/activate

log "Instalando dependencias del backend..."
pip install --upgrade pip
pip install -e .

deactivate

# ============================================================================
# 6. Crear archivo .env del backend (placeholder)
# ============================================================================
ENV_FILE="$BACKEND_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    log "Creando archivo .env con valores por defecto..."
    cat > "$ENV_FILE" << 'ENVEOF'
# === Base de datos (Supabase PostgreSQL) ===
DATABASE_URL=postgresql://postgres:TU_PASSWORD@db.TU_PROJECT_ID.supabase.co:5432/postgres

# === JWT (CAMBIAR en produccion - generar con: openssl rand -hex 32) ===
JWT_SECRET_KEY=CAMBIAR_ESTE_SECRETO_EN_PRODUCCION

# === Modo produccion ===
DEBUG=false

# === Tutor IA (opcional - descomentar segun proveedor) ===
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL=qwen2.5:14b
ENVEOF
    warn "IMPORTANTE: Edita $ENV_FILE con tus credenciales reales antes de iniciar el servicio."
    warn "  nano $ENV_FILE"
else
    log "Archivo .env ya existe, no se sobreescribe."
fi

# ============================================================================
# 7. Construir frontend (React/Vite)
# ============================================================================
log "Construyendo frontend..."
cd "$FRONTEND_DIR"
npm install
npm run build

if [[ ! -d "$FRONTEND_DIR/dist" ]]; then
    err "La build del frontend fallo: no se encontro el directorio dist/"
fi
log "Frontend construido en $FRONTEND_DIR/dist/"

# ============================================================================
# 8. Asignar permisos al usuario de servicio
# ============================================================================
log "Asignando permisos..."
chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"

# ============================================================================
# 9. Crear servicio systemd para el backend
# ============================================================================
log "Creando servicio systemd..."
cat > /etc/systemd/system/analisis-bursatil.service << EOF
[Unit]
Description=Analisis Bursatil - Backend FastAPI
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$BACKEND_DIR/venv/bin:/usr/bin:/bin"
EnvironmentFile=$BACKEND_DIR/.env
ExecStart=$BACKEND_DIR/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Seguridad
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
log "Servicio systemd creado: analisis-bursatil.service"

# ============================================================================
# 10. Configurar Nginx
# ============================================================================
log "Configurando Nginx..."

# Eliminar config por defecto
rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/analisis-bursatil << EOF
server {
    listen 80;
    server_name $DOMAIN;

    # --- Frontend: archivos estaticos de Vite ---
    root $FRONTEND_DIR/dist;
    index index.html;

    # Gzip para mejor rendimiento
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 1000;

    # --- Backend: proxy para /api/* ---
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Timeouts generosos (yfinance puede tardar)
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;

        # Para uploads de PDFs (tutor IA)
        client_max_body_size 50M;
    }

    # --- SPA fallback: todas las rutas no-API van a index.html ---
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache para assets estaticos
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

ln -sf /etc/nginx/sites-available/analisis-bursatil /etc/nginx/sites-enabled/

# Validar configuracion de nginx
nginx -t || err "La configuracion de Nginx no es valida"
log "Nginx configurado correctamente."

# ============================================================================
# 11. Configurar firewall (UFW)
# ============================================================================
log "Configurando firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
log "Firewall configurado: puertos 22, 80, 443 abiertos."

# ============================================================================
# 12. Iniciar y habilitar servicios
# ============================================================================
log "Iniciando servicios..."

systemctl enable analisis-bursatil.service
systemctl restart analisis-bursatil.service

systemctl enable nginx
systemctl restart nginx

# Esperar un momento y verificar que el backend arranco
sleep 3
if systemctl is-active --quiet analisis-bursatil.service; then
    log "Backend iniciado correctamente."
else
    warn "El backend no arranco. Probablemente falta configurar .env"
    warn "Revisa los logs con: journalctl -u analisis-bursatil -f"
fi

# ============================================================================
# 13. HTTPS con Let's Encrypt (solo si el dominio ya apunta a este servidor)
# ============================================================================
if [[ "$DOMAIN" != "_" ]]; then
    log "Instalando Certbot para HTTPS..."
    apt-get install -y certbot python3-certbot-nginx

    # Comprobar si el dominio resuelve a esta IP
    RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
    MY_IP=$(curl -s ifconfig.me)

    if [[ "$RESOLVED_IP" == "$MY_IP" ]]; then
        log "Dominio $DOMAIN apunta a este servidor. Configurando HTTPS..."
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@sarastem.com --redirect
        log "HTTPS configurado con Let's Encrypt."
    else
        warn "El dominio $DOMAIN aun no apunta a este servidor ($RESOLVED_IP vs $MY_IP)."
        warn "Cuando lo configures en Arsys, ejecuta:"
        warn "  certbot --nginx -d $DOMAIN"
    fi
else
    warn "Sin dominio configurado. Accede por IP: http://$MY_IP"
fi

# ============================================================================
# Resumen final
# ============================================================================
echo ""
echo "============================================"
echo " Despliegue completado"
echo "============================================"
echo ""
echo "  Directorio:   $APP_DIR"
echo "  Backend:      systemctl status analisis-bursatil"
echo "  Logs:         journalctl -u analisis-bursatil -f"
echo "  Nginx:        systemctl status nginx"
echo ""
echo "  PASOS SIGUIENTES:"
echo "  1. Editar credenciales:  nano $BACKEND_DIR/.env"
echo "  2. Reiniciar backend:    systemctl restart analisis-bursatil"
echo "  3. Verificar:            curl http://localhost/api/health"
echo ""
if [[ "$DOMAIN" != "_" ]]; then
echo "  URL: https://$DOMAIN"
else
echo "  URL: http://212.227.134.30"
fi
echo ""
