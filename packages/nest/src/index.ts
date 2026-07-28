import {
  CanActivate,
  DynamicModule,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Module,
  OnModuleInit,
  SetMetadata,
  Type,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
} from "@nestjs/common";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import {
  defineCatalog,
  evaluate,
  type AssignedRole,
  type Decision,
  type PermissionCatalog,
  type PermissionDefinition,
} from "@better-auth-ac/core";

export const PERMISSION_METADATA = Symbol("better-auth-ac:permission");
export const PERMISSION_GROUP_METADATA = Symbol("better-auth-ac:permission-group");
export const IAM_CONTEXT_RESOLVER = Symbol("better-auth-ac:context-resolver");

export interface PermissionGroupDefinition {
  key: string;
  name: string;
}

export type PermissionLeafDefinition = Omit<PermissionDefinition, "key" | "group">;

export interface VerifiedAuthorizationContext {
  organizationId: string;
  teamIds: readonly string[];
  roles: readonly AssignedRole[];
}

export interface AuthorizationContextResolver {
  resolve(context: ExecutionContext): Promise<VerifiedAuthorizationContext | null>;
}

export function PermissionGroup(key: string, name = key): ClassDecorator {
  return SetMetadata(PERMISSION_GROUP_METADATA, Object.freeze({ key, name }));
}

export function Permission(key: string, definition: PermissionLeafDefinition): MethodDecorator {
  return applyDecorators(
    SetMetadata(PERMISSION_METADATA, Object.freeze({ key, ...definition })),
    UseGuards(PermissionGuard),
  );
}

function composePermission(
  group: PermissionGroupDefinition | undefined,
  leaf: (PermissionLeafDefinition & { key: string }) | undefined,
): PermissionDefinition | undefined {
  if (!leaf) return undefined;
  if (!group) {
    throw new Error(`@Permission("${leaf.key}") requires @PermissionGroup() on its controller`);
  }
  return {
    ...leaf,
    key: `${group.key}.${leaf.key}`,
    group: group.name,
  };
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IAM_CONTEXT_RESOLVER) private readonly contexts: AuthorizationContextResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = composePermission(
      this.reflector.get<PermissionGroupDefinition>(PERMISSION_GROUP_METADATA, context.getClass()),
      this.reflector.get<PermissionLeafDefinition & { key: string }>(
        PERMISSION_METADATA,
        context.getHandler(),
      ),
    );
    if (!permission) return true;
    const verified = await this.contexts.resolve(context);
    if (!verified) throw new UnauthorizedException();
    const request = context.switchToHttp().getRequest<{ params?: Record<string, string> }>();
    const requiredTeamId = request.params?.teamId;
    const decision = evaluate({
      permission,
      roles: verified.roles,
      organizationId: verified.organizationId,
      teamIds: verified.teamIds,
      ...(permission.scope === "team" && requiredTeamId ? { requiredTeamId } : {}),
    });
    if (!decision.allowed) throw new ForbiddenException(decision.reason);
    return true;
  }
}

@Injectable()
export class PermissionCatalogService implements OnModuleInit {
  private catalog: PermissionCatalog = defineCatalog([]);

  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    const definitions: PermissionDefinition[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const instance = wrapper.instance as object | null;
      if (!instance) continue;
      const group = this.reflector.get<PermissionGroupDefinition>(
        PERMISSION_GROUP_METADATA,
        instance.constructor,
      );
      for (const methodName of this.scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
        const handler = (instance as Record<string, unknown>)[methodName];
        if (typeof handler !== "function") continue;
        const definition = composePermission(
          group,
          this.reflector.get<PermissionLeafDefinition & { key: string }>(
            PERMISSION_METADATA,
            handler,
          ),
        );
        if (definition) definitions.push(definition);
      }
    }
    this.catalog = defineCatalog(definitions);
  }

  getCatalog(): PermissionCatalog {
    return this.catalog;
  }
}

export interface BetterAuthAcNestOptions {
  contextResolver: Type<AuthorizationContextResolver>;
}

@Module({})
export class BetterAuthAcModule {
  static forRoot(options: BetterAuthAcNestOptions): DynamicModule {
    return {
      module: BetterAuthAcModule,
      imports: [DiscoveryModule],
      providers: [
        PermissionCatalogService,
        PermissionGuard,
        options.contextResolver,
        { provide: IAM_CONTEXT_RESOLVER, useExisting: options.contextResolver },
      ],
      exports: [PermissionCatalogService, PermissionGuard, IAM_CONTEXT_RESOLVER],
    };
  }
}

export function evaluateNestPermission(
  permission: PermissionDefinition,
  context: VerifiedAuthorizationContext,
  requiredTeamId?: string,
): Decision {
  return evaluate({
    permission,
    roles: context.roles,
    organizationId: context.organizationId,
    teamIds: context.teamIds,
    ...(requiredTeamId ? { requiredTeamId } : {}),
  });
}
