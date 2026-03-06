# Contributing and Reuse

This project is intended to be easy to fork and reuse.

## Licensing

- This repository is distributed under the MIT License ([LICENSE](./LICENSE)).
- If you copy substantial portions, keep the license notice in place.
- Preserve attribution to:
  - [Jakkuh's fork of Lawn](https://github.com/jakkuh/lawn)
  - [Theo/Ping's original Lawn](https://github.com/pingdotgg/lawn)

## Porting Features to Other Forks

Most features here are split cleanly between:

- `convex/*` for backend logic, schema, actions, and cron behavior
- `app/routes/*` and `src/components/*` for UI behavior

When porting a feature, copy all related pieces together:

1. Schema updates in `convex/schema.ts`
2. Backend functions in `convex/*.ts`
3. UI components/routes that call those functions
4. Environment variable requirements documented in setup docs

## Security Requirements for Contributions

- Never commit API keys, private tokens, or secret files.
- Keep secrets in environment variables only.
- Validate that docs and example code use placeholders, not real credentials.

## Suggested Submission Style

- Keep changes modular and file-local when possible.
- Use descriptive commit messages to help downstream forks cherry-pick.
- Include short notes in PR descriptions about:
  - New env vars
  - Schema changes
  - Migration/rollout expectations
