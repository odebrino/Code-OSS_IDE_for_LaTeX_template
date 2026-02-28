# WebStorm dev setup (CO)

## Open the repo
- Open `/home/odebrino/Documents/CO` as a project (monorepo).
- Do not commit `.idea/`.

## Node interpreter
- Use Node `22.21.1` from `.nvmrc`.
- In WebStorm: Settings | Languages & Frameworks | Node.js, set the interpreter to that version (NVM is OK).

## ESLint and TypeScript
- Enable ESLint and use the project config `eslint.config.js`.
- Enable the TypeScript service and point it to `node_modules/typescript`.

## Root scripts (for Run/Debug configs)
- Build: `npm run co:build`
- Watch: `npm run co:watch`
- Test: `npm run co:test`
- Lint: `npm run co:lint`

## Debug extensions
1. Start `npm run co:watch`.
2. Launch VS Code from the repo with an extension host:
   - `./scripts/code.sh --extensionDevelopmentPath=extensions/co-diagramador`
   - `./scripts/code.sh --extensionDevelopmentPath=extensions/co-data-set`
   - `./scripts/code.sh --extensionDevelopmentPath=extensions/co-correcao`
3. Logs: VS Code Output panel -> `Diagramador`, `CO Correcao`, or `Data Set`.
