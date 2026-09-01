# Performance Baseline and Scale Governance

`pnpm benchmark:scale` records diagnostic performance evidence for the current
architecture. It does not enforce elapsed-time assertions: workstation and
shared-runner timing is too variable to be an authoritative or reliable pull
request gate. Deterministic digests, phase execution, index build counts, and
state invariants remain enforced in CI.

The command covers:

- a 10,000-detailed-person one-hour workload;
- 10,000 detailed people plus a retained 100,000-person cohort;
- independent hourly, daily, monthly, and annual phase boundaries;
- a mixed-fidelity month plus year-one and year-two annual boundary smokes;
- creation, advance, snapshot, validation, projection, gzip compression, and
  restoration timings, snapshot sizes, digests, index builds, and relocation
  path expansions.

Scheduled phase measurements restore the same authenticated starting snapshot,
position a benchmark-only clock and its active accumulator windows immediately
before each boundary, run the production phase pipeline, and validate the
resulting canonical snapshot. They measure the cost and validity of the phase
path; they are not substitutes for a continuously simulated multi-year result.

The weekly `scheduled-scale-and-browser-validation` workflow archives the JSON
result for 30 days and runs the full Chromium, Firefox, and WebKit E2E matrix.
Pull requests instead run deterministic and invariant scale smoke tests serially
with no wall-clock budget, plus the critical Chromium E2E path.

## Reference run

Captured 2026-08-31 on Windows x64, Node v22.13.0, Intel Core i7-8700K at
3.70 GHz, 12 logical CPUs, and 34,287,497,216 bytes of memory. This is a local
comparison point, not a cross-machine performance promise.

| Workload or operation | Evidence |
| --- | ---: |
| 10k detailed creation | 6,098.36 ms |
| 10k detailed one-hour advance | 607.55 ms |
| 10k snapshot / validation | 2,117.82 ms / 238.95 ms |
| 10k projection / restoration | 0.13 ms / 3,913.76 ms |
| 10k snapshot raw / gzip | 51,220,114 / 2,628,318 bytes |
| 10k + 100k cohort creation | 492.20 ms |
| 10k + 100k cohort one-hour advance | 443.36 ms |
| 10k + 100k snapshot raw / gzip | 50,790,075 / 2,159,868 bytes |
| 1k hourly / daily phase | 82.72 ms / 84.64 ms |
| 1k monthly phase | 389.19 ms; 1 relocation index; 25,806 path expansions |
| 1k annual phase | 68.85 ms |
| mixed 1k + 100k monthly phase | 1,606.22 ms; 1 relocation index; 75,500 path expansions |
| mixed year-one / year-two annual phase | 120.57 ms / 113.21 ms |

The 10k detailed and mixed-fidelity restore digests matched their source
snapshot digests. To compare a future change, run the command on comparable
hardware with the same code-side default seeds and retain the complete JSON;
investigate material shifts before establishing a budget on a dedicated stable
runner.
