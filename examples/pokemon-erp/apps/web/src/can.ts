import { Can as CaslCan, type CanProps } from "@casl/react";
import type { ComponentType } from "react";
import type { AppAbility } from "./generated/better-auth-ac";

export const Can = CaslCan as ComponentType<CanProps<AppAbility>>;
