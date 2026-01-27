## Code Quality

### Architecture: Functional Core, Imperative Shell

**Privilege unbraided, composable strands over complected weaves.**

| Layer                                        | Responsibility           | Properties                                                                                                     |
| :------------------------------------------- | :----------------------- | :------------------------------------------------------------------------------------------------------------- |
| **Functional Core**<br>_(Pure Modules)_      | **Domain Logic**         | • Deterministic (`f(x) -> y`)<br>• Dependency-free<br>• Framework-agnostic<br>• Testable in isolation          |
| **Imperative Shell**<br>_(Composition Hubs)_ | **Integration & Effect** | • Coordinates Core + I/O<br>• Injects dependencies<br>• Manages state/effects<br>• Contains _no_ complex logic |

**Rule**: Push valid, pure values to the Core. Keep the Shell thin and focused on wiring.
