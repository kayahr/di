---
title: Class dependencies
---

# Class dependencies

Synchronously instantiated classes with a public constructor can be registered with `injector.setClass()` or the `injectable` decorator. If the class is instantiated asynchronously or has a private constructor then you have to use a [factory method](./factory-dependencies.md) instead.

If the constructor has no parameters then no options are needed:

```ts
import { injectable, injector } from "@kayahr/di";

@injectable
class Service {}

class OtherService {}
injector.setClass(OtherService);
```

The `injectable` decorator accepts the same options object as `injector.setClass()`.

When using a custom injector instance you can also use its bound decorator directly:

```ts
import { Injector } from "@kayahr/di";

const appInjector = new Injector();

@appInjector.injectable
class AppService {}
```

## Constructor injection

If the constructor has parameters then the parameter types must be specified with the `inject` option:

```ts
@injectable({ inject: [ Service ] })
class Component {
    public constructor(service: Service) {}
}
```

TypeScript validates that the constructor parameter type matches the type used in the `inject` array. Alternatively you can inject dependencies by token.

## Class tokens

The class can be qualified with one or more injection tokens:

```ts
import { InjectionToken, injectable } from "@kayahr/di";

const componentToken = new InjectionToken<Component>("some-component");

@injectable({ token: componentToken })
class Component {}
```

Instead of specifying a single token, `token` can also be an array of tokens.

Tokens are especially useful for interfaces, because interfaces do not exist at runtime and therefore can not be used as normal DI qualifiers:

```ts
import { InjectionToken, injectable } from "@kayahr/di";

interface Adder {
    add(a: number, b: number): number;
}

const adderToken = new InjectionToken<Adder>("adder");

@injectable({ token: adderToken })
class MathService implements Adder {
    public add(a: number, b: number): number {
        return a + b;
    }
}

@injectable({ inject: [ adderToken ] })
class Component {
    public constructor(private readonly adder: Adder) {}
}
```

## Class lifetimes

Classes can be created as singletons or as transient instances. Default lifetime is `SINGLETON`, which means one shared instance per owning scope. `TRANSIENT` means that a new instance is created for every resolve.

```ts
import { Lifetime, injectable } from "@kayahr/di";

@injectable({ lifetime: Lifetime.TRANSIENT })
class Component {}
```

## Pass-through parameters

Transient dependencies allow specifying pass-through parameters which are not injected automatically and must be passed through manually when resolving the dependency directly. These parameters are marked with `null` placeholders in the `inject` array.

```ts
import { Lifetime, injectable, injector } from "@kayahr/di";

@injectable({ inject: [ null, Service, null ], lifetime: Lifetime.TRANSIENT })
class Component {
    public constructor(name: string, service: Service, id: number) {}
}
```

Resolve such a dependency like this:

```ts
const component = injector.getSync(Component, { args: [ "test", 32 ] });
```

`"test"` becomes the first constructor argument and `32` becomes the third constructor argument.

Because the pass-through positions are only known from the runtime registration, `args` can not be typed precisely. TypeScript therefore does
not validate the number or types of the passed values here.
