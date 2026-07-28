# Releasing

All public packages use one version. Merge the version change and changelog to protected `main`,
then push the exact `vX.Y.Z` tag. Prereleases use `vX.Y.Z-channel.N`; the workflow publishes them
with the matching non-`latest` distribution tag.

Before the first release:

1. Reserve `better-auth-ac` and create or confirm the `@better-auth-ac` npm organization.
2. Configure npm trusted publishing for all five packages and this repository's `release.yml`.
3. Protect the GitHub `npm` environment with required approval.
4. Restrict token-based publishing.

If npm requires one owner publish before trusted publishing can be configured, use a short-lived
automation token once, configure trusted publishing, then revoke the token immediately. This is a
bootstrap procedure only; the repository has no manual or token-based publish workflow.
