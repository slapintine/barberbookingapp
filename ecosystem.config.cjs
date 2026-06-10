module.exports = {
  apps: [
    {
      name: "queless-backend",
      cwd: "/var/www/queless.org/current/barber-booking-app/backend",
      script: "npm",
      args: "start",
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      out_file: "/var/www/queless.org/shared/logs/pm2/backend-out.log",
      error_file: "/var/www/queless.org/shared/logs/pm2/backend-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      env: {
        NODE_ENV: "production",
        PORT: "5000",
        HOST: "127.0.0.1",
        ENV_FILE: ".env.production",
      },
    },
  ],
};
