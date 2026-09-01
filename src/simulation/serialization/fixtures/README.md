# Historical snapshot fixtures

`engine-0.44.0-schema-43.json` is an immutable canonical snapshot generated
from commit `ccfcd02` (the 0.44.0 release line). It verifies the explicit
rejection of the old locale-dependent ordering contract.

`engine-0.45.0-schema-44.json` and
`engine-0.45.0-schema-44-settlement.json` are immutable canonical snapshots
generated from commit `cfb8269` (the 0.45.0 release line). The latter includes
a real settlement whose derived runtime fields contaminated the creation input.
`engine-0.46.0-schema-45-settlement-expected.json` is its recorded canonical
target envelope from the 0.46.0 release, including authenticated migration
provenance. Current migrations continue through that behavior boundary to the
current schema rather than rewriting this historical artifact.

Fixtures are release artifacts: do not regenerate them from the current engine
to update a test expectation.
