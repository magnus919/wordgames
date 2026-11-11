# Security policy

Security fixes target the current `main` branch. No older release receives a
separate support guarantee.

Do not disclose exploitable vulnerabilities or credentials in public issues.
Use GitHub's **Security → Report a vulnerability** on this repository for private
reporting. Include affected revision, reproduction steps, impact and any proposed
mitigation. Do not access other people's data or disrupt the live service to
prove a finding. Response times depend on this project's sole maintainer.

Game packages are trusted executable site code, not a sandbox. The daily API
intentionally includes answers for client-side checking; this is an honor-system
game, not anti-cheat infrastructure. See README.md and docs/modules.md.

## Automated coverage

- Dependabot alerts and security updates are enabled in repository settings.
- `.github/dependabot.yml` checks npm, Cargo, Docker base images and GitHub
  Actions weekly. Updates arrive as pull requests for CI and maintainer review;
  they are not automatically merged or deployed.
- GitHub CodeQL default setup scans the JavaScript frontend, Rust backend and
  Actions workflows using the extended query suite. Its configuration and
  scan status live in the repository's Security settings, not a checked-in
  workflow. Review the Security tab for findings and coverage failures.
- GitHub secret scanning and push protection are enabled. Keep credentials out
  of files and Git history even when a scanner does not recognize a provider.

Dependency and static-analysis alerts are review inputs, not proof that a
release is safe. Container package vulnerability scanning is not supplied by
Dependabot's Docker base-image update checks.
