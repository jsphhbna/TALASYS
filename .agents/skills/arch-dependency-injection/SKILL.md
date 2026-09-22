---
name: arch-dependency-injection
description: >-
  Decoupling components by injecting their dependencies.
---

# Dependency Injection

> **Category**: Architecture & Patterns
> **Tags**: Architecture, DI, Testing

## Policy

```
Rule: Inject Dependencies
Description: Code should depend on abstractions, not concrete instantiations.
1. Pass dependencies: Instead of instantiating database connections or API clients inside a module, pass them in as parameters or through a container.
2. Mockablility: This pattern makes testing trivial because you can pass a mock interface rather than mocking global module requires.
3. Interface boundaries: Define what the dependency needs to look like (the interface) and ensure the injected object matches it.
4. Avoid singletons where possible: Global singletons hide dependencies. Explicit injection makes the module's needs clear.
5. React Context: In React frontend applications, React Context acts as a form of dependency injection for providing global services or themes to deeply nested components.
```
