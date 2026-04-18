---
title: Factory dependencies
---

# Factory dependencies

Factory functions and static factory methods can be registered with `injector.setFactory()`:

```ts
class Foo {}

function createFoo(): Foo {
    return new Foo();
}

injector.setFactory(Foo, createFoo);
```

Static factory methods work the same way:

```ts
class Bar {
    private constructor() {}

    public static create(): Bar {
        return new Bar();
    }
}

injector.setFactory(Bar, Bar.create);
```

Static factory methods can also be registered with the `injectable` decorator. Classes instantiated with a factory method can even have a private constructor:

```ts
class Service {
    private constructor() {}

    @injectable
    public static create(): Service {
        return new Service();
    }
}
```

The `injectable` decorator on static factory methods accepts the same options object as `injector.setFactory()`.

## Factory injection

If a factory function or method has parameters then the parameter types must be specified with the `inject` option:

```ts
class Component {
    private constructor(service: Service) {}

    @injectable({ inject: [ Service ] })
    public static create(service: Service): Component {
        return new Component(service);
    }
}
```

## Factory tokens

Factories can also be qualified with one or more injection tokens:

```ts
import { InjectionToken, injectable } from "@kayahr/di";

const componentToken = new InjectionToken<Component>("some-component");

class Component {
    @injectable({ token: componentToken })
    public static create(): Component {
        return new Component();
    }
}
```

Just like with classes, tokens are also useful for interfaces because interfaces do not exist at runtime.

## Factory lifetimes

Factories support the same lifetimes as classes:

```ts
import { Lifetime, injectable } from "@kayahr/di";

class Component {
    @injectable({ lifetime: Lifetime.TRANSIENT })
    public static create(): Component {
        return new Component();
    }
}
```

## Asynchronous dependencies

Factory functions and methods can also return promises:

```ts
class UserDAO {
    private constructor(private readonly db: Database) {}

    @injectable({ inject: [ DBService ] })
    public static async create(dbService: DBService): Promise<UserDAO> {
        return new UserDAO(await dbService.connect());
    }
}
```

If a dependency depends on an asynchronous dependency then it automatically also becomes asynchronous:

```ts
@injectable({ inject: [ UserDAO ] })
class Component {
    public constructor(userDAO: UserDAO) {}
}
```

`injector.get(Component)` now returns a promise on the first call because instance creation must wait for `UserDAO`.

## Pass-through parameters

Transient factory dependencies also support pass-through parameters:

```ts
import { Lifetime, injectable, injector } from "@kayahr/di";

class Component {
    @injectable({ inject: [ null, Service, null ], lifetime: Lifetime.TRANSIENT })
    public static create(name: string, service: Service, id: number): Component {
        return new Component();
    }
}
```

Resolve such a dependency like this:

```ts
const component = injector.getSync(Component, { args: [ "test", 32 ] });
```

Because the pass-through positions are only known from the runtime registration, `args` can not be typed precisely. TypeScript therefore does
not validate the number or types of the passed values here.
