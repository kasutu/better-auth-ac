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

CREATE TABLE "IamRoleName" (
  id text PRIMARY KEY,
  "roleId" text NOT NULL UNIQUE REFERENCES "IamRole"(id) ON DELETE CASCADE
);

CREATE TABLE "IamRolePermission" (
  id text PRIMARY KEY,
  "roleId" text NOT NULL REFERENCES "IamRole"(id) ON DELETE CASCADE,
  "permissionKey" text NOT NULL,
  effect text NOT NULL CHECK (effect IN ('ALLOW', 'DENY')),
  UNIQUE ("roleId", "permissionKey")
);

CREATE TABLE "IamMemberRole" (
  id text PRIMARY KEY,
  "memberId" text NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  "roleId" text NOT NULL REFERENCES "IamRole"(id) ON DELETE CASCADE,
  UNIQUE ("memberId", "roleId")
);

ALTER TABLE member
  ADD COLUMN "iamRoleVersion" integer NULL;

CREATE INDEX "IamRolePermission_permissionKey_idx"
  ON "IamRolePermission" ("permissionKey");
CREATE INDEX "IamMemberRole_roleId_idx"
  ON "IamMemberRole" ("roleId");
