---
title: Scopes
---

# Scopes

DI works on the shared root scope by default. You only need explicit scopes when you want subtree-local registrations and resolves.

## Root scope by default

When no `scope` option is specified, DI reads and writes on the shared root scope from `@kayahr/scope`:

```ts
injector.setClass(Service);
const service = injector.getSync(Service);
```

That is the normal case and does not require creating any scope manually.

## Explicit scoped registrations

If you want a registration to exist only in a subtree, pass a scope explicitly:

```ts
import { createScope } from "@kayahr/scope";
import { InjectionToken, injector } from "@kayahr/di";

const userToken = new InjectionToken<string>("user");
const requestScope = createScope();

injector.setValue("alice", userToken, { scope: requestScope });
```

## Explicit scoped resolves

To resolve from a subtree, pass the same scope to `get`, `getSync`, `getAsync`, `has`, or `remove`:

```ts
const user = injector.getSync(userToken, { scope: requestScope });
```

Resolution starts in the specified scope and then walks up the real parent scope chain.

## Scoped services

You can register scoped implementations and scoped consumers together:

```ts
class RequestHandler {
    public constructor(private readonly user: string) {}

    public run(): void {
        console.log(this.user);
    }
}

injector.setClass(RequestHandler, {
    scope: requestScope,
    inject: [ userToken ]
});
injector.getSync(RequestHandler, { scope: requestScope }).run();
```

The `injectable` decorator supports the same `scope` option:

```ts
@injectable({ scope: requestScope, inject: [ userToken ] })
class RequestHandler {
    public constructor(private readonly user: string) {}

    public run(): void {
        console.log(this.user);
    }
}

injector.getSync(RequestHandler, { scope: requestScope }).run();
```

## Disposal

Singleton instances are owned by the scope in which their provider is registered. Instances implementing `Disposable` are disposed when their owning scope is disposed synchronously:

```ts
class Service {
    public [Symbol.dispose](): void {
        // Release the service synchronously.
    }
}

const serviceScope = createScope();
injector.setClass(Service, { scope: serviceScope });
injector.getSync(Service, { scope: serviceScope });

serviceScope.dispose();
```

Instances implementing `AsyncDisposable` require asynchronous disposal of their owning scope:

```ts
class Service {
    public async [Symbol.asyncDispose](): Promise<void> {
        await closeService();
    }
}

const serviceScope = createScope();
injector.setClass(Service, { scope: serviceScope });
injector.getSync(Service, { scope: serviceScope });

await serviceScope.disposeAsync();
```

Once an asynchronous singleton has been created, calling `dispose()` on its owning scope throws a `ScopeError` without disposing the scope. Use `disposeAsync()` instead. Synchronous and asynchronous singletons are disposed sequentially in reverse creation order, so a service is disposed before the dependencies used to create it. Multiple failures are aggregated. For providers registered on the shared root scope, use `resetRootScopeAsync()`.

Removing a registration also disposes its cached singleton. Use `remove(...)` for synchronous singletons and `await removeAsync(...)` for asynchronous singletons. Pending asynchronous singleton creation is invalidated when its registration or owning scope is disposed. If creation still completes, the resulting instance is disposed immediately instead of being cached.
