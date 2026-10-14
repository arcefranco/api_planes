module.exports = {
  apps: [
    {
      name: "pa_api",
      script: "./index.js",
      ignore_watch: ["logs", "node_modules"],
      watch: true,
      node_args: "-r dotenv/config",
      env: {
        DOTENV_CONFIG_PATH: "./.env",
      },
    },
  ],
};
