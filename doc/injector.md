---
title: Injector
---

# Injector

The `Injector` is the heart of DI. The package exports a default injector as `injector`, and you can create additional injector instances with `new Injector()`.

```ts
import { Injector, injector } from "@kayahr/di";

const defaultInjector = injector;
const customInjector = new Injector();
```

## Registering dependencies

Dependencies can be registered with `setClass`, `setFactory`, `setValue`, and `setFunction`:

```ts
const loggerToken = new InjectionToken<Logger>("console-logger");
const numberToken = new InjectionToken<number>("just-a-number");

injector.setClass(UserService);
injector.setClass(ConsoleLogger, { provide: Logger, token: loggerToken });
injector.setFactory(UserDAO, UserDAO.create, { inject: [ DBService ] });
injector.setValue(123, numberToken);
injector.setFunction(closeDatabase, [ Database ]);
```

Classes and static factory methods can also be registered with the `injectable` decorator. Functions, plain factory functions, and values can not.

Use `provide` when a class should also be resolvable through one of its base classes.

## Resolving dependencies

At least once in an application you have to resolve a root dependency manually. Choose between `get`, `getSync`, and `getAsync`:

* `get` returns a synchronous value when possible, otherwise a promise.
* `getAsync` always returns a promise.
* `getSync` always returns a synchronous value and throws when an asynchronous dependency is involved.

```ts
const userService = injector.getSync(UserService);

const userDAO = await injector.getAsync(UserDAO);

let dbService = injector.get(DBService);
if (dbService instanceof Promise) {
    dbService = await dbService;
}
```

## Check dependency existence

Use `has` if you only want to check availability:

```ts
if (injector.has(DBService)) {
    // ...
}
```

## Remove dependencies

`remove` removes the whole local provider registration matching the qualifier.

That means any qualifier alias of the same local registration is sufficient:

* `remove(Component)` also removes registrations by token or qualified type.
* `remove(componentToken)` also removes the class registration.

```ts
const componentToken = new InjectionToken<Component>("foo");

injector.setClass(Component, { token: componentToken });

injector.remove(Component); // removes Component and componentToken
// injector.remove(componentToken); // same effect
```

After the call above, none of these qualifiers resolve anymore:

```ts
injector.has(Component); // false
injector.has(componentToken); // false
```

`remove` only affects the specified scope (root scope by default). Parent-scope registrations are not touched.


## Scopes

All injector methods accept an additional `scope` option. By default all these methods use the root scope. See [Scopes](./scopes.md) documentation for details.
