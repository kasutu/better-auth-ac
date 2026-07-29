import { Global, Module } from "@nestjs/common";
import { BetterAuthAcModule } from "@better-auth-ac/nest";
import { AccessController } from "./access.controller.js";
import { AuditController } from "./audit.controller.js";
import { AuthService } from "./auth.service.js";
import { createDatabase, DATABASE, SqliteIamStore } from "./database.js";
import { ErpService } from "./erp.service.js";
import { MembersController } from "./members.controller.js";
import { PermissionContextResolver } from "./permission-context.js";
import { ProductionController } from "./production.controller.js";
import { SessionService } from "./session.service.js";
import { SuppliesController } from "./supplies.controller.js";
import { UpdatesController } from "./updates.controller.js";
import { UpdatesService } from "./updates.service.js";

@Global()
@Module({
  providers: [
    { provide: DATABASE, useFactory: createDatabase },
    SqliteIamStore,
    AuthService,
    SessionService,
    ErpService,
    UpdatesService,
  ],
  exports: [DATABASE, SqliteIamStore, AuthService, SessionService, ErpService, UpdatesService],
})
class InfrastructureModule {}

@Module({
  imports: [
    InfrastructureModule,
    BetterAuthAcModule.forRoot({ contextResolver: PermissionContextResolver }),
  ],
  controllers: [
    SuppliesController,
    ProductionController,
    AccessController,
    MembersController,
    AuditController,
    UpdatesController,
  ],
})
export class AppModule {}
