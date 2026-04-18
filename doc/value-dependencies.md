---
title: Value dependencies
---

# Value dependencies

Static values can be registered with `injector.setValue()`, but always through one or more tokens:

```ts
import { InjectionToken, injectable, injector } from "@kayahr/di";

const secretCodeToken = new InjectionToken<number>("secret-code");

injector.setValue(12345, secretCodeToken);

@injectable({ inject: [ secretCodeToken ] })
class Luggage {
    public constructor(combination: number) {}
}
```

If you want type-based registration then use a [class](class-dependencies.md) or [factory](factory-dependencies.md) registration instead.

## Asynchronous values

Asynchronous values can be registered as promises:

```ts
const configToken = new InjectionToken<Config>("config");

injector.setValue(Promise.resolve({ verbose: true }), configToken);

@injectable({ inject: [ configToken ] })
class Component {
    public constructor(config: Config) {
        if (config.verbose) {
            console.log("Component created");
        }
    }
}
```

If you want to inject an asynchronous value by type then register a [factory function](factory-dependencies.md) instead.
