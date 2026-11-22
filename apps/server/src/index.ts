import Fastify from "fastify";
import { HUB_NAME } from "@hub/core";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ status: "ok", service: HUB_NAME }));

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
