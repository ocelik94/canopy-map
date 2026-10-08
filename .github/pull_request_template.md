## Summary

<!-- What does this change and why? -->

Closes #

## Checklist

- [ ] `pnpm lint`, `pnpm check` and `pnpm test` pass
- [ ] Tested on a phone-sized screen (and on iPhone Safari for UI changes)
- [ ] Works offline where it matters (changes go through the outbox and sync)
- [ ] UI strings added to both `src/lib/i18n/en.ts` and `de.ts`
- [ ] Schema changes come with a migration (`pnpm db:generate`)
- [ ] New dependencies pass `pnpm licenses:check`
- [ ] No exact coordinates, credentials or personal data in logs or error messages
- [ ] README or CONTRIBUTING.md updated if behaviour or setup changed
