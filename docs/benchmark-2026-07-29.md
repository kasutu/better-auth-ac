# Core evaluator benchmark

- Commit: initial ENT-173 implementation before public push
- Node.js: 22.22.2
- OS: Fedora Linux, kernel 7.1.3, x86_64
- CPU: AMD Ryzen 7 4800H, 16 logical CPUs
- Workload: 500 permissions, 20 roles, conflicting effects
- Result: 40.12 ms total

Run `npm run build && npm run benchmark` to reproduce. This developer-machine result is a
regression reference, not an SLA.
