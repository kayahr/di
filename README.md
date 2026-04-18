# DI - Scope-Aware Dependency Injection

[GitHub] | [NPM] | [API Doc]

Simple generic dependency injection library for TypeScript.

Some features:

* Registers classes, factories, values, and functions.
* Supports synchronous and asynchronous dependency graphs.
* Supports singleton and transient lifetimes.
* Supports injection tokens, qualified types, explicit provided base classes, and scope-local registrations.
* Supports standard ECMAScript decorators but also works without decorators.
* Very small footprint.

Intentionally not supported:

* Legacy TypeScript decorators.
* Property or setter injection.

For hierarchy, ownership and disposal this library uses [@kayahr/scope].




## Installation

```sh
npm install @kayahr/di
```

## Usage

Basic example with decorators:

```ts
import { injectable, injector } from "@kayahr/di";

@injectable
class MathService {
    public add(a: number, b: number): number {
        return a + b;
    }
}

@injectable({ inject: [ MathService ] })
class Component {
    public constructor(private readonly mathService: MathService) {}

    public run(): void {
        console.log(this.mathService.add(1, 2));
    }
}

injector.getSync(Component).run();
```

Basic example without decorators:

```ts
import { injector } from "@kayahr/di";

class MathService {
    public add(a: number, b: number): number {
        return a + b;
    }
}
injector.setClass(MathService);

class Component {
    public constructor(private readonly mathService: MathService) {}

    public run(): void {
        console.log(this.mathService.add(1, 2));
    }
}
injector.setClass(Component, { inject: [ MathService ] });

injector.getSync(Component).run();
```

If you want an isolated injector instance, create one explicitly:

```ts
import { Injector } from "@kayahr/di";

const app = new Injector();
```

The methods on `Injector` mirror the default `injector` instance. The `injectable` decorator is also available on the instance itself:

```ts
import { Injector } from "@kayahr/di";

const appInjector = new Injector();

@appInjector.injectable
class AppService {}
```


## Documentation

* [Injector](doc/injector.md)
* [Scopes](doc/scopes.md)
* [Class dependencies](doc/class-dependencies.md)
* [Factory dependencies](doc/factory-dependencies.md)
* [Value dependencies](doc/value-dependencies.md)
* [Function dependencies](doc/function-dependencies.md)

## See also

* [@kayahr/scope documentation](https://kayahr.github.io/scope/)
* [ECMAScript decorators]

[API Doc]: https://kayahr.github.io/di/
[Documentation]: https://kayahr.github.io/di/documents/Documentation.html
[GitHub]: https://github.com/kayahr/di
[NPM]: https://www.npmjs.com/package/@kayahr/di
[ECMAScript decorators]: https://github.com/tc39/proposal-decorators
[@kayahr/scope]: https://kayahr.github.io/scope/
