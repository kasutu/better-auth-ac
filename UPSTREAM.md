# Upstream record

- Repository: https://github.com/seanfilimon/better-auth-iam
- Commit: `cf2761e49e3190a4eb76a38e0a2edc917ad6f698`
- Reviewed: 2026-07-29
- License: Apache-2.0

The package layout, evaluator behavior, and Better Auth plugin shape were reviewed. The new
implementation was written from scratch because the upstream authorization model is AWS-specific
and the database and endpoint paths are incomplete. No upstream source file is copied.

If modified upstream code is added later, name the source path and commit in this file and add a
prominent modification notice to that file.
