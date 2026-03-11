# Guia de Despliegue — Plataforma de Analisis Bursatil

## Infraestructura

| Elemento | Detalle |
|----------|---------|
| Servidor | VPS IONOS, Ubuntu 24.04 LTS |
| IP | 212.227.134.30 |
| Dominio | plataforma-trading.sarastem.com |
| DNS | Arsys (registro A → IP del VPS) |
| BD | Supabase (PostgreSQL gestionado) |
| HTTPS | Let's Encrypt (certbot + nginx) |

## Arquitectura en el servidor

```
Navegador → Nginx (:80/:443)
               ├── /api/*  → proxy_pass → uvicorn (:8000, backend FastAPI)
               └── /*      → archivos estaticos (frontend Vite dist/)
```

- **Nginx** sirve el frontend como archivos estaticos y hace proxy reverso al backend
- **systemd** gestiona el proceso del backend (`analisis-bursatil.service`)
- **Certbot** renueva automaticamente los certificados HTTPS

## Despliegue inicial

### 1. Configurar DNS en Arsys

Panel Arsys → Dominios → `sarastem.com` → Zona DNS:

| Tipo | Nombre | Valor |
|------|--------|-------|
| A | plataforma-trading | 212.227.134.30 |

Propagacion: normalmente <1h, maximo 24h.

### 2. Subir y ejecutar el script

Desde tu Mac:

```bash
cd ~/analisis_bursatil_demo
scp deploy/setup.sh root@212.227.134.30:/root/setup.sh
ssh root@212.227.134.30
bash /root/setup.sh
```

El script hace todo automaticamente:
1. Actualiza paquetes del sistema
2. Instala Python 3.12, Node.js 20, Nginx, UFW
3. Crea usuario de servicio `analisis`
4. Clona el repositorio en `/opt/analisis-bursatil`
5. Crea entorno virtual Python e instala dependencias
6. Genera `.env` con placeholders
7. Construye el frontend (`npm run build`)
8. Crea servicio systemd para el backend
9. Configura Nginx (proxy reverso + SPA fallback)
10. Abre puertos 22, 80, 443 en UFW
11. Inicia backend y Nginx
12. Configura HTTPS con Let's Encrypt (si el DNS ya apunta al servidor)

### 3. Configurar credenciales

```bash
nano /opt/analisis-bursatil/backend/.env
```

Rellenar:
- `DATABASE_URL` — connection string de Supabase (Session Pooler, IPv4)
- `JWT_SECRET_KEY` — generar con `openssl rand -hex 32`
- Opcionalmente: claves de API para el Tutor IA

Reiniciar el backend:
```bash
systemctl restart analisis-bursatil
```

### 4. Verificar

```bash
curl http://localhost/api/health
# o desde el navegador: https://plataforma-trading.sarastem.com
```

## Actualizaciones

Para redesplegar despues de hacer push a GitHub:

```bash
ssh root@212.227.134.30
bash /root/setup.sh
```

El script detecta que el repo ya existe y hace `git pull` en vez de clonar de nuevo.

O manualmente:

```bash
ssh root@212.227.134.30
cd /opt/analisis-bursatil
git pull origin claude/stock-analysis-education-2duIc

# Si cambiaste el backend:
source backend/venv/bin/activate && pip install -e . && deactivate
systemctl restart analisis-bursatil

# Si cambiaste el frontend:
cd frontend && npm install && npm run build
```

## Comandos utiles en el servidor

```bash
# Estado del backend
systemctl status analisis-bursatil

# Logs en tiempo real
journalctl -u analisis-bursatil -f

# Reiniciar backend
systemctl restart analisis-bursatil

# Estado de Nginx
systemctl status nginx
nginx -t  # validar configuracion

# Renovar certificado HTTPS (se renueva solo, pero por si acaso)
certbot renew

# HTTPS manual si el DNS no estaba listo durante el setup
certbot --nginx -d plataforma-trading.sarastem.com
```

## Multiples apps en el mismo servidor

Todos los subdominios apuntan a la misma IP. Nginx diferencia por `server_name`.

Para añadir otra app (ej: `sarastem.com`):

1. Añadir registro A en Arsys: `@ → 212.227.134.30`
2. Crear config Nginx: `/etc/nginx/sites-available/sarastem-web`
3. Enlazar: `ln -s /etc/nginx/sites-available/sarastem-web /etc/nginx/sites-enabled/`
4. `nginx -t && systemctl reload nginx`
5. `certbot --nginx -d sarastem.com -d www.sarastem.com`

## Estructura en el servidor

```
/opt/analisis-bursatil/
├── backend/
│   ├── app/              ← codigo FastAPI
│   ├── venv/             ← entorno virtual Python
│   ├── .env              ← credenciales (NO en git)
│   └── uploads/          ← PDFs del tutor IA
├── frontend/
│   ├── src/              ← codigo fuente React
│   └── dist/             ← build de produccion (lo que sirve Nginx)
└── deploy/
    └── setup.sh          ← este script

/etc/nginx/sites-available/analisis-bursatil  ← config Nginx
/etc/systemd/system/analisis-bursatil.service ← servicio systemd
```
