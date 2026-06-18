# Security Policy

## Reporting a vulnerability

If you discover a security issue in Pixel Gnome, please report it **privately**
so it can be addressed before public disclosure.

- **Preferred:** open a private advisory via GitHub's
  [Security → Report a vulnerability](https://github.com/labean365/pixel-gnome/security/advisories/new)
  tab.
- **Email:** office@321enterprise.com

Please include enough detail to reproduce the issue (affected version or commit,
steps, and impact). We aim to acknowledge reports within a few business days.

Please **do not** open a public issue for security problems.

## Scope

Pixel Gnome is a fully client-side, static web app — all image processing
happens in the browser and there is no backend. The most relevant classes of
issue are therefore things like cross-site scripting, unsafe handling of
untrusted image input, or supply-chain problems in build/runtime dependencies.

## Supported versions

This is an actively developed pre-1.0 project. Only the latest release and the
`main` branch are supported; fixes are not back-ported to older tags.
