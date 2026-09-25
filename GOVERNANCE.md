# Governance

Sastra is maintained by Sastra Cloud, the company that also runs the hosted
service. The application is fully open source under the AGPL-3.0; the hosted
service adds operations (provisioning, billing, upgrades, backups, support), not
features. Self-hosted and hosted installations run the same releases.

## Roles

- **Maintainers** review and merge pull requests, cut releases, and decide the
  roadmap. The current maintainers are listed in the repository's CODEOWNERS
  once the public repository is set up.
- **Contributors** are everyone who has had a change merged.

## How decisions are made

- Small changes are decided in the pull request.
- Larger changes start as an issue. Maintainers decide, in the open, with the
  needs of small publishing and translation teams as the deciding factor.
- Breaking changes and new environment variables are called out in release
  notes and in `docs/self-hosting/`.

## Releases

Releases are semantic versions tagged on `main`. Each tag builds signed
multi-architecture images at `ghcr.io/sastra-cloud/sastra` with an SBOM. The
hosted service upgrades internal instances first, then customers.
