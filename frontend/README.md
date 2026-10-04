# React + Vite

## Admin Command Center

The `/admin` page uses the current PROtv shell. Authorized administrators start
at Overview; grouped navigation opens the existing tools using local mode state.
Upload Content contains File, URL and Add Content With Rights workflows.

Visited tool panels remain mounted while hidden so section changes retain drafts
and do not stop their existing polling. Upload, processing and rights-draft saving
pause Admin section switching. Leaving Admin after opening a tool warns that
drafts or operation monitoring may be lost; no draft persistence across reloads
is implied. The overview does not fetch metrics or mount tools in advance.

Rendered regression coverage is in `test/adminCommandCenter.test.js`. Run
`node --test test/adminCommandCenter.test.js`, `npm run lint` and `npm run build`
before visual review. Browser review of authorized states should use local
fixtures, not production actions or an authorization bypass in application code.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
