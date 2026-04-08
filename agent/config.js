module.exports = {
  BACKEND_URL: process.env.BACKEND_URL || 'https://crm-pisalia-production.up.railway.app',
  AGENT_KEY: process.env.AGENT_KEY || 'captacion-agent-2024',
  POLL_INTERVAL: 5000,       // ms entre cada poll al backend
  HEARTBEAT_INTERVAL: 10000, // ms entre cada heartbeat al backend
};
