---
title: Function dependencies
---

# Function dependencies

Functions can be registered with `injector.setFunction()`. This is not the same as registering a [factory function](factory-dependencies.md). A factory function creates some value; a function dependency stays a function, but some of its arguments are replaced with resolved dependencies.

```ts
function closeDatabase(database: Database): void {
    database.close();
}

injector.setFunction(closeDatabase, [ Database ]);

const closeFunc = injector.getSync(closeDatabase);
closeFunc();
```

In this example the returned function no longer needs a parameter because `Database` is injected automatically.

## Pass-through parameters

You can use `null` in the parameter list to keep pass-through parameters:

```ts
function logMessage(logger: Logger, message: string): void {
    logger.log(message);
}

injector.setFunction(logMessage, [ Logger, null ]);

const log = injector.getSync(logMessage);
log("Hello World");
```

In this example only the first parameter is injected. The second parameter stays part of the returned function signature.

## Function tokens

Functions can also be qualified with one or more injection tokens:

```ts
import { InjectionToken, injector } from "@kayahr/di";

function closeDatabase(database: Database): void {
    database.close();
}

const closeDbToken = new InjectionToken<() => void>("close-db");

injector.setFunction(closeDatabase, [ Database ], { token: closeDbToken });

const closeFunc = injector.getSync(closeDbToken);
```

## Function lifetimes

Function dependencies support the normal DI lifetimes as well. This matters for scoped overrides: a singleton function wrapper resolves its injected
dependencies in the owner scope, while a transient function wrapper resolves them in the calling scope.

```ts
import { InjectionToken, Lifetime, injector } from "@kayahr/di";

const userToken = new InjectionToken<string>("user");

function getUserName(user: string): string {
    return user;
}

injector.setFunction(getUserName, [ userToken ], { lifetime: Lifetime.TRANSIENT });
```

Use `Lifetime.TRANSIENT` when the function should honor scoped dependency overrides at resolve time.
