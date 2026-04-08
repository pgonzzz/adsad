# Captación Agent

Agente local que corre en un PC dedicado para gestionar el scraping de Idealista y el envío de mensajes por WhatsApp.

## Requisitos

- Node.js 18+
- Conexión a internet
- Google Chrome instalado (para Puppeteer)
- WhatsApp instalado en tu móvil (para vincular la sesión)

## Instalación

```bash
cd agent
npm install
```

## Configuración

Crea un fichero `.env` en la carpeta `agent/`:

```env
BACKEND_URL=https://crm-pisalia-production.up.railway.app
AGENT_KEY=captacion-agent-2024
```

Puedes cambiar `AGENT_KEY` pero asegúrate de que coincide con la variable de entorno `AGENT_KEY` del backend en Railway.

## Arranque

```bash
npm start
```

Al arrancar:
1. Se abre una ventana de Chrome para WhatsApp Web — escanea el QR con tu móvil
2. Una vez vinculado, el agente empieza a sondear el backend cada 5 segundos
3. El QR también aparece en el CRM en la sección Captación (panel de estado del agente)

## Funcionamiento

El agente hace dos cosas en bucle:

### Heartbeat (cada 10s)
Envía al backend:
- Si WhatsApp está conectado (`whatsapp_connected: true/false`)
- El QR actual en base64 si WhatsApp no está vinculado

El backend actualiza el indicador de estado del agente visible en el CRM.

### Poll de tareas (cada 5s)
Pregunta al backend si hay tareas pendientes. Las tareas son creadas desde el CRM cuando:
- Pulsas "Iniciar scraping" en una campaña → tarea tipo `scrape`
- Pulsas "Enviar WhatsApp a pendientes" → tarea tipo `whatsapp_send`
- Pulsas "Enviar follow-up" → tarea tipo `whatsapp_followup`

### Tarea `scrape`
Abre Idealista con Puppeteer (ventana visible para poder resolver CAPTCHAs manualmente si aparecen), extrae los anuncios y los envía al backend como leads.

### Tarea `whatsapp_send` / `whatsapp_followup`
Envía un mensaje de WhatsApp a cada lead que tenga número de móvil (empieza por 6 o 7). La plantilla del mensaje viene configurada en la campaña.

## Sesión de WhatsApp

La sesión se guarda en `./wa_session/` (creada automáticamente). Una vez vinculada, no hace falta escanear el QR de nuevo aunque reinicies el agente.

Para vincular una nueva cuenta: borra la carpeta `wa_session/` y reinicia.

## Logs

El agente imprime logs en consola con prefijos como `[Agent]`, `[WA]`, `[Scraper]`, `[Poll]`, `[Task]`.
