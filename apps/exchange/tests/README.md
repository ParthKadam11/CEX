# Exchange tests

```
tests/
  helpers.ts           # shared makeOrder / fund
  unit/                # one module at a time
  integration/         # MarketRuntime + WAL (no HTTP)
  e2e/                 # HTTP → engine → WAL restart
```

```bash
pnpm test              # all
pnpm test:unit         # tests/unit
pnpm test:integration  # tests/integration
pnpm test:e2e          # tests/e2e
```
