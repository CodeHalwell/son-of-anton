# Son of Anton IDE

Son of Anton is an open-source code editor forked from [Code - OSS](https://github.com/microsoft/vscode). It provides the same powerful editing, debugging, and extensibility features — with all Microsoft telemetry, proprietary services, and branding removed.

## What's Different from Code - OSS

- **No telemetry** — All Application Insights instrumentation, 1DS telemetry appenders, and A/B testing (tas-client) have been gutted to no-op stubs. Telemetry is fully disabled by default with no way to re-enable it.
- **No Microsoft service dependencies** — All `go.microsoft.com/fwlink`, `aka.ms`, `vscode-cdn.net`, and `c.s-microsoft.com` URLs have been replaced with direct links or removed. The editor makes zero calls to Microsoft infrastructure at runtime.
- **Open VSX marketplace** — Extensions are sourced from [Open VSX](https://open-vsx.org) instead of the Visual Studio Marketplace.
- **Independent branding** — All user-facing strings reference "Son of Anton" instead of "Visual Studio Code".

## The Repository

This repository contains the full source for Son of Anton IDE. It is available to everyone under the [MIT license](LICENSE.txt).

## Building and Running

Son of Anton uses the same build system as Code - OSS. To get started:

1. Clone the repository
2. Install dependencies: `yarn`
3. Build: `yarn compile`
4. Run: `./scripts/code.sh` (Linux), `./scripts/code.bat` (Windows), or `./scripts/code-darwin.sh` (macOS)

See the upstream [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute) wiki for detailed build instructions — the process is identical.

## Contributing

There are many ways to participate:

* [Submit bugs and feature requests](https://github.com/CodeHalwell/Son-Of-Anton/issues)
* Review [source code changes](https://github.com/CodeHalwell/Son-Of-Anton/pulls)

If you are interested in contributing directly to the code base, please see:

* [How to build and run from source](https://github.com/microsoft/vscode/wiki/How-to-Contribute)
* [The development workflow, including debugging and running tests](https://github.com/microsoft/vscode/wiki/How-to-Contribute#debugging)
* [Coding guidelines](https://github.com/microsoft/vscode/wiki/Coding-Guidelines)

## Bundled Extensions

Son of Anton includes a set of built-in extensions located in the [extensions](extensions) folder, including grammars and snippets for many languages. Extensions that provide rich language support (inline suggestions, Go to Definition) for a language have the suffix `language-features`. For example, the `json` extension provides coloring for `JSON` and the `json-language-features` extension provides rich language support for `JSON`.

## Development Container

This repository includes a Dev Containers / GitHub Codespaces development container.

* For [Dev Containers](https://code.visualstudio.com/docs/devcontainers/containers), use the **Dev Containers: Clone Repository in Container Volume...** command which creates a Docker volume for better disk I/O on macOS and Windows.
* For Codespaces, use the **Codespaces: Create New Codespace** command.

Docker / the Codespace should have at least **4 Cores and 6 GB of RAM (8 GB recommended)** to run a full build. See the [development container README](.devcontainer/README.md) for more information.

## Upstream

Son of Anton is forked from [Microsoft's Code - OSS](https://github.com/microsoft/vscode) repository. We gratefully acknowledge the work of the VS Code team and community contributors. See [NOTICE](NOTICE.txt) for full attribution.

## License

Copyright (c) 2015 - present Microsoft Corporation
Copyright (c) 2024 - present Son of Anton Contributors

Licensed under the [MIT](LICENSE.txt) license.
