# Route map

Routing is hash-based and defined in `analysis-ui/src/appRoutes.ts`.

- `#/` — public landing when signed out; Projects when authenticated.
- `#/projects` — Projects home (`Repositories.tsx`) inside `AppShell`.
- `#/projects/:projectId/overview` — evidence overview.
- `#/projects/:projectId/issues` — findings and evidence inspection.
- `#/projects/:projectId/report` — report and scanner coverage.
- `#/projects/:projectId/run` — explicit run-analysis workflow.
- `#/settings/general` — appearance and account.
- `#/settings/projects` — trusted project registry.
- Unsupported and legacy hashes, including `#/activity`, fall through to Projects.

```ts
export type ProjectView='overview'|'issues'|'report';
export type AppRoute={kind:'projects'}|{kind:'project';projectId:string;view:ProjectView;target?:string;issue?:string}|{kind:'project-run';projectId:string}|{kind:'settings';section:'general'|'projects';projectId?:string};
```
