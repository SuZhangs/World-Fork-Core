import { buildApp } from "./app.js";

const start = async () => {
  const app = await buildApp();
  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
