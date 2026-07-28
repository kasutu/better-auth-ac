import "reflect-metadata";
import { expect, it } from "vitest";
import { Reflector } from "@nestjs/core";
import {
  Permission,
  PermissionGroup,
  PERMISSION_GROUP_METADATA,
  PERMISSION_METADATA,
} from "../src/index.js";

it("stores a controller group boundary and method leaf like Nest routes", () => {
  const definition = {
    name: "Refund",
    description: "Refund an order.",
    subject: "Order",
    action: "refund",
    scope: "organization" as const,
  };
  @PermissionGroup("order", "Orders")
  class Controller {
    @Permission("refund", definition)
    refund(): void {}
  }
  const reflector = new Reflector();
  expect(reflector.get(PERMISSION_GROUP_METADATA, Controller)).toEqual({
    key: "order",
    name: "Orders",
  });
  expect(reflector.get(PERMISSION_METADATA, Controller.prototype.refund)).toEqual({
    key: "refund",
    ...definition,
  });
});
