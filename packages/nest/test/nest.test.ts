import "reflect-metadata";
import { expect, it } from "vitest";
import { Reflector } from "@nestjs/core";
import {
  Permission,
  PermissionCatalogService,
  PermissionGroup,
  PERMISSION_GROUP_METADATA,
  PERMISSION_METADATA,
} from "../src/index.js";

it("stores a controller group boundary and method leaf like Nest routes", () => {
  const fields = ["id", "total"];
  const definition = {
    name: "Refund",
    description: "Refund an order.",
    subject: "Order",
    action: "refund",
    scope: "organization" as const,
    fields,
  };
  @PermissionGroup("order")
  class Controller {
    @Permission("refund", definition)
    refund(): void {}
  }
  const reflector = new Reflector();
  expect(reflector.get(PERMISSION_GROUP_METADATA, Controller)).toEqual({
    key: "order",
    name: "Order",
  });
  expect(reflector.get(PERMISSION_METADATA, Controller.prototype.refund)).toEqual({
    key: "refund",
    ...definition,
  });
  expect(
    Object.isFrozen(reflector.get(PERMISSION_METADATA, Controller.prototype.refund).fields),
  ).toBe(true);

  @PermissionGroup("iam", { name: "Access control" })
  class NamedController {}
  expect(reflector.get(PERMISSION_GROUP_METADATA, NamedController)).toEqual({
    key: "iam",
    name: "Access control",
  });
});

it("carries decorator fields into the discovered catalog", () => {
  @PermissionGroup("order")
  class Controller {
    @Permission("refund", {
      name: "Refund",
      description: "Refund an order.",
      subject: "Order",
      action: "refund",
      scope: "organization",
      fields: ["id", "total"],
    })
    refund(): void {}
  }

  const reflector = new Reflector();
  const service = new PermissionCatalogService(
    { getControllers: () => [{ instance: new Controller() }] } as never,
    { getAllMethodNames: () => ["refund"] } as never,
    reflector,
  );
  service.onModuleInit();

  expect(service.getCatalog().permissions[0]?.fields).toEqual(["id", "total"]);
});
