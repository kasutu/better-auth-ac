import "reflect-metadata";
import express from "express";
import { NestFactory } from "@nestjs/core";
import type { Request, Response } from "express";
import { PermissionCatalogService } from "@better-auth-ac/nest";
import { AppModule } from "./app.module.js";
import { AuthService } from "./auth.service.js";

const port = Number(process.env.PORT ?? 3000);
const webOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173";
const app = await NestFactory.create(AppModule, { bodyParser: false });
app.enableCors({
  origin: webOrigin,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
});

const server = app.getHttpAdapter().getInstance();
const auth = app.get(AuthService);
server.all("/api/auth/*splat", (request: Request, response: Response) =>
  auth.handle(request, response),
);
server.use(express.json());

await app.init();
await auth.initialize(app.get(PermissionCatalogService).getCatalog());
await app.listen(port, "127.0.0.1");

console.log(`Pokémon ERP API: http://127.0.0.1:${port}`);
console.log(`Allowed web origin: ${webOrigin}`);
