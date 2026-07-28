CREATE TABLE "IamRole" (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name text NOT NULL,
  color char(7) NOT NULL,
  rank integer NOT NULL CHECK (rank > 0),
  "isProtected" boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("organizationId", name)
);

CREATE TABLE "IamRolePermission" (
  "roleId" text NOT NULL REFERENCES "IamRole"(id) ON DELETE CASCADE,
  "permissionKey" text NOT NULL,
  effect text NOT NULL CHECK (effect IN ('ALLOW', 'DENY')),
  PRIMARY KEY ("roleId", "permissionKey")
);

CREATE TABLE "IamMemberRole" (
  "memberId" text NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  "roleId" text NOT NULL REFERENCES "IamRole"(id) ON DELETE CASCADE,
  PRIMARY KEY ("memberId", "roleId")
);

CREATE TABLE "IamMemberRoleVersion" (
  "memberId" text PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 0
);

CREATE INDEX "IamRolePermission_permissionKey_idx"
  ON "IamRolePermission" ("permissionKey");
CREATE INDEX "IamMemberRole_roleId_idx"
  ON "IamMemberRole" ("roleId");
